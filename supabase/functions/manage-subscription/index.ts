// deno-lint-ignore-file no-explicit-any
// manage-subscription: pause / resume / cancel the caller's own subscription. Status is
// synced from Stripe. JWT-scoped — the subscription must belong to the caller.
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

const input = z.object({
  subscriptionId: z.string().uuid(),
  action: z.enum(['pause', 'resume', 'cancel']),
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
    const { subscriptionId, action } = parsed.data;

    // Ownership check.
    const { data: sub } = await db.from('subscriptions')
      .select('id, stripe_subscription_id').eq('id', subscriptionId).eq('customer_id', uid).maybeSingle();
    if (!sub || !sub.stripe_subscription_id) return json(404, { error: 'Subscription not found.' });
    const sid = sub.stripe_subscription_id;

    let status: string;
    if (action === 'pause') {
      await stripe.subscriptions.update(sid, { pause_collection: { behavior: 'void' } });
      status = 'paused';
    } else if (action === 'resume') {
      await stripe.subscriptions.update(sid, { pause_collection: '' as any });
      status = 'active';
    } else {
      await stripe.subscriptions.cancel(sid);
      status = 'canceled';
    }

    await db.from('subscriptions').update({ status }).eq('id', subscriptionId);
    return json(200, { status });
  } catch (_e) {
    return json(500, { error: 'Could not update your plan. Please try again.' });
  }
});
