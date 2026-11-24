// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';

// BEGIN stripe-key-mode-guard-callers (docs/web-launch/DESIGN.md task 1.7)
// Keep this block identical in every function that calls requireEnv('STRIPE_SECRET_KEY'):
// tests/stripeKeyModeCallers.test.ts evaluates it from each file. Same rule as the 1.1g guard in the vendored
// stripe-setup, stripe-webhook and stripe-worker wrappers: the key's mode must match the project and
// GET /v1/account must return STRIPE_EXPECTED_ACCOUNT; the key and the account id are trimmed first.
// Which mode: only SUPABASE_URL https://fwidhpzwldneeaphrxgg.supabase.co (the production project, compared
// after URL normalisation, so a trailing slash is allowed but a path, port, query or credentials are not)
// unlocks a live key (sk_live_/rk_live_). Every other well-formed http(s) URL is non-production and needs a
// test key (sk_test_/rk_test_), local stacks included. A missing or unparseable SUPABASE_URL fails closed.
// requireEnv('STRIPE_SECRET_KEY') runs the synchronous mode check at module load; the handler awaits
// stripeKeyModeGuard() before any other work except the CORS preflight. Refusals log one fixed reason and
// return a fixed 500 body; neither names a key, ref or account id.
// Caching (per isolate): a pass is kept. Concurrent callers share one in-flight check. After a failed check
// every call refuses without contacting Stripe for STRIPE_GUARD_RETRY_MS, then the next call runs one fresh
// check. The clock is injectable for tests; the handlers use Date.now.
const STRIPE_GUARD_PRODUCTION_URL = 'https://fwidhpzwldneeaphrxgg.supabase.co/';
const STRIPE_GUARD_FAILURE_MESSAGE = 'Stripe configuration check failed';
const STRIPE_GUARD_RETRY_MS = 30_000;
let stripeGuardPassed = false;
let stripeGuardInFlight: Promise<boolean> | null = null;
let stripeGuardRetryAt = 0;
function stripeGuardFailureResponse(headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ error: STRIPE_GUARD_FAILURE_MESSAGE }), {
    status: 500,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}
function stripeGuardRefuse(reason: string): false {
  console.error(`Stripe key-mode guard refused: ${reason}`);
  return false;
}
function stripeGuardKeyModeMatches(stripeKey: string): boolean {
  let supabaseUrl: URL;
  try {
    supabaseUrl = new URL(Deno.env.get('SUPABASE_URL') ?? '');
  } catch {
    return stripeGuardRefuse('SUPABASE_URL is missing or not a URL');
  }
  if (supabaseUrl.protocol !== 'https:' && supabaseUrl.protocol !== 'http:') {
    return stripeGuardRefuse('SUPABASE_URL is missing or not a URL');
  }
  const allowedPrefixes = supabaseUrl.href === STRIPE_GUARD_PRODUCTION_URL ? ['sk_live_', 'rk_live_'] : ['sk_test_', 'rk_test_'];
  if (!allowedPrefixes.some((prefix) => stripeKey.trim().startsWith(prefix))) {
    return stripeGuardRefuse('STRIPE_SECRET_KEY mode does not match this project');
  }
  return true;
}
async function stripeGuardCheck(): Promise<boolean> {
  const stripeKey = (Deno.env.get('STRIPE_SECRET_KEY') ?? '').trim();
  if (!stripeGuardKeyModeMatches(stripeKey)) return false;
  const expectedAccount = (Deno.env.get('STRIPE_EXPECTED_ACCOUNT') ?? '').trim();
  if (!expectedAccount) return stripeGuardRefuse('STRIPE_EXPECTED_ACCOUNT is not set');
  let account: { id?: unknown } | null;
  try {
    const response = await fetch('https://api.stripe.com/v1/account', {
      method: 'GET',
      headers: { Authorization: `Bearer ${stripeKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return stripeGuardRefuse('Stripe account lookup failed');
    account = await response.json();
  } catch {
    return stripeGuardRefuse('Stripe account lookup failed');
  }
  if (!account || account.id !== expectedAccount) {
    return stripeGuardRefuse('Stripe account does not match STRIPE_EXPECTED_ACCOUNT');
  }
  return true;
}
async function stripeKeyModeGuard(clock: () => number = Date.now): Promise<boolean> {
  if (stripeGuardPassed) return true;
  if (!stripeGuardInFlight) {
    if (clock() < stripeGuardRetryAt) return false;
    stripeGuardInFlight = (async () => {
      let passed = false;
      try {
        passed = await stripeGuardCheck();
      } finally {
        stripeGuardInFlight = null;
        if (passed) stripeGuardPassed = true;
        else stripeGuardRetryAt = clock() + STRIPE_GUARD_RETRY_MS;
      }
      return passed;
    })();
  }
  return stripeGuardInFlight;
}
// END stripe-key-mode-guard-callers

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing required secret: ${name}`);
  if (name === 'STRIPE_SECRET_KEY' && !stripeGuardKeyModeMatches(v)) throw new Error(STRIPE_GUARD_FAILURE_MESSAGE);
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

// Only the app's own domain is a valid post-KYC redirect target - this is the moment right
// after a cook submits bank/identity info to Stripe, a high-trust window an open redirect
// here would be worth exploiting.
const ALLOWED_ORIGIN = 'https://app.preppa.live';
function isAllowedRedirect(url: string): boolean {
  try { return new URL(url).origin === ALLOWED_ORIGIN; } catch { return false; }
}

// Create (or reuse) the cook's Express connected account and return a Stripe-hosted
// onboarding link (KYC/identity + payout bank). Preppa is the platform; the cook does
// NOT set up their own Stripe account. Web return URLs by default; caller may override.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!(await stripeKeyModeGuard())) return stripeGuardFailureResponse(corsHeaders);
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });
  try {
    const db = admin();
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await db.auth.getUser(jwt);
    const userId = userData.user?.id;
    if (!userId) return json(401, { error: 'unauthorized' });
    const email = userData.user?.email ?? undefined;

    const { error: rlErr } = await db.rpc('check_rate_limit', {
      p_action: 'connect_onboard', p_max_count: 10, p_window: '10 minutes', p_subject: userId,
    });
    if (rlErr) return json(429, { error: 'Too many attempts. Please wait a few minutes and try again.' });

    const body = await req.json().catch(() => ({}));
    const kitchenId = body?.kitchenId;
    if (typeof kitchenId !== 'string') return json(400, { error: 'kitchenId required' });
    const returnUrl = (typeof body?.returnUrl === 'string' && isAllowedRedirect(body.returnUrl))
      ? body.returnUrl : 'https://app.preppa.live/my-hub?connect=return';
    const refreshUrl = (typeof body?.refreshUrl === 'string' && isAllowedRedirect(body.refreshUrl))
      ? body.refreshUrl : 'https://app.preppa.live/my-hub?connect=refresh';

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
    // Stripe-branded errors (e.g. "...Connect isn't enabled yet...") are safe/useful to
    // surface during onboarding; anything else (network, unexpected runtime errors) falls
    // back to the generic message so internals never leak to the client.
    const isStripeError = typeof (e as any)?.type === 'string' && (e as any).type.startsWith('Stripe');
    return json(500, { error: (isStripeError && (e as any)?.message) || 'Could not start payout setup. Please try again.' });
  }
});
