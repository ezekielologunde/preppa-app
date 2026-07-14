// deno-lint-ignore-file no-explicit-any
// accept-quote-and-deposit: customer accepts a quote → creates a booking (pending_deposit) and a
// Stripe PaymentIntent for the deposit (service fee + cook's deposit) on Preppa. The booking is
// finalized/confirmed and the cook credited by the reconcile trigger once the deposit is paid.
// PrepPlus members: Preppa's service fee is waived (0%) — computed server-side, never trusting the client.
//
// SECURITY: the accept step itself (lock, re-check quote status, refuse if the request already has
// an active booking, expire competing quotes) all happens inside the accept_quote() Postgres RPC —
// see migration critical_fix_quote_double_booking_lock. That closes a Critical finding: two
// different quotes on the same service_request could previously both be accepted, paid, and
// confirmed (this function's old idempotency key only deduped repeat calls for the SAME quote).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';
import { z } from 'https://esm.sh/zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
}
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2024-06-20', httpClient: Stripe.createFetchHttpClient() });
function admin() {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } });
}
// accept_quote() relies on auth.uid() for its ownership check, so it must be called with the
// caller's own JWT (not the service-role admin client, which has no JWT/auth.uid() context).
function asUser(jwt: string) {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
}
async function getOrCreateCustomer(db: any, uid: string, email: string | null): Promise<string> {
  const { data: prof } = await db.from('profiles').select('stripe_customer_id').eq('id', uid).maybeSingle();
  if (prof?.stripe_customer_id) return prof.stripe_customer_id as string;
  const customer = await stripe.customers.create({ email: email ?? undefined, metadata: { user_id: uid } });
  await db.from('profiles').update({ stripe_customer_id: customer.id }).eq('id', uid);
  return customer.id;
}

const input = z.object({ quoteId: z.string().uuid() });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });
  try {
    const db = admin();
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData, error: userErr } = await db.auth.getUser(jwt);
    if (userErr || !userData.user) return json(401, { error: 'unauthorized' });
    const uid = userData.user.id;
    const email = userData.user.email ?? null;

    const parsed = input.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: 'invalid input', issues: parsed.error.issues });
    const { quoteId } = parsed.data;

    const dbAsUser = asUser(jwt);
    const { data: accepted, error: acceptErr } = await dbAsUser.rpc('accept_quote', { p_quote_id: quoteId }).single();
    if (acceptErr || !accepted) {
      const code = (acceptErr as any)?.code;
      if (code === 'P0010') return json(404, { error: 'Quote not found.' });
      if (code === '42501') return json(403, { error: 'Not your request.' });
      if (code === 'P0011') return json(409, { error: 'This quote can no longer be accepted.' });
      if (code === 'P0012') return json(409, { error: 'This request already has an active booking.' });
      return json(500, { error: 'Could not start your booking. Please try again.' });
    }
    const bk = accepted as any;

    if (bk.reused) {
      const { data: existing } = await dbAsUser.from('bookings').select('deposit_pi_id').eq('id', bk.booking_id).maybeSingle();
      let clientSecret: string | null = null;
      if (existing?.deposit_pi_id) clientSecret = (await stripe.paymentIntents.retrieve(existing.deposit_pi_id)).client_secret;
      return json(200, { bookingId: bk.booking_id, clientSecret, reused: true });
    }

    const stripeCustomerId = await getOrCreateCustomer(db, uid, email);
    const idem = 'bk_' + quoteId;
    const pi = await stripe.paymentIntents.create({
      amount: bk.deposit_cents, currency: 'usd', customer: stripeCustomerId,
      automatic_payment_methods: { enabled: true },
      metadata: { booking_id: bk.booking_id, customer_id: uid, kitchen_id: bk.out_kitchen_id },
    }, { idempotencyKey: idem });
    await db.from('bookings').update({ deposit_pi_id: pi.id }).eq('id', bk.booking_id);

    return json(200, { bookingId: bk.booking_id, clientSecret: pi.client_secret, depositCents: bk.deposit_cents, totalCents: bk.amount_cents });
  } catch (_e) {
    return json(500, { error: 'Could not start your booking. Please try again.' });
  }
});
