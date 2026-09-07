// deno-lint-ignore-file no-explicit-any
// connect-dashboard-link: lets a cook manage their payout bank account/debit card without
// us ever touching that data ourselves. Express accounts get a Stripe-hosted "Express
// Dashboard" once onboarding is complete (createLoginLink) — that's where bank/card details
// live and get changed. If onboarding isn't finished yet, there's no dashboard to log into,
// so this instead returns needsOnboarding so the client falls back to startConnectOnboarding.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';

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

const stripe = new Stripe(requireEnv('STRIPE_SECRET_KEY'), {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});
function admin() {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });
  try {
    const db = admin();
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await db.auth.getUser(jwt);
    const userId = userData.user?.id;
    if (!userId) return json(401, { error: 'unauthorized' });

    const { error: rlErr } = await db.rpc('check_rate_limit', {
      p_action: 'connect_dashboard_link', p_max_count: 10, p_window: '10 minutes', p_subject: userId,
    });
    if (rlErr) return json(429, { error: 'Too many attempts. Please wait a few minutes and try again.' });

    const body = await req.json().catch(() => ({}));
    const kitchenId = body?.kitchenId;
    if (typeof kitchenId !== 'string') return json(400, { error: 'kitchenId required' });

    const { data: kitchen } = await db.from('kitchens').select('owner_id').eq('id', kitchenId).single();
    if (!kitchen || kitchen.owner_id !== userId) return json(403, { error: 'not your kitchen' });

    const { data: acct } = await db.from('stripe_accounts').select('stripe_account_id, details_submitted').eq('kitchen_id', kitchenId).maybeSingle();
    if (!acct || !acct.details_submitted) return json(200, { needsOnboarding: true });

    const link = await stripe.accounts.createLoginLink(acct.stripe_account_id);
    return json(200, { url: link.url });
  } catch (e: any) {
    const isStripeError = typeof e?.type === 'string' && e.type.startsWith('Stripe');
    return json(500, { error: (isStripeError && e?.message) || 'Could not open your payout dashboard. Please try again.' });
  }
});
