// deno-lint-ignore-file no-explicit-any
// subscribe-prepplus: the caller starts a PrepPlus membership (Stripe-native recurring on Preppa's
// account, off-session on their saved card). Writes the memberships row SYNCHRONOUSLY for instant
// entitlement; the stripe.subscriptions mirror trigger reconciles status changes thereafter.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';
import { z } from 'https://esm.sh/zod@3.23.8';

const MONTHLY_CENTS = 999;
const ANNUAL_CENTS = 8900;
const TRIAL_DAYS = 7;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
}
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20', httpClient: Stripe.createFetchHttpClient(),
});
function admin() {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } });
}
async function getOrCreateCustomer(db: any, uid: string, email: string | null): Promise<string> {
  const { data: prof } = await db.from('profiles').select('stripe_customer_id').eq('id', uid).maybeSingle();
  if (prof?.stripe_customer_id) return prof.stripe_customer_id as string;
  const customer = await stripe.customers.create({ email: email ?? undefined, metadata: { user_id: uid } });
  await db.from('profiles').update({ stripe_customer_id: customer.id }).eq('id', uid);
  return customer.id;
}

// Lazy-ensure the PrepPlus product + monthly/annual Prices (keyed by lookup_key so they're created
// exactly once, no dashboard step). Cached in module scope after the first success.
let PRICES: { month: string; year: string } | null = null;
async function ensurePrices(): Promise<{ month: string; year: string }> {
  if (PRICES) return PRICES;
  const [m, a] = await Promise.all([
    stripe.prices.list({ lookup_keys: ['prepplus_monthly_v1'], active: true, limit: 1 }),
    stripe.prices.list({ lookup_keys: ['prepplus_annual_v1'], active: true, limit: 1 }),
  ]);
  let month = m.data[0]?.id; let year = a.data[0]?.id;
  if (!month || !year) {
    const product = await stripe.products.create({ name: 'PrepPlus Membership', metadata: { app: 'preppa', kind: 'prepplus' } });
    if (!month) month = (await stripe.prices.create({ product: product.id, currency: 'usd', unit_amount: MONTHLY_CENTS, recurring: { interval: 'month' }, lookup_key: 'prepplus_monthly_v1' })).id;
    if (!year) year = (await stripe.prices.create({ product: product.id, currency: 'usd', unit_amount: ANNUAL_CENTS, recurring: { interval: 'year' }, lookup_key: 'prepplus_annual_v1' })).id;
  }
  PRICES = { month, year };
  return PRICES;
}

const input = z.object({
  interval: z.enum(['month', 'year']).default('month'),
  paymentMethodId: z.string().min(3).max(120).optional(),
});

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

    const parsed = input.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json(400, { error: 'invalid input', issues: parsed.error.issues });
    const { interval, paymentMethodId } = parsed.data;

    // Idempotency / double-tap: already a live member -> return it, don't stack subscriptions.
    const { data: existing } = await db.from('memberships')
      .select('status, current_period_end, trial_consumed').eq('customer_id', uid).maybeSingle();
    if (existing && ['active', 'trialing'].includes(existing.status)
        && existing.current_period_end && new Date(existing.current_period_end) > new Date()) {
      return json(200, { status: existing.status, already: true });
    }
    const trialDays = existing?.trial_consumed ? 0 : TRIAL_DAYS;

    const stripeCustomerId = await getOrCreateCustomer(db, uid, email);

    // Require a saved card (off_session). No card -> client runs the setup-intent flow, then retries.
    let pmId = paymentMethodId;
    if (!pmId) {
      const list = await stripe.paymentMethods.list({ customer: stripeCustomerId, type: 'card', limit: 1 });
      pmId = list.data[0]?.id;
    }
    if (!pmId) return json(400, { error: 'Add a card to start your membership.', code: 'no_card' });
    try { await stripe.paymentMethods.attach(pmId, { customer: stripeCustomerId }); } catch (_e) { /* already attached */ }

    const prices = await ensurePrices();
    const priceId = interval === 'year' ? prices.year : prices.month;

    let sub: Stripe.Subscription;
    try {
      sub = await stripe.subscriptions.create({
        customer: stripeCustomerId,
        items: [{ price: priceId }],
        default_payment_method: pmId,
        off_session: true,
        payment_behavior: 'error_if_incomplete',
        ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
        metadata: { kind: 'prepplus', customer_uid: uid },
      }, { idempotencyKey: `prepplus_sub_${uid}_${interval}` });
    } catch (e: any) {
      return json(402, { error: e?.message || 'Your card was declined.', code: 'charge_failed' });
    }

    const startedTrial = sub.status === 'trialing';
    // SYNCHRONOUS write -> instant entitlement (mirror trigger only reconciles later).
    await db.from('memberships').upsert({
      customer_id: uid,
      stripe_subscription_id: sub.id,
      stripe_price_id: priceId,
      plan_interval: interval,
      status: sub.status,
      current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
      ...(startedTrial ? { trial_consumed: true } : {}),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'customer_id' });

    return json(200, { status: sub.status, subscriptionId: sub.id, trial: startedTrial, currentPeriodEnd: sub.current_period_end });
  } catch (_e) {
    return json(500, { error: 'Could not start your membership. Please try again.' });
  }
});
