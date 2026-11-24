// deno-lint-ignore-file no-explicit-any
// cancel-experience-booking: a customer cancels their confirmed experience booking. Applies the
// experience's cancellation policy (flexible=24h / standard=48h / strict=none) against the session
// start; if within the free-cancel window issues a FULL Stripe refund, then finalize_experience_cancel
// claws back the cook's ledger credit + releases the seat. Outside the window (or strict) → no refund,
// booking cancelled, seat stays consumed. Full payment upfront model.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';
import { z } from 'https://esm.sh/zod@3.23.8';

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
function admin() {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
}
const stripe = new Stripe(requireEnv('STRIPE_SECRET_KEY'), { apiVersion: '2024-06-20', httpClient: Stripe.createFetchHttpClient() });
const WINDOW_HOURS: Record<string, number | null> = { flexible: 24, standard: 48, strict: null }; // null = never refundable

const input = z.object({ bookingId: z.string().uuid() });

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
      p_action: 'cancel_experience_booking', p_max_count: 15, p_window: '10 minutes', p_subject: uid,
    });
    if (rlErr) return json(429, { error: 'Too many attempts. Please wait a few minutes and try again.' });

    const parsed = input.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: 'invalid input' });

    const { data: b } = await db.from('bookings')
      .select('id, customer_id, status, deposit_cents, deposit_pi_id, session_id, experiences(cancellation_policy)')
      .eq('id', parsed.data.bookingId).maybeSingle();
    if (!b || b.customer_id !== uid) return json(404, { error: 'Booking not found.' });
    if (b.booking_kind !== undefined && b.booking_kind !== null && b.booking_kind !== 'experience') { /* keep tolerant */ }
    if (!['confirmed', 'pending_deposit'].includes(b.status)) return json(409, { error: 'This booking can’t be cancelled.' });

    // resolve the session start to apply the policy window
    const { data: s } = await db.from('experience_sessions').select('starts_at').eq('id', b.session_id).maybeSingle();
    const startsAt = s?.starts_at ? new Date(s.starts_at).getTime() : 0;
    const policy = (b as any).experiences?.cancellation_policy ?? 'strict';
    const win = WINDOW_HOURS[policy];
    const withinWindow = win !== null && win !== undefined && Date.now() < startsAt - win * 3600_000;

    let refundedCents = 0;
    if (b.status === 'confirmed' && withinWindow) {
      refundedCents = b.deposit_cents ?? 0;
      if (refundedCents > 0 && b.deposit_pi_id) {
        // Idempotency key (audit High finding): dedupes a double-submit/retry on Stripe's side.
        try { await stripe.refunds.create({ payment_intent: b.deposit_pi_id }, { idempotencyKey: `refund_${b.id}` }); }
        catch (_e) { return json(502, { error: 'Refund could not be processed. Please contact support.' }); }
      }
    }
    // pending_deposit never had a settled charge → refundedCents stays 0 (just cancel + free the seat)
    if (b.status === 'pending_deposit') { await db.rpc('release_experience_seats', { p_booking: b.id }); }

    const { error: finErr } = await db.rpc('finalize_experience_cancel', { p_booking: b.id, p_refunded_cents: refundedCents });
    if (finErr) return json(500, { error: 'Could not finalize the cancellation.' });

    return json(200, { refundedCents, status: refundedCents > 0 ? 'refunded' : 'cancelled' });
  } catch (_e) {
    return json(500, { error: 'Could not cancel this booking. Please try again.' });
  }
});
