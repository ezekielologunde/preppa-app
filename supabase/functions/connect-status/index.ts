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

// Sync the cook's Connect onboarding status from Stripe into stripe_accounts (polled on
// hub load + after onboarding return) — avoids configuring a webhook. Owner-scoped.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });
  try {
    const db = admin();
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await db.auth.getUser(jwt);
    const userId = userData.user?.id;
    if (!userId) return json(401, { error: 'unauthorized' });

    const body = await req.json().catch(() => ({}));
    const kitchenId = body?.kitchenId;
    if (typeof kitchenId !== 'string') return json(400, { error: 'kitchenId required' });

    const { data: kitchen } = await db.from('kitchens').select('owner_id').eq('id', kitchenId).single();
    if (!kitchen || kitchen.owner_id !== userId) return json(403, { error: 'not your kitchen' });

    const { data: acct } = await db.from('stripe_accounts').select('stripe_account_id').eq('kitchen_id', kitchenId).maybeSingle();
    if (!acct) return json(200, { onboarded: false, chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false });

    const sa = await stripe.accounts.retrieve(acct.stripe_account_id) as any;
    const charges_enabled = !!sa.charges_enabled;
    const payouts_enabled = !!sa.payouts_enabled;
    const details_submitted = !!sa.details_submitted;
    await db.from('stripe_accounts')
      .update({ charges_enabled, payouts_enabled, details_submitted, updated_at: new Date().toISOString() })
      .eq('kitchen_id', kitchenId);

    return json(200, { onboarded: details_submitted, chargesEnabled: charges_enabled, payoutsEnabled: payouts_enabled, detailsSubmitted: details_submitted });
  } catch (e) {
    return json(500, { error: (e as any)?.message || 'Could not check payout status.' });
  }
});
