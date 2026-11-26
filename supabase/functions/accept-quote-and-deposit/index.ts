// deno-lint-ignore-file no-explicit-any
// accept-quote-and-deposit: customer accepts a quote → creates a booking (pending_deposit) and a
// Stripe PaymentIntent for the deposit (service fee + cook's deposit) on Preppa. The booking is
// finalized/confirmed and the cook credited by the reconcile trigger once the deposit is paid.
// PrepPlus members: Preppa's service fee is waived (0%) — computed server-side, never trusting the client.
//
// SECURITY: the accept step itself (lock, re-check quote status, refuse if the request already has
// an active booking, expire competing quotes) all happens inside the accept_quote() Postgres RPC —
// see migration critical_fix_quote_double_booking_lock. That closes a Critical finding: two
// different quotes on the same service_request could previously both be accepted, paid, and
// confirmed (this function's old idempotency key only deduped repeat calls for the SAME quote).
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
const stripe = new Stripe(requireEnv('STRIPE_SECRET_KEY'), { apiVersion: '2024-06-20', httpClient: Stripe.createFetchHttpClient() });
function admin() {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
}
// accept_quote() relies on auth.uid() for its ownership check, so it must be called with the
// caller's own JWT (not the service-role admin client, which has no JWT/auth.uid() context).
function asUser(jwt: string) {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
}
async function getOrCreateCustomer(db: any, uid: string, email: string | null): Promise<string> {
  const { data: prof } = await db.from('profiles').select('stripe_customer_id').eq('id', uid).maybeSingle();
  if (prof?.stripe_customer_id) return prof.stripe_customer_id as string;
  const customer = await stripe.customers.create({ email: email ?? undefined, metadata: { user_id: uid } });
  await db.from('profiles').update({ stripe_customer_id: customer.id }).eq('id', uid);
  return customer.id;
}

const input = z.object({ quoteId: z.string().uuid() });

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

    const { error: rlErr } = await db.rpc('check_rate_limit', {
      p_action: 'accept_quote_deposit', p_max_count: 15, p_window: '10 minutes', p_subject: uid,
    });
    if (rlErr) return json(429, { error: 'Too many attempts. Please wait a few minutes and try again.' });

    const parsed = input.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: 'invalid input', issues: parsed.error.issues });
    const { quoteId } = parsed.data;

    const dbAsUser = asUser(jwt);
    const { data: accepted, error: acceptErr } = await dbAsUser.rpc('accept_quote', { p_quote_id: quoteId }).single();
    if (acceptErr || !accepted) {
      const code = (acceptErr as any)?.code;
      if (code === 'P0010') return json(404, { error: 'Quote not found.' });
      if (code === '42501') return json(403, { error: 'Not your request.' });
      if (code === 'P0011') return json(409, { error: 'This quote can no longer be accepted.' });
      if (code === 'P0012') return json(409, { error: 'This request already has an active booking.' });
      if (code === 'P0013') return json(400, { error: 'This cook has not finished payout setup yet.' });
      return json(500, { error: 'Could not start your booking. Please try again.' });
    }
    const bk = accepted as any;

    const stripeCustomerId = await getOrCreateCustomer(db, uid, email);
    const idem = 'bk_' + quoteId;
    if (bk.reused) {
      const { data: existing, error: existingError } = await dbAsUser.from('bookings').select('deposit_pi_id, status').eq('id', bk.booking_id).maybeSingle();
      if (existingError || !existing) throw existingError ?? new Error('booking_not_found');
      if (['confirmed', 'in_progress', 'completed'].includes(existing.status)) {
        return json(200, { bookingId: bk.booking_id, clientSecret: null, depositCents: bk.deposit_cents, totalCents: bk.amount_cents, alreadyPaid: true, reused: true });
      }
      if (existing.status !== 'pending_deposit') return json(409, { error: 'This booking is no longer payable.' });
      if (existing.deposit_pi_id) {
        const prior = await stripe.paymentIntents.retrieve(existing.deposit_pi_id);
        if (prior.status === 'succeeded') return json(200, { bookingId: bk.booking_id, clientSecret: null, depositCents: bk.deposit_cents, totalCents: bk.amount_cents, alreadyPaid: true, reused: true });
        if (!prior.client_secret) throw new Error('payment_intent_missing_client_secret');
        return json(200, { bookingId: bk.booking_id, clientSecret: prior.client_secret, depositCents: bk.deposit_cents, totalCents: bk.amount_cents, alreadyPaid: false, reused: true });
      }
    }
    const pi = await stripe.paymentIntents.create({
      amount: bk.deposit_cents, currency: 'usd', customer: stripeCustomerId,
      automatic_payment_methods: { enabled: true },
      metadata: { booking_id: bk.booking_id, customer_id: uid, kitchen_id: bk.out_kitchen_id },
    }, { idempotencyKey: idem });
    await db.from('bookings').update({ deposit_pi_id: pi.id }).eq('id', bk.booking_id);

    return json(200, { bookingId: bk.booking_id, clientSecret: pi.client_secret, depositCents: bk.deposit_cents, totalCents: bk.amount_cents, alreadyPaid: pi.status === 'succeeded', reused: !!bk.reused });
  } catch (_e) {
    return json(500, { error: 'Could not start your booking. Please try again.' });
  }
});
