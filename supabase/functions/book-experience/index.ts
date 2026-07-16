// deno-lint-ignore-file no-explicit-any
// book-experience: instant booking for a published Experience. Atomically reserves seats + creates
// a bookings row (kind='experience', deposit=full) via create_experience_booking (FOR UPDATE lock),
// then mints a Stripe PaymentIntent with metadata.booking_id. reconcile_paid_pi confirms the booking
// + credits the cook (85% − Stripe fee) on payment — zero new money code. The client confirms the PI
// in CardPaymentSheet. Full payment upfront.
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

const input = z.object({
  experienceId: z.string().uuid(),
  sessionId: z.string().uuid(),
  guests: z.number().int().min(1).max(200),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    // user-scoped client so create_experience_booking sees auth.uid() = the customer
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json(401, { error: 'unauthorized' });

    const { error: rlErr } = await userClient.rpc('check_rate_limit', {
      p_action: 'book_experience', p_max_count: 15, p_window: '10 minutes',
    });
    if (rlErr) return json(429, { error: 'Too many attempts. Please wait a few minutes and try again.' });

    const parsed = input.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: 'invalid input', issues: parsed.error.issues });
    const p = parsed.data;

    // atomic seat claim + booking (FOR UPDATE session lock)
    const { data: res, error: rpcErr } = await userClient.rpc('create_experience_booking', {
      p_experience: p.experienceId, p_session: p.sessionId, p_guests: p.guests,
    });
    if (rpcErr) {
      const msg = rpcErr.message || 'Could not book this session.';
      if (/guests out of range/.test(msg)) return json(400, { error: 'Choose a valid number of guests.' });
      if (/session (not open|already started|not found)/.test(msg)) return json(409, { error: 'That session is no longer bookable.', code: 'unavailable' });
      if (/experience not available/.test(msg)) return json(409, { error: 'This experience is no longer available.', code: 'unavailable' });
      return json(400, { error: msg });
    }
    if (res?.full) return json(409, { error: 'That session just filled — pick another.', code: 'full' });
    const bookingId = res?.bookingId as string;
    const amountCents = res?.amountCents as number;
    if (!bookingId || !amountCents) return json(500, { error: 'Could not start your booking.' });

    // mint the PaymentIntent (customer confirms with their card in CardPaymentSheet)
    const pi = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: 'usd',
        payment_method_types: ['card'],
        description: 'Preppa experience booking',
        metadata: { booking_id: bookingId },
      },
      { idempotencyKey: 'expbk_' + bookingId },
    );

    return json(200, { bookingId, clientSecret: pi.client_secret, amountCents });
  } catch (_e) {
    return json(500, { error: 'Could not start your booking. Please try again.' });
  }
});
