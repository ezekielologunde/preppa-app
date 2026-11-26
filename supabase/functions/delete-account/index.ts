// deno-lint-ignore-file no-explicit-any
// delete-account: real, server-side account deletion (App Store 5.1.1(v) / Google Play
// requirement; also the only honest way to answer a GDPR/CCPA erasure request). Previously
// the client's "Delete account" button only signed the user out and cleared local cache --
// their real auth.users row, profile, and order history stayed fully intact.
//
// Policy: anonymize + disable sign-in, not hard-delete. orders.customer_id -> profiles is a
// RESTRICT foreign key, so hard-deleting a profile with any real order history is blocked by
// Postgres itself regardless of policy preference. A cook with an active kitchen that has
// in-flight orders, an uncashed ledger balance, active subscribers, OR is currently SUSPENDED
// is blocked outright -- deleting out from under paying subscribers, forfeiting real money,
// or dodging an active admin suspension would all be worse outcomes than the block.
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
const stripe = new Stripe(requireEnv('STRIPE_SECRET_KEY'), { apiVersion: '2024-06-20', httpClient: Stripe.createFetchHttpClient() });
function admin() {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
}

async function cancelIfActive(subscriptionId: string | null | undefined) {
  if (!subscriptionId) return;
  try { await stripe.subscriptions.cancel(subscriptionId); } catch (_e) { /* already canceled/missing — fine */ }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!(await stripeKeyModeGuard())) return stripeGuardFailureResponse(corsHeaders);
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });
  try {
    const db = admin();
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData, error: userErr } = await db.auth.getUser(jwt);
    if (userErr || !userData.user) return json(401, { error: 'unauthorized' });
    const uid = userData.user.id;

    const { error: rlErr } = await db.rpc('check_rate_limit', {
      p_action: 'delete_account', p_max_count: 5, p_window: '10 minutes', p_subject: uid,
    });
    if (rlErr) return json(429, { error: 'Too many attempts. Please wait a few minutes and try again.' });

    // Block on any kitchen the caller owns with in-flight orders, an uncashed balance,
    // active subscribers, or an active admin suspension.
    const { data: kitchens } = await db.from('kitchens').select('id, name').eq('owner_id', uid);
    for (const k of kitchens ?? []) {
      const { data: blockers } = await db.rpc('cook_deletion_blockers', { p_kitchen_id: k.id }).single();
      const b = blockers as any;
      if (b?.has_active_orders) {
        return json(409, { error: `"${k.name}" has orders in progress. Finish or cancel them before deleting your account.` });
      }
      if (b?.balance_cents > 0) {
        return json(409, { error: `"${k.name}" has $${(b.balance_cents / 100).toFixed(2)} available to cash out. Withdraw it before deleting your account.` });
      }
      if (b?.active_subscribers > 0) {
        return json(409, { error: `"${k.name}" has ${b.active_subscribers} active subscriber${b.active_subscribers === 1 ? '' : 's'}. They need to be resolved before deleting your account.` });
      }
      if (b?.is_suspended) {
        return json(409, { error: `"${k.name}" is currently suspended. Contact support to resolve this before deleting your account.` });
      }
    }

    // Nothing blocking — proceed. Cancel Stripe subscriptions (customer PrepPlus + any
    // cook Preppa Pro memberships), pause kitchens, drop push tokens, scrub PII, then
    // soft-delete the auth user (keeps the row/id — everything that references it via a
    // RESTRICT foreign key stays valid — but disables sign-in and obfuscates the email at
    // the auth layer).
    const { data: mem } = await db.from('memberships').select('stripe_subscription_id').eq('customer_id', uid).maybeSingle();
    await cancelIfActive(mem?.stripe_subscription_id as string | undefined);

    for (const k of kitchens ?? []) {
      const { data: cmem } = await db.from('cook_memberships').select('stripe_subscription_id').eq('kitchen_id', k.id).maybeSingle();
      await cancelIfActive(cmem?.stripe_subscription_id as string | undefined);
      await db.from('kitchens').update({ availability: 'paused' }).eq('id', k.id);
    }

    await db.from('push_tokens').delete().eq('user_id', uid);

    await db.from('profiles').update({
      display_name: 'Deleted user',
      first_name: null,
      avatar_url: null,
      bio: null,
      location: null,
      dietary: null,
      updated_at: new Date().toISOString(),
    }).eq('id', uid);

    const { error: delErr } = await db.auth.admin.deleteUser(uid, true); // shouldSoftDelete
    if (delErr) throw delErr;

    return json(200, { deleted: true });
  } catch (e: any) {
    return json(500, { error: 'Could not delete your account. Please try again or contact support.' });
  }
});
