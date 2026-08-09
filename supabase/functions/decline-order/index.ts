// deno-lint-ignore-file no-explicit-any
// decline-order: cook cancels a paid order (confirmed/preparing/ready -> cancelled). If it was
// paid, refund it on Stripe and reverse the cook's ledger credit (append-only: a new negative
// `refund` entry) -- mirrors cancel-booking/finalize_booking_cancel exactly. JWT-scoped.
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
function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing required secret: ${name}`);
  return v;
}
const stripe = new Stripe(requireEnv('STRIPE_SECRET_KEY'), { apiVersion: '2024-06-20', httpClient: Stripe.createFetchHttpClient() });
function admin() {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
}

const input = z.object({ orderId: z.string().uuid(), reason: z.string().max(500).optional() });
const CANCELLABLE = new Set(['confirmed', 'preparing', 'ready']);

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
      p_action: 'decline_order', p_max_count: 20, p_window: '10 minutes', p_subject: uid,
    });
    if (rlErr) return json(429, { error: 'Too many attempts. Please wait a few minutes and try again.' });

    const parsed = input.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: 'invalid input' });
    const { orderId } = parsed.data;

    const { data: order } = await db.from('orders')
      .select('id, status, pay_status, kitchen_id, kitchens!inner(owner_id)')
      .eq('id', orderId).maybeSingle();
    if (!order) return json(404, { error: 'Order not found.' });
    const ownerId = (order as any).kitchens.owner_id;
    if (ownerId !== uid) return json(403, { error: 'Not your order.' });
    if (!CANCELLABLE.has((order as any).status)) return json(409, { error: 'This order can no longer be cancelled.' });

    let refunded = false;
    if ((order as any).pay_status === 'paid') {
      const { data: pi } = await db.from('payment_intents')
        .select('stripe_payment_intent_id').eq('order_id', orderId).eq('status', 'succeeded')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (pi?.stripe_payment_intent_id) {
        try {
          // Idempotency key: dedupes a double-submit/retry on Stripe's side.
          await stripe.refunds.create({ payment_intent: pi.stripe_payment_intent_id }, { idempotencyKey: `refund_order_${orderId}` });
          refunded = true;
        } catch (_e) { /* refund failed -- still cancel; reconcile of a failed refund is manual */ }
      }
    }

    // finalize_order_cancel does the ledger reversal + status update under an advisory lock,
    // re-checking status before writing -- see finalize_booking_cancel for the identical race
    // this closes (two concurrent cancel calls must not each insert a reversal ledger row).
    const { error: finErr } = await db.rpc('finalize_order_cancel', { p_order_id: orderId, p_refunded: refunded });
    if (finErr) return json(500, { error: 'Could not finalize the cancellation.' });

    return json(200, { status: 'cancelled', refunded });
  } catch (_e) {
    return json(500, { error: 'Could not cancel the order.' });
  }
});
