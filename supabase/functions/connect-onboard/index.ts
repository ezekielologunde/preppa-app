// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';

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

// Create (or reuse) the cook's Express connected account and return a Stripe-hosted
// onboarding link (KYC/identity + payout bank). Preppa is the platform; the cook does
// NOT set up their own Stripe account. Web return URLs by default; caller may override.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });
  try {
    const db = admin();
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await db.auth.getUser(jwt);
    const userId = userData.user?.id;
    if (!userId) return json(401, { error: 'unauthorized' });
    const email = userData.user?.email ?? undefined;

    const body = await req.json().catch(() => ({}));
    const kitchenId = body?.kitchenId;
    if (typeof kitchenId !== 'string') return json(400, { error: 'kitchenId required' });
    const returnUrl = typeof body?.returnUrl === 'string' ? body.returnUrl : 'https://app.preppa.live/my-hub?connect=return';
    const refreshUrl = typeof body?.refreshUrl === 'string' ? body.refreshUrl : 'https://app.preppa.live/my-hub?connect=refresh';

    const { data: kitchen } = await db.from('kitchens').select('id, owner_id, name').eq('id', kitchenId).single();
    if (!kitchen || kitchen.owner_id !== userId) return json(403, { error: 'not your kitchen' });

    let acctId: string;
    const { data: existing } = await db.from('stripe_accounts').select('stripe_account_id').eq('kitchen_id', kitchenId).maybeSingle();
    if (existing) {
      acctId = existing.stripe_account_id;
    } else {
      const acct = await stripe.accounts.create({
        type: 'express',
        email,
        capabilities: { transfers: { requested: true } },
        business_profile: { name: kitchen.name, product_description: 'Homemade food sold on Preppa' },
        metadata: { kitchen_id: kitchenId },
      });
      acctId = acct.id;
      await db.from('stripe_accounts').insert({ kitchen_id: kitchenId, stripe_account_id: acctId });
    }

    const link = await stripe.accountLinks.create({
      account: acctId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });
    return json(200, { url: link.url });
  } catch (e) {
    // Surface the Stripe message (e.g. "...Connect..." when the platform isn't enabled yet).
    return json(500, { error: (e as any)?.message || 'Could not start payout setup. Please try again.' });
  }
});
