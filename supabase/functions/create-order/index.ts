// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';
import { z } from 'https://esm.sh/zod@3.23.8';

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing required secret: ${name}`);
  return v;
}

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
  addressId: z.string().uuid().optional(),
});

/** Real sales tax via Stripe Tax. A successful zero-tax calculation remains valid, but an
 *  API/configuration failure must stop checkout so a transient error cannot become a tax-free order. */
interface TaxAddress { line1?: string; line2?: string; city?: string; state?: string; postal_code?: string; country: string }
async function calculateTaxCents(subtotalCents: number, address: TaxAddress | null): Promise<{ cents: number; calculationId: string | null }> {
  if (!address || subtotalCents <= 0) return { cents: 0, calculationId: null };
  const calc = await stripe.tax.calculations.create({
    currency: 'usd',
    line_items: [{ amount: subtotalCents, reference: 'order_subtotal', tax_behavior: 'exclusive', tax_code: 'txcd_40060003' }],
    customer_details: { address, address_source: 'shipping' },
  });
  return { cents: calc.tax_amount_exclusive ?? 0, calculationId: calc.id ?? null };
}

const stripe = new Stripe(requireEnv('STRIPE_SECRET_KEY'), {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});

function admin() {
  return createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
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

async function recordPaymentIntent(db: any, orderId: string, pi: Stripe.PaymentIntent, amountCents: number): Promise<void> {
  const { error } = await db.from('payment_intents').insert({
    order_id: orderId,
    stripe_payment_intent_id: pi.id,
    amount_cents: amountCents,
    status: pi.status,
  });
  if (!error) return;
  if (error.code !== '23505') throw error;

  // A concurrent retry may have recorded the same Stripe object first. Only accept the
  // conflict when it points at this order; never attach one payment to two orders.
  const { data: recorded, error: recordedError } = await db
    .from('payment_intents')
    .select('order_id')
    .eq('stripe_payment_intent_id', pi.id)
    .maybeSingle();
  if (recordedError) throw recordedError;
  if (recorded?.order_id !== orderId) throw error;
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

    const { data: existing, error: existingError } = await db
      .from('orders')
      .select('id, kitchen_id, pay_status, subtotal_cents, tax_cents, tip_cents, total_cents')
      .eq('customer_id', customerId)
      .eq('idempotency_key', input.idempotencyKey)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      if (existing.kitchen_id !== input.kitchenId) {
        return json(409, { error: 'This checkout key belongs to a different kitchen. Return to your cart and start checkout again.' });
      }
      if (existing.pay_status !== 'unpaid') {
        return json(409, { error: existing.pay_status === 'paid' ? 'This order has already been paid.' : 'This order is no longer payable.' });
      }

      const { data: piRow, error: piRowError } = await db
        .from('payment_intents').select('stripe_payment_intent_id').eq('order_id', existing.id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (piRowError) throw piRowError;
      if (piRow) {
        const pi = await stripe.paymentIntents.retrieve(piRow.stripe_payment_intent_id);
        if (pi.status === 'succeeded') return json(409, { error: 'This order has already been paid.' });
        if (!pi.client_secret) return json(409, { error: 'This payment could not be resumed. Return to your cart and start checkout again.' });
        return json(200, { orderId: existing.id, clientSecret: pi.client_secret, taxCents: existing.tax_cents ?? 0, reused: true });
      }

      // The order and its items may have committed before Stripe or the local payment row
      // failed. Recover only when the persisted cart exactly matches this retry.
      const { data: persistedItems, error: persistedItemsError } = await db
        .from('order_items')
        .select('meal_id, qty')
        .eq('order_id', existing.id);
      if (persistedItemsError) throw persistedItemsError;
      const requestedQty = new Map<string, number>();
      for (const item of input.items) requestedQty.set(item.mealId, (requestedQty.get(item.mealId) ?? 0) + item.qty);
      const persistedQty = new Map<string, number>();
      for (const item of persistedItems ?? []) persistedQty.set(item.meal_id, (persistedQty.get(item.meal_id) ?? 0) + item.qty);
      const itemsMatch = requestedQty.size === persistedQty.size
        && [...requestedQty].every(([mealId, qty]) => persistedQty.get(mealId) === qty);
      if (!itemsMatch || existing.total_cents <= 0) {
        return json(409, { error: 'This order could not be recovered. Return to your cart and start checkout again.' });
      }

      const stripeCustomerId = await getOrCreateCustomer(db, customerId, email);
      const recoveredPi = await stripe.paymentIntents.create({
        amount: existing.total_cents,
        currency: 'usd',
        customer: stripeCustomerId,
        automatic_payment_methods: { enabled: true },
        ...(input.savePaymentMethod ? { setup_future_usage: 'off_session' as const } : {}),
        metadata: {
          order_id: existing.id,
          customer_id: customerId,
          kitchen_id: existing.kitchen_id,
          tip_cents: String(existing.tip_cents),
          subtotal_cents: String(existing.subtotal_cents),
          tax_cents: String(existing.tax_cents ?? 0),
        },
      }, { idempotencyKey: input.idempotencyKey });
      if (!recoveredPi.client_secret) return json(409, { error: 'This payment could not be resumed. Return to your cart and start checkout again.' });
      await recordPaymentIntent(db, existing.id, recoveredPi, existing.total_cents);
      return json(200, { orderId: existing.id, clientSecret: recoveredPi.client_secret, taxCents: existing.tax_cents ?? 0, reused: true });
    }

    let deliveryAddressText: string | null = null;
    let deliveryTaxAddress: TaxAddress | null = null;
    let pickupTaxAddress: TaxAddress | null = null;
    if (input.fulfillment === 'delivery') {
      if (!input.addressId) return json(400, { error: 'Add a delivery address before checkout.' });
      const { data: address, error: addressErr } = await db
        .from('addresses')
        .select('line1,line2,city,region,postal_code,country')
        .eq('id', input.addressId)
        .eq('owner_id', customerId)
        .eq('kind', 'customer_delivery')
        .maybeSingle();
      if (addressErr) throw addressErr;
      if (!address) return json(400, { error: 'That delivery address is no longer available.' });
      if (!address.line1 || !address.city || !address.region || !address.postal_code || !/^[A-Z]{2}$/.test(address.country || '')) {
        return json(400, { error: 'Update your delivery address with city, state, postal code, and country before checkout.' });
      }
      deliveryAddressText = [address.line1, address.line2, address.city, address.region, address.postal_code].filter(Boolean).join(', ');
      deliveryTaxAddress = { line1: address.line1, line2: address.line2 || undefined, city: address.city, state: address.region, postal_code: address.postal_code, country: address.country };
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
      .from('kitchens').select('id, owner_id, verification_status, availability').eq('id', input.kitchenId).single();
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

    if (input.fulfillment === 'pickup') {
      const { data: pickupAddress, error: pickupAddressError } = await db
        .from('addresses')
        .select('line1,line2,city,region,postal_code,country')
        .eq('owner_id', kitchen.owner_id)
        .eq('kind', 'kitchen_pickup')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (pickupAddressError) throw pickupAddressError;
      if (!pickupAddress?.line1 || !pickupAddress.city || !pickupAddress.region || !pickupAddress.postal_code || !/^[A-Z]{2}$/.test(pickupAddress.country || '')) {
        return json(409, { error: 'This kitchen needs a complete pickup address before it can accept pickup orders.' });
      }
      pickupTaxAddress = {
        line1: pickupAddress.line1,
        line2: pickupAddress.line2 || undefined,
        city: pickupAddress.city,
        state: pickupAddress.region,
        postal_code: pickupAddress.postal_code,
        country: pickupAddress.country,
      };
    }

    const priceById = new Map((meals as any[]).map((m) => [m.id, m.price_cents as number]));
    const nameById = new Map((meals as any[]).map((m) => [m.id, m.name as string]));
    let subtotal = 0;
    for (const it of input.items) subtotal += (priceById.get(it.mealId) ?? 0) * it.qty;
    const serviceFee = computeServiceFeeCents(subtotal);
    const tip = clampTipCents(input.tipCents);
    const taxAddress = input.fulfillment === 'delivery'
      ? deliveryTaxAddress
      : pickupTaxAddress;
    const { cents: tax, calculationId: taxCalculationId } = await calculateTaxCents(subtotal, taxAddress);
    const total = subtotal + serviceFee + tax + tip;

    const { data: order, error: oErr } = await db
      .from('orders')
      .insert({
        customer_id: customerId, kitchen_id: input.kitchenId, status: 'pending', method: 'card',
        pay_status: 'unpaid', fulfillment: input.fulfillment, subtotal_cents: subtotal,
        service_fee_cents: serviceFee, tax_cents: tax, tax_calculation_id: taxCalculationId,
        tip_cents: tip, total_cents: total, idempotency_key: input.idempotencyKey,
        delivery_address_text: deliveryAddressText,
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
      metadata: { order_id: order.id, customer_id: customerId, kitchen_id: input.kitchenId, tip_cents: String(tip), subtotal_cents: String(subtotal), tax_cents: String(tax) },
    }, { idempotencyKey: input.idempotencyKey });
    if (!pi.client_secret) throw new Error('Stripe did not return a client secret');
    await recordPaymentIntent(db, order.id, pi, total);

    return json(200, {
      orderId: order.id, clientSecret: pi.client_secret,
      subtotalCents: subtotal, serviceFeeCents: serviceFee, taxCents: tax, tipCents: tip, totalCents: total,
    });
  } catch (_e) {
    return json(500, { error: 'Could not create the order. Please try again.' });
  }
});
