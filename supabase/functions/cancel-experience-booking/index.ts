// deno-lint-ignore-file no-explicit-any
// cancel-experience-booking: a customer cancels their confirmed experience booking. Applies the
// experience's cancellation policy (flexible=24h / standard=48h / strict=none) against the session
// start; if within the free-cancel window issues a FULL Stripe refund, then finalize_experience_cancel
// claws back the cook's ledger credit + releases the seat. Outside the window (or strict) → no refund,
// booking cancelled, seat stays consumed. Full payment upfront model.
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
function admin() {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } });
}
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2024-06-20', httpClient: Stripe.createFetchHttpClient() });
const WINDOW_HOURS: Record<string, number | null> = { flexible: 24, standard: 48, strict: null }; // null = never refundable

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

    const parsed = input.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: 'invalid input' });

    const { data: b } = await db.from('bookings')
      .select('id, customer_id, status, deposit_cents, deposit_pi_id, session_id, experiences(cancellation_policy)')
      .eq('id', parsed.data.bookingId).maybeSingle();
    if (!b || b.customer_id !== uid) return json(404, { error: 'Booking not found.' });
    if (b.booking_kind !== undefined && b.booking_kind !== null && b.booking_kind !== 'experience') { /* keep tolerant */ }
    if (!['confirmed', 'pending_deposit'].includes(b.status)) return json(409, { error: 'This booking can’t be cancelled.' });

    // resolve the session start to apply the policy window
    const { data: s } = await db.from('experience_sessions').select('starts_at').eq('id', b.session_id).maybeSingle();
    const startsAt = s?.starts_at ? new Date(s.starts_at).getTime() : 0;
    const policy = (b as any).experiences?.cancellation_policy ?? 'strict';
    const win = WINDOW_HOURS[policy];
    const withinWindow = win !== null && win !== undefined && Date.now() < startsAt - win * 3600_000;

    let refundedCents = 0;
    if (b.status === 'confirmed' && withinWindow) {
      refundedCents = b.deposit_cents ?? 0;
      if (refundedCents > 0 && b.deposit_pi_id) {
        // Idempotency key (audit High finding): dedupes a double-submit/retry on Stripe's side.
        try { await stripe.refunds.create({ payment_intent: b.deposit_pi_id }, { idempotencyKey: `refund_${b.id}` }); }
        catch (_e) { return json(502, { error: 'Refund could not be processed. Please contact support.' }); }
      }
    }
    // pending_deposit never had a settled charge → refundedCents stays 0 (just cancel + free the seat)
    if (b.status === 'pending_deposit') { await db.rpc('release_experience_seats', { p_booking: b.id }); }

    const { error: finErr } = await db.rpc('finalize_experience_cancel', { p_booking: b.id, p_refunded_cents: refundedCents });
    if (finErr) return json(500, { error: 'Could not finalize the cancellation.' });

    return json(200, { refundedCents, status: refundedCents > 0 ? 'refunded' : 'cancelled' });
  } catch (_e) {
    return json(500, { error: 'Could not cancel this booking. Please try again.' });
  }
});
