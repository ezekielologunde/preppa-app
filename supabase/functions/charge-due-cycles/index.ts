// deno-lint-ignore-file no-explicit-any
// charge-due-cycles: cron-invoked worker. Claims selection_closed cycles due for
// billing and charges the saved card off-session. Order/ledger are created by the
// reconcile_paid_pi trigger when the PI settles (branch on metadata.cycle_id).
// The Stripe idempotency key includes the per-cycle attempt count so a genuine retry
// (after a decline) uses a FRESH key instead of returning the prior failed PI.
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
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function resolvePaymentMethod(db: any, customerId: string | null, pmId: string | null): Promise<string | null> {
  if (pmId) return pmId;
  if (!customerId) return null;
  const list = await stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 1 });
  return list.data[0]?.id ?? null;
}

// Same audit finding as connect-payout: a network/API-level error means the charge's real
// outcome is unknown. claim_cycles_for_charge() already set payment_status='charging' before this
// runs, and that status is excluded from future claims — so as long as we do NOT call
// mark_cycle_failed/mark_cycle_action_required on an ambiguous error, the cycle simply stays
// 'charging' and can't be auto-retried with a fresh (different) idempotency key, which is what
// would risk a real double-charge if the original PaymentIntent actually went through. Retrying
// with the SAME idempotency key first (Stripe replays the original result) resolves most of these
// immediately instead of leaving the cycle stuck.
function isAmbiguousStripeError(err: any): boolean {
  const type = err?.type ?? err?.raw?.type;
  return type === 'StripeConnectionError' || type === 'StripeAPIError' || type === 'StripeTimeoutError';
}
async function createPaymentIntentWithRetry(params: any, idempotencyKey: string, maxAttempts = 3) {
  let lastErr: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await stripe.paymentIntents.create(params, { idempotencyKey });
    } catch (err) {
      lastErr = err;
      if (!isAmbiguousStripeError(err) || attempt === maxAttempts) throw err;
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
  throw lastErr;
}

Deno.serve(async (req) => {
  if (!(await stripeKeyModeGuard())) return stripeGuardFailureResponse();
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json(401, { error: 'unauthorized' });
  const token = authHeader.substring(7);

  const db = admin();
  const { data: ok } = await db.rpc('verify_worker_secret', { p_token: token });
  if (ok !== true) return json(401, { error: 'unauthorized' });

  const { data: cycles, error: claimErr } = await db.rpc('claim_cycles_for_charge', { p_limit: 50 });
  if (claimErr) return json(500, { error: 'claim failed', detail: claimErr.message });

  const results: any[] = [];
  for (const c of (cycles ?? [])) {
    const cycleId = c.cycle_id as string;
    const attempt = c.charge_attempts ?? 1;
    try {
      const pm = await resolvePaymentMethod(db, c.stripe_customer_id, c.stripe_payment_method_id);
      if (!c.stripe_customer_id || !pm) {
        await db.rpc('mark_cycle_failed', { p_cycle: cycleId, p_err: 'no_payment_method' });
        results.push({ cycleId, status: 'failed', reason: 'no_payment_method' });
        continue;
      }
      const pi = await createPaymentIntentWithRetry(
        {
          amount: c.total_cents,
          currency: 'usd',
          customer: c.stripe_customer_id,
          payment_method: pm,
          off_session: true,
          confirm: true,
          metadata: {
            cycle_id: cycleId,
            subscription_id: c.subscription_id,
            kitchen_id: c.kitchen_id,
            kind: 'cycle',
          },
        },
        `cyc_${cycleId}_a${attempt}`,
      );
      if (pi.status === 'succeeded' || pi.status === 'processing' || pi.status === 'requires_capture') {
        await db.rpc('mark_cycle_charged', { p_cycle: cycleId, p_pi: pi.id });
        results.push({ cycleId, status: 'charged', pi: pi.id });
      } else if (pi.status === 'requires_action') {
        await db.rpc('mark_cycle_action_required', { p_cycle: cycleId, p_pi: pi.id, p_err: 'requires_action' });
        results.push({ cycleId, status: 'action_required', pi: pi.id });
      } else {
        await db.rpc('mark_cycle_failed', { p_cycle: cycleId, p_err: `unexpected_status_${pi.status}` });
        results.push({ cycleId, status: 'failed', reason: pi.status });
      }
    } catch (e: any) {
      const code = e?.code ?? e?.raw?.code ?? '';
      const piId = e?.raw?.payment_intent?.id ?? null;
      if (isAmbiguousStripeError(e)) {
        // Unknown outcome even after same-key retries. Mark the reason while leaving the cycle
        // in `charging`; advance_cycles only reaps pre-Stripe crashes and must never release an
        // ambiguous charge for a fresh idempotency key.
        await db.rpc('mark_cycle_charge_ambiguous', { p_cycle: cycleId });
        results.push({ cycleId, status: 'ambiguous', reason: e?.type ?? 'connection_error' });
      } else if (code === 'authentication_required') {
        await db.rpc('mark_cycle_action_required', { p_cycle: cycleId, p_pi: piId, p_err: code });
        results.push({ cycleId, status: 'action_required', reason: code });
      } else {
        await db.rpc('mark_cycle_failed', { p_cycle: cycleId, p_err: code || (e?.message ?? 'charge_error') });
        results.push({ cycleId, status: 'failed', reason: code || 'charge_error' });
      }
    }
  }

  return json(200, { claimed: (cycles ?? []).length, results });
});
