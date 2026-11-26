// deno-lint-ignore-file no-explicit-any
// reconcile-payouts: cron-invoked worker. Resolves `payouts` rows connect-payout left
// 'pending' because Stripe's answer was ambiguous (timeout/API error after same-key
// retries), or that got stuck there from a crash between reserve_payout and finalize_payout.
//
// Never mints a NEW idempotency key for an existing payout — only ever replays the original
// `payout_<id>` key (Stripe guarantees that returns the original transfer, never a second
// one) or looks the transfer up by metadata. When the outcome still can't be determined, the
// row is parked as 'needs_review' (money stays reserved) rather than guessed at — a false
// "failed" would let the cook cash the same balance out again on top of a transfer that
// actually went through.
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
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
}
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const MIN_AGE = '10 minutes'; // floor before a row is even eligible — see claim_stale_payouts
const MAX_ATTEMPTS = 20;
const AMBIGUOUS_AGE_MS = 24 * 60 * 60 * 1000; // Stripe's idempotency-key replay window

function isAmbiguousStripeError(err: any): boolean {
  const type = err?.type ?? err?.raw?.type;
  return type === 'StripeConnectionError' || type === 'StripeAPIError' || type === 'StripeTimeoutError';
}
function isIdempotencyMismatch(err: any): boolean {
  return (err?.type ?? err?.raw?.type) === 'StripeInvalidRequestError' && (err?.code ?? err?.raw?.code) === 'idempotency_error';
}

// Search for a transfer already created for this payout by metadata, bounded to a window
// around the payout's created_at (transfers.list has no metadata filter).
async function findTransferByPayoutId(destination: string, payoutId: string, createdAt: Date): Promise<Stripe.Transfer | null> {
  const gte = Math.floor((createdAt.getTime() - 60 * 60 * 1000) / 1000);
  const lte = Math.floor((createdAt.getTime() + AMBIGUOUS_AGE_MS) / 1000);
  let startingAfter: string | undefined;
  for (let page = 0; page < 10; page++) {
    const list = await stripe.transfers.list({ destination, created: { gte, lte }, limit: 100, starting_after: startingAfter });
    const hit = list.data.find((t) => t.metadata?.payout_id === payoutId);
    if (hit) return hit;
    if (!list.has_more) break;
    startingAfter = list.data[list.data.length - 1]?.id;
  }
  return null;
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

  const { data: rows, error: claimErr } = await db.rpc('claim_stale_payouts', { p_min_age: MIN_AGE, p_limit: 50 });
  if (claimErr) return json(500, { error: 'claim failed', detail: claimErr.message });

  const results: any[] = [];
  for (const row of (rows ?? [])) {
    const payoutId = row.payout_id as string;
    const kitchenId = row.kitchen_id as string;
    const destination = row.stripe_account_id as string | null;
    const createdAt = new Date(row.created_at as string);
    const ageMs = Date.now() - createdAt.getTime();
    const attempts = row.reconcile_attempts as number;

    try {
      if (!destination) {
        // No Connect account on file at all — nothing was ever attempted against Stripe.
        await db.rpc('reconcile_payout', { p_payout_id: payoutId, p_outcome: 'needs_review', p_reason: 'no_stripe_account' });
        results.push({ payoutId, outcome: 'needs_review', reason: 'no_stripe_account' });
        continue;
      }

      if (attempts >= MAX_ATTEMPTS) {
        await db.rpc('reconcile_payout', { p_payout_id: payoutId, p_outcome: 'needs_review', p_reason: 'max_attempts' });
        results.push({ payoutId, outcome: 'needs_review', reason: 'max_attempts' });
        continue;
      }

      let transfer: Stripe.Transfer | null = null;
      let outcome: 'paid' | 'failed' | 'needs_review' | 'pending' = 'pending';
      let reason: string | null = null;

      if (ageMs < AMBIGUOUS_AGE_MS) {
        try {
          transfer = await stripe.transfers.create(
            { amount: row.amount_cents, currency: 'usd', destination, metadata: { kitchen_id: kitchenId, payout_id: payoutId } },
            { idempotencyKey: `payout_${payoutId}` },
          );
          outcome = 'paid';
        } catch (err: any) {
          if (isIdempotencyMismatch(err)) {
            transfer = await findTransferByPayoutId(destination, payoutId, createdAt);
            outcome = transfer ? 'paid' : 'needs_review';
            reason = transfer ? null : 'idempotency_mismatch_not_found';
          } else if (isAmbiguousStripeError(err)) {
            outcome = 'pending'; // leave it, try again next tick
          } else {
            outcome = 'failed';
            reason = err?.code ?? err?.type ?? 'stripe_error';
          }
        }
      } else {
        transfer = await findTransferByPayoutId(destination, payoutId, createdAt);
        outcome = transfer ? 'paid' : 'needs_review';
        reason = transfer ? null : 'transfer_not_found_after_24h';
      }

      if (transfer && (transfer.reversed || (transfer.amount_reversed ?? 0) > 0)) {
        outcome = 'needs_review';
        reason = 'transfer_reversed';
      }

      if (outcome !== 'pending') {
        await db.rpc('reconcile_payout', {
          p_payout_id: payoutId,
          p_outcome: outcome,
          p_stripe_transfer_id: outcome === 'paid' ? transfer!.id : null,
          p_reason: reason,
        });
      }
      results.push({ payoutId, outcome, reason });

      // Best-effort: refresh the connected account's flags while we're already looking at it.
      try {
        const sa = await stripe.accounts.retrieve(destination) as any;
        await db.from('stripe_accounts').update({
          charges_enabled: !!sa.charges_enabled,
          payouts_enabled: !!sa.payouts_enabled,
          details_submitted: !!sa.details_submitted,
          updated_at: new Date().toISOString(),
        }).eq('kitchen_id', kitchenId);
      } catch { /* non-fatal */ }
    } catch (e: any) {
      results.push({ payoutId, outcome: 'error', detail: e?.message });
    }
  }

  return json(200, { processed: results.length, results });
});
