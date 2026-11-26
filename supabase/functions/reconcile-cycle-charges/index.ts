// deno-lint-ignore-file no-explicit-any
// Reconciles subscription cycles whose original Stripe request returned ambiguously.
// It never creates a PaymentIntent. It only finds the original by metadata and applies its
// authoritative state, or releases the cycle after a 24-hour exhaustive no-match window.
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
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required secret: ${name}`);
  if (name === 'STRIPE_SECRET_KEY' && !stripeGuardKeyModeMatches(value)) throw new Error(STRIPE_GUARD_FAILURE_MESSAGE);
  return value;
}

const stripe = new Stripe(requireEnv('STRIPE_SECRET_KEY'), {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});
function admin() {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
}
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const MIN_AGE = '10 minutes';
const NO_MATCH_AGE_MS = 24 * 60 * 60 * 1000;

async function findCyclePaymentIntent(customerId: string, cycleId: string, ambiguousAt: Date): Promise<Stripe.PaymentIntent | null> {
  const created = { gte: Math.floor((ambiguousAt.getTime() - 60 * 60 * 1000) / 1000) };
  let startingAfter: string | undefined;
  for (let page = 0; page < 10; page++) {
    const list = await stripe.paymentIntents.list({ customer: customerId, created, limit: 100, starting_after: startingAfter });
    const hit = list.data.find((pi: Stripe.PaymentIntent) => pi.metadata?.cycle_id === cycleId);
    if (hit) return hit;
    if (!list.has_more) return null;
    startingAfter = list.data[list.data.length - 1]?.id;
  }
  throw new Error('payment_intent_search_limit_reached');
}

Deno.serve(async (req) => {
  if (!(await stripeKeyModeGuard())) return stripeGuardFailureResponse();
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json(401, { error: 'unauthorized' });

  const db = admin();
  const { data: ok } = await db.rpc('verify_worker_secret', { p_token: authHeader.substring(7) });
  if (ok !== true) return json(401, { error: 'unauthorized' });

  const { data: rows, error: claimError } = await db.rpc('claim_ambiguous_cycle_charges', { p_min_age: MIN_AGE, p_limit: 50 });
  if (claimError) return json(500, { error: 'claim failed', detail: claimError.message });

  const results: any[] = [];
  for (const row of rows ?? []) {
    const cycleId = row.cycle_id as string;
    const ambiguousAt = new Date(row.ambiguous_at as string);
    try {
      if (!row.stripe_customer_id) {
        await db.rpc('flag_ambiguous_cycle_charge', { p_cycle: cycleId, p_reason: 'missing_stripe_customer' });
        results.push({ cycleId, outcome: 'needs_review', reason: 'missing_stripe_customer' });
        continue;
      }
      const pi = await findCyclePaymentIntent(row.stripe_customer_id as string, cycleId, ambiguousAt);
      if (!pi) {
        if (Date.now() - ambiguousAt.getTime() >= NO_MATCH_AGE_MS) {
          await db.rpc('mark_cycle_failed', { p_cycle: cycleId, p_err: 'ambiguous_not_found_after_24h' });
          results.push({ cycleId, outcome: 'failed', reason: 'not_found_after_24h' });
        } else {
          results.push({ cycleId, outcome: 'pending', reason: 'not_found_yet' });
        }
        continue;
      }

      if (pi.amount !== row.total_cents || pi.currency !== 'usd') {
        await db.rpc('flag_ambiguous_cycle_charge', { p_cycle: cycleId, p_reason: 'payment_intent_terms_mismatch' });
        results.push({ cycleId, outcome: 'needs_review', pi: pi.id, reason: 'terms_mismatch' });
      } else if (['succeeded', 'processing', 'requires_capture'].includes(pi.status)) {
        await db.rpc('mark_cycle_charged', { p_cycle: cycleId, p_pi: pi.id });
        results.push({ cycleId, outcome: 'charged', pi: pi.id, status: pi.status });
      } else if (pi.status === 'requires_action') {
        await db.rpc('mark_cycle_action_required', { p_cycle: cycleId, p_pi: pi.id, p_err: 'requires_action' });
        results.push({ cycleId, outcome: 'action_required', pi: pi.id });
      } else if (pi.status === 'requires_payment_method' || pi.status === 'canceled') {
        await db.rpc('mark_cycle_failed', { p_cycle: cycleId, p_err: `reconciled_${pi.status}` });
        results.push({ cycleId, outcome: 'failed', pi: pi.id, status: pi.status });
      } else {
        results.push({ cycleId, outcome: 'pending', pi: pi.id, status: pi.status });
      }
    } catch (error: any) {
      results.push({ cycleId, outcome: 'error', detail: error?.message ?? 'reconciliation_error' });
    }
  }

  return json(200, { processed: results.length, results });
});
