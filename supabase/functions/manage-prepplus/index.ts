// deno-lint-ignore-file no-explicit-any
// manage-prepplus: cancel (at period end), resume, or switch monthly<->annual for the caller's own
// PrepPlus membership. Syncs the memberships row synchronously; the mirror trigger reconciles too.
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
async function priceFor(interval: 'month' | 'year'): Promise<string | undefined> {
  const key = interval === 'year' ? 'prepplus_annual_v1' : 'prepplus_monthly_v1';
  const l = await stripe.prices.list({ lookup_keys: [key], active: true, limit: 1 });
  return l.data[0]?.id;
}

const input = z.object({
  action: z.enum(['cancel', 'resume', 'switch']),
  interval: z.enum(['month', 'year']).optional(),
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

    const parsed = input.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: 'invalid input', issues: parsed.error.issues });
    const { action, interval } = parsed.data;

    const { data: mem } = await db.from('memberships')
      .select('stripe_subscription_id, status, plan_interval').eq('customer_id', uid).maybeSingle();
    if (!mem || !mem.stripe_subscription_id) return json(404, { error: 'No membership found.' });
    const subId = mem.stripe_subscription_id as string;

    let sub: Stripe.Subscription;
    if (action === 'cancel') {
      sub = await stripe.subscriptions.update(subId, { cancel_at_period_end: true });
    } else if (action === 'resume') {
      sub = await stripe.subscriptions.update(subId, { cancel_at_period_end: false });
    } else {
      // switch monthly<->annual, proration on
      if (!interval) return json(400, { error: 'interval required to switch.' });
      const newPrice = await priceFor(interval);
      if (!newPrice) return json(400, { error: 'Plan price unavailable.' });
      const cur = await stripe.subscriptions.retrieve(subId);
      const itemId = cur.items.data[0]?.id;
      if (!itemId) return json(500, { error: 'Subscription item missing.' });
      sub = await stripe.subscriptions.update(subId, {
        items: [{ id: itemId, price: newPrice }],
        proration_behavior: 'create_prorations',
        metadata: { kind: 'prepplus', customer_uid: uid },
      });
    }

    await db.from('memberships').update({
      status: sub.status,
      current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
      ...(action === 'switch' && interval ? { plan_interval: interval, stripe_price_id: sub.items.data[0]?.price?.id ?? null } : {}),
      updated_at: new Date().toISOString(),
    }).eq('customer_id', uid);

    return json(200, { status: sub.status, cancelAtPeriodEnd: sub.cancel_at_period_end ?? false, currentPeriodEnd: sub.current_period_end });
  } catch (_e) {
    return json(500, { error: 'Could not update your membership. Please try again.' });
  }
});
