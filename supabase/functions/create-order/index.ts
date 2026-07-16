// deno-lint-ignore-file no-explicit-any
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

const SERVICE_FEE_BPS = 1000;
const MAX_TIP_CENTS = 100_000;
function computeServiceFeeCents(subtotalCents: number): number {
  return Math.round((subtotalCents * SERVICE_FEE_BPS) / 10000);
}
function clampTipCents(tip: number): number {
  if (!Number.isFinite(tip) || tip < 0) return 0;
  return Math.min(Math.round(tip), MAX_TIP_CENTS);
}

const createOrderInput = z.object({
  kitchenId: z.string().uuid(),
  items: z.array(z.object({ mealId: z.string().uuid(), qty: z.number().int().min(1).max(20) })).min(1).max(50),
  fulfillment: z.enum(['pickup', 'delivery']),
  method: z.enum(['card', 'cod']),
  tipCents: z.number().int().min(0).max(100_000).default(0),
  idempotencyKey: z.string().min(8).max(200),
  savePaymentMethod: z.boolean().optional(),
});

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});

function admin() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );
}

async function getOrCreateCustomer(db: any, uid: string, email: string | null): Promise<string> {
  const { data: prof } = await db.from('profiles').select('stripe_customer_id').eq('id', uid).maybeSingle();
  const existing = prof?.stripe_customer_id as string | null | undefined;
  if (existing) return existing;
  const customer = await stripe.customers.create({ email: email ?? undefined, metadata: { user_id: uid } });
  await db.from('profiles').update({ stripe_customer_id: customer.id }).eq('id', uid);
  return customer.id;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });

  try {
    const db = admin();

    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData, error: userErr } = await db.auth.getUser(jwt);
    if (userErr || !userData.user) return json(401, { error: 'unauthorized' });
    const customerId = userData.user.id;
    const email = userData.user.email ?? null;

    const { error: rlErr } = await db.rpc('check_rate_limit', {
      p_action: 'create_order', p_max_count: 20, p_window: '10 minutes', p_subject: customerId,
    });
    if (rlErr) return json(429, { error: 'Too many attempts. Please wait a few minutes and try again.' });

    const parsed = createOrderInput.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: 'invalid input', issues: parsed.error.issues });
    const input = parsed.data;

    if (input.method === 'cod') return json(400, { error: 'Cash on delivery isn\'t available yet.' });

    const { data: existing } = await db
      .from('orders').select('id').eq('customer_id', customerId).eq('idempotency_key', input.idempotencyKey).maybeSingle();
    if (existing) {
      const { data: piRow } = await db
        .from('payment_intents').select('stripe_payment_intent_id').eq('order_id', existing.id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      let clientSecret: string | null = null;
      if (piRow) clientSecret = (await stripe.paymentIntents.retrieve(piRow.stripe_payment_intent_id)).client_secret;
      return json(200, { orderId: existing.id, clientSecret, reused: true });
    }

    const mealIds = [...new Set(input.items.map((i) => i.mealId))];
    const { data: meals, error: mErr } = await db
      .from('meals').select('id, name, price_cents, kitchen_id, status').in('id', mealIds);
    if (mErr) throw mErr;
    if (!meals || meals.length !== mealIds.length) return json(400, { error: 'Some items are unavailable.' });
    for (const m of meals as any[]) {
      if (m.kitchen_id !== input.kitchenId) return json(400, { error: 'All items must be from one kitchen.' });
      if (m.status !== 'live') return json(409, { error: `${m.name} is no longer available.` });
    }

    const { data: kitchen } = await db
      .from('kitchens').select('id, verification_status, availability').eq('id', input.kitchenId).single();
    if (!kitchen || kitchen.verification_status !== 'verified' || kitchen.availability !== 'open') {
      return json(409, { error: 'This kitchen isn\'t taking orders right now.' });
    }

    // Defense-in-depth: a meal can only be flipped to 'live' while payouts are enabled (DB
    // trigger), but Stripe can restrict an account afterward — re-check at order time too.
    const { data: acct } = await db
      .from('stripe_accounts').select('payouts_enabled').eq('kitchen_id', input.kitchenId).maybeSingle();
    if (!acct?.payouts_enabled) {
      return json(409, { error: 'This kitchen can\'t accept paid orders until payouts are set up.' });
    }

    const priceById = new Map((meals as any[]).map((m) => [m.id, m.price_cents as number]));
    const nameById = new Map((meals as any[]).map((m) => [m.id, m.name as string]));
    let subtotal = 0;
    for (const it of input.items) subtotal += (priceById.get(it.mealId) ?? 0) * it.qty;
    const serviceFee = computeServiceFeeCents(subtotal);
    const tip = clampTipCents(input.tipCents);
    const total = subtotal + serviceFee + tip;

    const { data: order, error: oErr } = await db
      .from('orders')
      .insert({
        customer_id: customerId, kitchen_id: input.kitchenId, status: 'pending', method: 'card',
        pay_status: 'unpaid', fulfillment: input.fulfillment, subtotal_cents: subtotal,
        service_fee_cents: serviceFee, tip_cents: tip, total_cents: total, idempotency_key: input.idempotencyKey,
      })
      .select('id').single();
    if (oErr) {
      if ((oErr as any).code === '23505') return json(409, { error: 'Duplicate order; please retry.' });
      throw oErr;
    }

    const itemRows = input.items.map((it) => ({
      order_id: order.id, meal_id: it.mealId, kitchen_id: input.kitchenId,
      name_snapshot: nameById.get(it.mealId) ?? 'Item', unit_price_cents: priceById.get(it.mealId) ?? 0, qty: it.qty,
    }));
    const { error: iErr } = await db.from('order_items').insert(itemRows);
    if (iErr) throw iErr;

    // Attach the buyer's Stripe Customer so cards can be saved / reused.
    const stripeCustomerId = await getOrCreateCustomer(db, customerId, email);

    const pi = await stripe.paymentIntents.create({
      amount: total,
      currency: 'usd',
      customer: stripeCustomerId,
      automatic_payment_methods: { enabled: true },
      ...(input.savePaymentMethod ? { setup_future_usage: 'off_session' as const } : {}),
      metadata: { order_id: order.id, customer_id: customerId, kitchen_id: input.kitchenId, tip_cents: String(tip), subtotal_cents: String(subtotal) },
    }, { idempotencyKey: input.idempotencyKey });
    await db.from('payment_intents').insert({ order_id: order.id, stripe_payment_intent_id: pi.id, amount_cents: total, status: pi.status });

    return json(200, {
      orderId: order.id, clientSecret: pi.client_secret,
      subtotalCents: subtotal, serviceFeeCents: serviceFee, tipCents: tip, totalCents: total,
    });
  } catch (_e) {
    return json(500, { error: 'Could not create the order. Please try again.' });
  }
});
