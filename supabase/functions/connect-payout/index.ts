// deno-lint-ignore-file no-explicit-any
// SECURITY: cash-out amount/lock now lives in reserve_payout()/finalize_payout() (Postgres RPCs,
// see migrations critical_fix_payout_double_spend_lock and
// critical_fix_finalize_payout_service_role_only). Fixes a Critical finding: this function used to
// read the balance and call Stripe with no lock or idempotency key, so a double/multi-submit cash
// out could extract more real money than the kitchen's ledger balance allowed.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';
import { corsHeaders, json } from './_shared/cors.ts';

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
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
}

// A network/API-level Stripe error means we genuinely don't know whether the transfer was
// created — treating it the same as a definite decline (audit High finding) risks a real
// double-payout: finalize_payout(..., false) marks the reservation 'failed', which frees the
// amount for a fresh reserve_payout() call using a DIFFERENT idempotency key, so if the original
// transfer actually went through, a retry creates a second, real one. Stripe guarantees replaying
// the SAME idempotency key returns the original result (success or the original error) rather
// than creating a new transfer, so retrying with the same key first is always safe.
function isAmbiguousStripeError(err: any): boolean {
  return err?.type === 'StripeConnectionError' || err?.type === 'StripeAPIError' || err?.type === 'StripeTimeoutError';
}
async function createTransferWithRetry(params: any, idempotencyKey: string, maxAttempts = 3) {
  let lastErr: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await stripe.transfers.create(params, { idempotencyKey });
    } catch (err) {
      lastErr = err;
      if (!isAmbiguousStripeError(err) || attempt === maxAttempts) throw err;
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
  throw lastErr;
}

// reserve_payout relies on auth.uid() for its ownership check, so it must be called with the
// caller's own JWT. finalize_payout is service_role-only (never callable by the client directly) —
// it's invoked below via the admin() client, after this function has itself confirmed (via
// reserve_payout, which checked ownership) that a real Stripe transfer either succeeded or failed.
function asUser(jwt: string) {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
}

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

    const { error: rlErr } = await db.rpc('check_rate_limit', {
      p_action: 'connect_payout', p_max_count: 10, p_window: '10 minutes', p_subject: userId,
    });
    if (rlErr) return json(429, { error: 'Too many attempts. Please wait a few minutes and try again.' });

    const { kitchenId } = await req.json();
    if (typeof kitchenId !== 'string') return json(400, { error: 'kitchenId required' });

    const dbAsUser = asUser(jwt);
    const { data: reserved, error: reserveErr } = await dbAsUser.rpc('reserve_payout', { p_kitchen_id: kitchenId }).single();
    if (reserveErr || !reserved) {
      const code = (reserveErr as any)?.code;
      if (code === '42501') return json(403, { error: 'not your kitchen' });
      if (code === 'P0001') return json(400, { error: 'Finish payout setup first.' });
      if (code === 'P0002') return json(400, { error: 'Nothing to cash out yet.' });
      return json(500, { error: 'Payout failed. Please try again.' });
    }
    const { payout_id, amount_cents, stripe_account_id } = reserved as any;

    try {
      const transfer = await createTransferWithRetry({
        amount: amount_cents,
        currency: 'usd',
        destination: stripe_account_id,
        metadata: { kitchen_id: kitchenId, payout_id },
      }, `payout_${payout_id}`);

      await db.rpc('finalize_payout', { p_payout_id: payout_id, p_stripe_transfer_id: transfer.id, p_success: true });
      return json(200, { amountCents: amount_cents });
    } catch (stripeErr: any) {
      if (isAmbiguousStripeError(stripeErr)) {
        // Genuinely unknown outcome even after same-key retries. Do NOT call finalize_payout —
        // leaving the payout row 'pending' keeps its amount counted as reserved (reserve_payout's
        // v_pending sum only excludes 'failed'/'paid'/'needs_review'), so the cook can't trigger a
        // second real transfer for the same funds. The reconcile-payouts cron worker picks up any
        // row still pending after 10 minutes and resolves it (replays the same idempotency key,
        // then falls back to looking the transfer up by metadata) — this is no longer a dead end.
        return json(202, { pending: true, message: 'We couldn’t confirm your payout went through yet. We’re checking automatically — check back shortly, no need to try again.' });
      }
      await db.rpc('finalize_payout', { p_payout_id: payout_id, p_stripe_transfer_id: null, p_success: false });
      throw stripeErr;
    }
  } catch (_e) {
    return json(500, { error: 'Payout failed. Please try again.' });
  }
});
