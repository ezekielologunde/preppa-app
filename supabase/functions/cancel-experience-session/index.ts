// deno-lint-ignore-file no-explicit-any
// cancel-experience-session: a cook cancels one of their sessions. Cook-initiated → EVERY live booking
// gets a full refund (confirmed → Stripe refund + ledger clawback via finalize_experience_cancel;
// pending → just cancelled + seat released), each customer is notified, and the session is marked
// cancelled. Kitchen-ownership enforced.
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

const input = z.object({ sessionId: z.string().uuid() });

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

    const { data: s } = await db.from('experience_sessions')
      .select('id, kitchen_id, status, starts_at, experiences(title)')
      .eq('id', parsed.data.sessionId).maybeSingle();
    if (!s) return json(404, { error: 'Session not found.' });
    const { data: k } = await db.from('kitchens').select('id').eq('id', s.kitchen_id).eq('owner_id', uid).maybeSingle();
    if (!k) return json(403, { error: 'Not your session.' });

    // live bookings on this session
    const { data: bookings } = await db.from('bookings')
      .select('id, customer_id, status, deposit_cents, deposit_pi_id')
      .eq('session_id', s.id).in('status', ['confirmed', 'pending_deposit']);

    let refunded = 0;
    const title = (s as any).experiences?.title ?? 'your experience';
    for (const b of (bookings ?? [])) {
      let refundCents = 0;
      if (b.status === 'confirmed') {
        refundCents = b.deposit_cents ?? 0;
        if (refundCents > 0 && b.deposit_pi_id) { try { await stripe.refunds.create({ payment_intent: b.deposit_pi_id }); } catch (_e) { /* continue; admin can reconcile */ } }
      } else {
        await db.rpc('release_experience_seats', { p_booking: b.id });
      }
      await db.rpc('finalize_experience_cancel', { p_booking: b.id, p_refunded_cents: refundCents });
      if (refundCents > 0) refunded++;
      try { await db.rpc('notify', { p_user: b.customer_id, p_kind: 'booking', p_title: 'Session cancelled', p_body: `The host cancelled “${title}”. ${refundCents > 0 ? 'You’ve been fully refunded.' : 'Your booking was cancelled.'}` }); } catch (_e) { /* non-fatal */ }
    }

    await db.from('experience_sessions').update({ status: 'cancelled' }).eq('id', s.id);
    return json(200, { cancelledBookings: (bookings ?? []).length, refunded });
  } catch (_e) {
    return json(500, { error: 'Could not cancel the session. Please try again.' });
  }
});
