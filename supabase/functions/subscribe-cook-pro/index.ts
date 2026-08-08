// deno-lint-ignore-file no-explicit-any
// subscribe-cook-pro: the caller (must own the kitchen) starts a Preppa Pro membership for
// that kitchen (Stripe-native recurring on Preppa's account, off-session on their saved card).
// Mirrors subscribe-prepplus exactly, keyed on kitchen_id instead of customer_uid -- see
// cook_memberships / is_cook_pro_member / sync_cook_pro_membership (migration
// high_add_cook_pro_membership) for why: every cook-money construct in this schema is
// kitchen-scoped, not user-scoped, and a person could in principle own kitchens independent
// of any personal PrepPlus membership. Writes the cook_memberships row synchronously for
// instant entitlement; the stripe.subscriptions mirror trigger reconciles status changes
// thereafter (renewals, cancellations, dunning).
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
function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing required secret: ${name}`);
  return v;
}
const stripe = new Stripe(requireEnv('STRIPE_SECRET_KEY'), {
  apiVersion: '2024-06-20', httpClient: Stripe.createFetchHttpClient(),
});
function admin() {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
}
async function getOrCreateCustomer(db: any, uid: string, email: string | null): Promise<string> {
  const { data: prof } = await db.from('profiles').select('stripe_customer_id').eq('id', uid).maybeSingle();
  if (prof?.stripe_customer_id) return prof.stripe_customer_id as string;
  const customer = await stripe.customers.create({ email: email ?? undefined, metadata: { user_id: uid } });
  await db.from('profiles').update({ stripe_customer_id: customer.id }).eq('id', uid);
  return customer.id;
}

let PRICES: { month: string; year: string } | null = null;
async function ensurePrices(): Promise<{ month: string; year: string }> {
  if (PRICES) return PRICES;
  const [m, a] = await Promise.all([
    stripe.prices.list({ lookup_keys: ['cookpro_monthly_v1'], active: true, limit: 1 }),
    stripe.prices.list({ lookup_keys: ['cookpro_annual_v1'], active: true, limit: 1 }),
  ]);
  let month = m.data[0]?.id; let year = a.data[0]?.id;
  if (!month || !year) {
    const product = await stripe.products.create({ name: 'Preppa Pro (Cook Membership)', metadata: { app: 'preppa', kind: 'cook_pro' } });
    if (!month) month = (await stripe.prices.create({ product: product.id, currency: 'usd', unit_amount: MONTHLY_CENTS, recurring: { interval: 'month' }, lookup_key: 'cookpro_monthly_v1' })).id;
    if (!year) year = (await stripe.prices.create({ product: product.id, currency: 'usd', unit_amount: ANNUAL_CENTS, recurring: { interval: 'year' }, lookup_key: 'cookpro_annual_v1' })).id;
  }
  PRICES = { month, year };
  return PRICES;
}

const input = z.object({
  kitchenId: z.string().uuid(),
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

    const { error: rlErr } = await db.rpc('check_rate_limit', {
      p_action: 'subscribe_cook_pro', p_max_count: 10, p_window: '10 minutes', p_subject: uid,
    });
    if (rlErr) return json(429, { error: 'Too many attempts. Please wait a few minutes and try again.' });

    const parsed = input.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json(400, { error: 'invalid input', issues: parsed.error.issues });
    const { kitchenId, interval, paymentMethodId } = parsed.data;

    const { data: kitchen } = await db.from('kitchens').select('id, owner_id').eq('id', kitchenId).maybeSingle();
    if (!kitchen || kitchen.owner_id !== uid) return json(403, { error: 'not your kitchen' });

    const { data: existing } = await db.from('cook_memberships')
      .select('status, current_period_end, trial_consumed').eq('kitchen_id', kitchenId).maybeSingle();
    if (existing && ['active', 'trialing'].includes(existing.status)
        && existing.current_period_end && new Date(existing.current_period_end) > new Date()) {
      return json(200, { status: existing.status, already: true });
    }
    const trialDays = existing?.trial_consumed ? 0 : TRIAL_DAYS;

    const stripeCustomerId = await getOrCreateCustomer(db, uid, email);

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
        metadata: { kind: 'cook_pro', kitchen_id: kitchenId },
      }, { idempotencyKey: `cookpro_sub_${kitchenId}_${interval}` });
    } catch (e: any) {
      return json(402, { error: e?.message || 'Your card was declined.', code: 'charge_failed' });
    }

    const startedTrial = sub.status === 'trialing';
    await db.from('cook_memberships').upsert({
      kitchen_id: kitchenId,
      stripe_subscription_id: sub.id,
      stripe_price_id: priceId,
      plan_interval: interval,
      status: sub.status,
      current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
      ...(startedTrial ? { trial_consumed: true } : {}),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'kitchen_id' });

    return json(200, { status: sub.status, subscriptionId: sub.id, trial: startedTrial, currentPeriodEnd: sub.current_period_end });
  } catch (_e) {
    return json(500, { error: 'Could not start your membership. Please try again.' });
  }
});
