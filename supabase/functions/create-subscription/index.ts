// deno-lint-ignore-file no-explicit-any
// create-subscription: a customer subscribes to a cook's weekly plan. Preppa is the hub —
// the charge lands on Preppa's Stripe using the customer's saved card; the cook is credited
// (via reconcile_invoice) and cashes out through Connect. JWT-scoped to the caller.
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
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
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
function mapStatus(s: string): string {
  if (s === 'active' || s === 'trialing') return 'active';
  if (s === 'past_due' || s === 'unpaid') return 'past_due';
  if (s === 'canceled' || s === 'incomplete_expired') return 'canceled';
  if (s === 'paused') return 'paused';
  return 'incomplete';
}

const input = z.object({
  planId: z.string().uuid(),
  paymentMethodId: z.string().min(3).max(120).optional(),
  preferredDay: z.string().max(12).optional(),
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

    const parsed = input.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: 'invalid input', issues: parsed.error.issues });
    const { planId, paymentMethodId, preferredDay } = parsed.data;

    const { data: plan } = await db.from('plans')
      .select('id, kitchen_id, price_cents, stripe_price_id, status').eq('id', planId).maybeSingle();
    if (!plan || plan.status !== 'active' || !plan.stripe_price_id) return json(404, { error: 'This plan is not available.' });

    // Can't subscribe to your own kitchen.
    const { data: kitchen } = await db.from('kitchens').select('owner_id').eq('id', plan.kitchen_id).maybeSingle();
    if (kitchen?.owner_id === uid) return json(400, { error: "You can't subscribe to your own plan." });

    const stripeCustomerId = await getOrCreateCustomer(db, uid, email);

    // Choose a payment method: the one passed in, else the customer's default/first saved card.
    let pmId = paymentMethodId;
    if (!pmId) {
      const list = await stripe.paymentMethods.list({ customer: stripeCustomerId, type: 'card', limit: 1 });
      pmId = list.data[0]?.id;
    }
    if (!pmId) return json(400, { error: 'Add a card first, then subscribe.', code: 'no_card' });

    // Make sure the PM is attached to this customer (saved cards already are; no-op if so).
    try { await stripe.paymentMethods.attach(pmId, { customer: stripeCustomerId }); } catch (_e) { /* already attached */ }

    let sub: Stripe.Subscription;
    try {
      sub = await stripe.subscriptions.create({
        customer: stripeCustomerId,
        items: [{ price: plan.stripe_price_id }],
        default_payment_method: pmId,
        off_session: true,
        payment_behavior: 'error_if_incomplete',
        metadata: { plan_id: plan.id, kitchen_id: plan.kitchen_id, customer_uid: uid },
        expand: ['latest_invoice'],
      });
    } catch (e: any) {
      return json(402, { error: e?.message || 'Your card was declined.', code: 'charge_failed' });
    }

    const inv: any = sub.latest_invoice;
    const status = mapStatus(sub.status);

    await db.from('subscriptions').insert({
      customer_id: uid,
      kitchen_id: plan.kitchen_id,
      plan_id: plan.id,
      stripe_subscription_id: sub.id,
      stripe_price_id: plan.stripe_price_id,
      status,
      preferred_day: preferredDay ?? null,
      current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
    });

    // Credit the cook now for the first charge (don't wait for the invoice mirror to sync).
    if (inv && inv.status === 'paid' && inv.id) {
      try { await db.rpc('reconcile_invoice', { p_invoice_id: inv.id, p_subscription: sub.id, p_amount_paid: inv.amount_paid ?? 0 }); }
      catch (_e) { /* the stripe.invoices trigger will still reconcile it */ }
    }

    return json(200, { subscriptionId: sub.id, status });
  } catch (_e) {
    return json(500, { error: 'Could not start your plan. Please try again.' });
  }
});
