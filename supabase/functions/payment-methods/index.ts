// deno-lint-ignore-file no-explicit-any
// Saved-card management for buyers: get/create a Stripe Customer for the signed-in
// user, and setup-intent / list / detach / set-default their cards. Every action is
// scoped to the caller's own Customer (JWT-derived); detach/default verify the PM
// actually belongs to that Customer before mutating.
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
  return createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  );
}

async function getOrCreateCustomer(db: any, uid: string, email: string | null): Promise<string> {
  const { data: prof } = await db.from('profiles').select('stripe_customer_id').eq('id', uid).maybeSingle();
  const existing = prof?.stripe_customer_id as string | null | undefined;
  if (existing) return existing;
  const customer = await stripe.customers.create({ email: email ?? undefined, metadata: { user_id: uid } });
  await db.from('profiles').update({ stripe_customer_id: customer.id }).eq('id', uid);
  return customer.id;
}

function cardShape(pm: any) {
  return { id: pm.id, brand: pm.card?.brand ?? 'card', last4: pm.card?.last4 ?? '', expMonth: pm.card?.exp_month ?? null, expYear: pm.card?.exp_year ?? null };
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
    const email = userData.user.email ?? null;

    const body = await req.json().catch(() => ({}));
    const action = body?.action as string;

    // Rate limit before touching Stripe at all -- setup-intent is the textbook
    // card-testing-fraud mechanism (an attacker can hammer it to probe stolen cards), so it
    // gets the tightest window; the others are generous headroom for real usage.
    const RATE_LIMITS: Record<string, [number, string]> = {
      'setup-intent': [6, '10 minutes'],
      'list': [40, '5 minutes'],
      'detach': [15, '10 minutes'],
      'default': [15, '10 minutes'],
      'ephemeral-key': [20, '5 minutes'],
    };
    const rl = RATE_LIMITS[action];
    if (rl) {
      const { error: rlErr } = await db.rpc('check_rate_limit', {
        p_action: `payment_methods_${action.replace(/-/g, '_')}`, p_max_count: rl[0], p_window: rl[1], p_subject: uid,
      });
      if (rlErr) return json(429, { error: 'Too many attempts. Please wait a few minutes and try again.' });
    }

    const customer = await getOrCreateCustomer(db, uid, email);

    if (action === 'ephemeral-key') {
      // Native-only: Stripe's PaymentSheet needs a short-lived ephemeral key (never the
      // customer id alone) to fetch/display this customer's saved cards client-side.
      // apiVersion must match the account default used elsewhere in this function.
      const key = await stripe.ephemeralKeys.create({ customer }, { apiVersion: '2024-06-20' });
      return json(200, { customerId: customer, ephemeralKeySecret: key.secret });
    }

    if (action === 'setup-intent') {
      const si = await stripe.setupIntents.create({ customer, usage: 'off_session', automatic_payment_methods: { enabled: true } });
      return json(200, { clientSecret: si.client_secret });
    }

    if (action === 'list') {
      const list = await stripe.paymentMethods.list({ customer, type: 'card' });
      const cust = await stripe.customers.retrieve(customer) as any;
      const defaultId = cust?.invoice_settings?.default_payment_method ?? null;
      return json(200, { methods: list.data.map(cardShape), defaultId });
    }

    if (action === 'detach') {
      const pmId = String(body?.paymentMethodId ?? '');
      if (!pmId) return json(400, { error: 'missing paymentMethodId' });
      const pm = await stripe.paymentMethods.retrieve(pmId);
      if ((pm as any).customer !== customer) return json(403, { error: 'not your card' });
      const cust = await stripe.customers.retrieve(customer) as any;
      const defaultId = cust?.invoice_settings?.default_payment_method ?? null;
      let replacementId: string | null = null;
      if (defaultId === pmId) {
        const cards = await stripe.paymentMethods.list({ customer, type: 'card' });
        replacementId = cards.data.find((card) => card.id !== pmId)?.id ?? null;
        if (!replacementId) {
          const [membershipResult, subscriptionsResult] = await Promise.all([
            db.from('memberships').select('id').eq('customer_id', uid)
              .in('status', ['active', 'trialing', 'past_due']).limit(1),
            db.from('subscriptions').select('id').eq('customer_id', uid)
              .in('lifecycle', ['pending_confirmation', 'active', 'paused', 'payment_failed', 'cancellation_scheduled']).limit(1),
          ]);
          if (membershipResult.error || subscriptionsResult.error) {
            throw membershipResult.error ?? subscriptionsResult.error;
          }
          if ((membershipResult.data?.length ?? 0) > 0 || (subscriptionsResult.data?.length ?? 0) > 0) {
            return json(409, { error: 'Add another card before removing the default card used for an active membership or meal plan.' });
          }
        } else {
          await stripe.customers.update(customer, { invoice_settings: { default_payment_method: replacementId } });
        }
      }
      await stripe.paymentMethods.detach(pmId);
      return json(200, { ok: true, defaultId: replacementId });
    }

    if (action === 'default') {
      const pmId = String(body?.paymentMethodId ?? '');
      if (!pmId) return json(400, { error: 'missing paymentMethodId' });
      const pm = await stripe.paymentMethods.retrieve(pmId);
      if ((pm as any).customer !== customer) return json(403, { error: 'not your card' });
      await stripe.customers.update(customer, { invoice_settings: { default_payment_method: pmId } });
      return json(200, { ok: true });
    }

    return json(400, { error: 'unknown action' });
  } catch (_e) {
    return json(500, { error: 'Payment methods are temporarily unavailable. Please try again.' });
  }
});
