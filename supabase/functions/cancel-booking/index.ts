// deno-lint-ignore-file no-explicit-any
// cancel-booking: either party cancels. If the deposit was already paid, refund it on Stripe and
// reverse the cook's ledger credit (append-only: a new negative `refund` entry). JWT-scoped.
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

const input = z.object({ bookingId: z.string().uuid(), reason: z.string().max(500).optional() });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });
  try {
    const db = admin();
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData, error: userErr } = await db.auth.getUser(jwt);
    if (userErr || !userData.user) return json(401, { error: 'unauthorized' });
    const uid = userData.user.id;

    const { error: rlErr } = await db.rpc('check_rate_limit', {
      p_action: 'cancel_booking', p_max_count: 15, p_window: '10 minutes', p_subject: uid,
    });
    if (rlErr) return json(429, { error: 'Too many attempts. Please wait a few minutes and try again.' });

    const parsed = input.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: 'invalid input' });
    const { bookingId } = parsed.data;

    const { data: bk } = await db.from('bookings')
      .select('id, customer_id, kitchen_id, status, deposit_pi_id, deposit_cents, service_fee_cents, kitchens!inner(owner_id)')
      .eq('id', bookingId).maybeSingle();
    if (!bk) return json(404, { error: 'Booking not found.' });
    const ownerId = (bk as any).kitchens.owner_id;
    if ((bk as any).customer_id !== uid && ownerId !== uid) return json(403, { error: 'Not your booking.' });
    if (!['pending_deposit', 'confirmed'].includes((bk as any).status)) return json(409, { error: 'This booking cannot be cancelled.' });

    let refunded = false;
    if ((bk as any).status === 'confirmed' && (bk as any).deposit_pi_id) {
      try {
        // Idempotency key: dedupes a double-submit/retry on Stripe's side.
        await stripe.refunds.create({ payment_intent: (bk as any).deposit_pi_id }, { idempotencyKey: `refund_${bookingId}` });
        refunded = true;
      } catch (_e) { /* refund failed — still cancel; reconcile of a failed refund is manual */ }
    }

    // finalize_booking_cancel does the ledger reversal + status update under an advisory lock,
    // re-checking status before writing — closes a real race where two concurrent cancel calls
    // (double-tap, or a client retry racing a slow first request) could each independently insert
    // a refund ledger entry for the same booking, double-deducting the cook's balance even though
    // Stripe's idempotency key ensures only one real refund happens.
    const { error: finErr } = await db.rpc('finalize_booking_cancel', { p_booking_id: bookingId, p_refunded: refunded });
    if (finErr) return json(500, { error: 'Could not finalize the cancellation.' });

    await db.from('quotes').update({ status: 'declined' }).eq('id', (bk as any).quote_id ?? '00000000-0000-0000-0000-000000000000');
    const other = uid === ownerId ? (bk as any).customer_id : ownerId;
    try { await db.rpc('notify', { p_user: other, p_kind: 'booking', p_title: 'Booking cancelled', p_body: refunded ? 'A booking was cancelled and the deposit refunded.' : 'A booking was cancelled.' }); } catch (_e) { /* best-effort */ }

    return json(200, { status: refunded ? 'refunded' : 'cancelled', refunded });
  } catch (_e) {
    return json(500, { error: 'Could not cancel the booking.' });
  }
});
