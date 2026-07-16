// deno-lint-ignore-file no-explicit-any
// complete-booking: mark a confirmed booking as completed. Either party may call it. If the
// booking has an unpaid balance (rfq bookings only -- quote total minus the deposit already
// collected at accept_quote time), attempts to charge it off-session on the customer's saved
// card before marking complete. A declined/failed charge never blocks completion -- the job
// already happened -- it's surfaced back to the caller so the UI can prompt the customer to
// retry or pay another way; balance_pi_id stays null so a later completion-triggered call (or a
// future manual retry endpoint) can attempt it again. JWT-scoped.
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

const input = z.object({ bookingId: z.string().uuid() });

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
      p_action: 'complete_booking', p_max_count: 15, p_window: '10 minutes', p_subject: uid,
    });
    if (rlErr) return json(429, { error: 'Too many attempts. Please wait a few minutes and try again.' });

    const parsed = input.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: 'invalid input' });
    const { bookingId } = parsed.data;

    const { data: bk } = await db.from('bookings')
      .select('id, customer_id, kitchen_id, status, booking_kind, kitchens!inner(owner_id)')
      .eq('id', bookingId).maybeSingle();
    if (!bk) return json(404, { error: 'Booking not found.' });
    const ownerId = (bk as any).kitchens.owner_id;
    if ((bk as any).customer_id !== uid && ownerId !== uid) return json(403, { error: 'Not your booking.' });
    if (!['confirmed', 'in_progress'].includes((bk as any).status)) return json(409, { error: 'This booking cannot be completed.' });

    let balanceCharged = false;
    let balanceChargeError: string | null = null;

    if ((bk as any).booking_kind === 'rfq') {
      const { data: reserved, error: reserveErr } = await db.rpc('reserve_balance_charge', { p_booking_id: bookingId }).maybeSingle();
      if (reserveErr) {
        // "No balance owed" / "already charged" are expected, non-error outcomes for most
        // bookings (fully-prepaid quotes, or a completion retry after a prior success) --
        // only surface a message for anything else.
        if (!/no balance owed|already charged/i.test(reserveErr.message ?? '')) {
          balanceChargeError = reserveErr.message ?? 'balance_reserve_failed';
        }
      } else if (reserved && (reserved as any).balance_cents > 0) {
        const balanceCents = (reserved as any).balance_cents as number;
        const customerId = (reserved as any).stripe_customer_id as string | null;
        try {
          if (!customerId) throw Object.assign(new Error('no_payment_method'), { code: 'no_payment_method' });
          const pmList = await stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 1 });
          const pm = pmList.data[0]?.id;
          if (!pm) throw Object.assign(new Error('no_payment_method'), { code: 'no_payment_method' });

          const pi = await stripe.paymentIntents.create(
            {
              amount: balanceCents,
              currency: 'usd',
              customer: customerId,
              payment_method: pm,
              off_session: true,
              confirm: true,
              metadata: { booking_id: bookingId, kind: 'balance' },
            },
            { idempotencyKey: `bal_${bookingId}` },
          );

          if (pi.status === 'succeeded' || pi.status === 'processing' || pi.status === 'requires_capture') {
            await db.rpc('finalize_balance_charge', { p_booking_id: bookingId, p_stripe_pi_id: pi.id, p_success: true });
            balanceCharged = true;
          } else {
            balanceChargeError = `unexpected_status_${pi.status}`;
            await db.rpc('finalize_balance_charge', { p_booking_id: bookingId, p_stripe_pi_id: null, p_success: false });
          }
        } catch (e: any) {
          balanceChargeError = e?.code ?? e?.raw?.code ?? e?.message ?? 'charge_failed';
          await db.rpc('finalize_balance_charge', { p_booking_id: bookingId, p_stripe_pi_id: null, p_success: false });
        }
      }
    }

    // Safety net: whatever happened to the balance charge above, the job itself already
    // happened -- always mark complete. finalize_balance_charge already does this when it ran,
    // this is a no-op then; it's the only path when booking_kind !== 'rfq' or no balance was owed.
    await db.from('bookings').update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', bookingId).in('status', ['confirmed', 'in_progress']);

    const other = uid === ownerId ? (bk as any).customer_id : ownerId;
    try {
      await db.rpc('notify', {
        p_user: other, p_kind: 'booking', p_title: 'Booking completed',
        p_body: balanceChargeError ? 'A booking was marked complete. The remaining balance could not be charged yet.' : 'A booking was marked complete.',
      });
    } catch (_e) { /* best-effort */ }

    return json(200, { status: 'completed', balanceCharged, balanceChargeError });
  } catch (_e) {
    return json(500, { error: 'Could not complete the booking.' });
  }
});
