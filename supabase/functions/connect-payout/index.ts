// deno-lint-ignore-file no-explicit-any
// SECURITY: cash-out amount/lock now lives in reserve_payout()/finalize_payout() (Postgres RPCs,
// see migrations critical_fix_payout_double_spend_lock and
// critical_fix_finalize_payout_service_role_only). Fixes a Critical finding: this function used to
// read the balance and call Stripe with no lock or idempotency key, so a double/multi-submit cash
// out could extract more real money than the kitchen's ledger balance allowed.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';
import { corsHeaders, json } from '../_shared/cors.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});

function admin() {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } });
}

// reserve_payout relies on auth.uid() for its ownership check, so it must be called with the
// caller's own JWT. finalize_payout is service_role-only (never callable by the client directly) —
// it's invoked below via the admin() client, after this function has itself confirmed (via
// reserve_payout, which checked ownership) that a real Stripe transfer either succeeded or failed.
function asUser(jwt: string) {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });

  try {
    const db = admin();
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await db.auth.getUser(jwt);
    const userId = userData.user?.id;
    if (!userId) return json(401, { error: 'unauthorized' });

    const { kitchenId } = await req.json();
    if (typeof kitchenId !== 'string') return json(400, { error: 'kitchenId required' });

    const dbAsUser = asUser(jwt);
    const { data: reserved, error: reserveErr } = await dbAsUser.rpc('reserve_payout', { p_kitchen_id: kitchenId }).single();
    if (reserveErr || !reserved) {
      const code = (reserveErr as any)?.code;
      if (code === '42501') return json(403, { error: 'not your kitchen' });
      if (code === 'P0001') return json(400, { error: 'Finish payout setup first.' });
      if (code === 'P0002') return json(400, { error: 'Nothing to cash out yet.' });
      return json(500, { error: 'Payout failed. Please try again.' });
    }
    const { payout_id, amount_cents, stripe_account_id } = reserved as any;

    try {
      const transfer = await stripe.transfers.create({
        amount: amount_cents,
        currency: 'usd',
        destination: stripe_account_id,
        metadata: { kitchen_id: kitchenId, payout_id },
      }, { idempotencyKey: `payout_${payout_id}` });

      await db.rpc('finalize_payout', { p_payout_id: payout_id, p_stripe_transfer_id: transfer.id, p_success: true });
      return json(200, { amountCents: amount_cents });
    } catch (stripeErr) {
      await db.rpc('finalize_payout', { p_payout_id: payout_id, p_stripe_transfer_id: null, p_success: false });
      throw stripeErr;
    }
  } catch (_e) {
    return json(500, { error: 'Payout failed. Please try again.' });
  }
});
