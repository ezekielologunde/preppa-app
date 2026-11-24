// deno-lint-ignore-file no-explicit-any
// complete-booking: mark a confirmed booking as completed. Either party may call it. If the
// booking has an unpaid balance (rfq bookings only -- quote total minus the deposit already
// collected at accept_quote time), attempts to charge it off-session on the customer's saved
// card before marking complete. A declined/failed charge never blocks completion -- the job
// already happened -- it's surfaced back to the caller so the UI can prompt the customer to
// arrange payment another way; balance_pi_id stays null so a future recovery workflow can
// identify the unpaid balance. JWT-scoped.
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
      p_action: 'complete_booking', p_max_count: 15, p_window: '10 minutes', p_subject: uid,
    });
    if (rlErr) return json(429, { error: 'Too many attempts. Please wait a few minutes and try again.' });

    const parsed = input.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: 'invalid input' });
    const { bookingId } = parsed.data;

    const { data: bk } = await db.from('bookings')
      .select('id, customer_id, kitchen_id, status, booking_kind, kitchens!inner(owner_id)')
      .eq('id', bookingId).maybeSingle();
    if (!bk) return json(404, { error: 'Booking not found.' });
    const ownerId = (bk as any).kitchens.owner_id;
    if ((bk as any).customer_id !== uid && ownerId !== uid) return json(403, { error: 'Not your booking.' });
    if (!['confirmed', 'in_progress'].includes((bk as any).status)) return json(409, { error: 'This booking cannot be completed.' });

    let balanceCharged = false;
    let balanceChargeError: string | null = null;
    let balanceChargePending = false;

    if ((bk as any).booking_kind === 'rfq') {
      const { data: reserved, error: reserveErr } = await db.rpc('reserve_balance_charge', { p_booking_id: bookingId }).maybeSingle();
      if (reserveErr) {
        // "No balance owed" / "already charged" are expected, non-error outcomes for most
        // bookings (fully-prepaid quotes, or a completion retry after a prior success) --
        // only surface a message for anything else.
        if (/confirmation is already pending/i.test(reserveErr.message ?? '')) {
          balanceChargePending = true;
        } else if (!/no balance owed|already charged/i.test(reserveErr.message ?? '')) {
          balanceChargeError = 'balance_reserve_failed';
        }
      } else if (reserved && (reserved as any).balance_cents > 0) {
        const balanceCents = (reserved as any).balance_cents as number;
        const customerId = (reserved as any).stripe_customer_id as string | null;
        let stripeCreateStarted = false;
        try {
          if (!customerId) throw Object.assign(new Error('no_payment_method'), { code: 'no_payment_method' });
          const pmList = await stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 1 });
          const pm = pmList.data[0]?.id;
          if (!pm) throw Object.assign(new Error('no_payment_method'), { code: 'no_payment_method' });

          stripeCreateStarted = true;
          const pi = await stripe.paymentIntents.create(
            {
              amount: balanceCents,
              currency: 'usd',
              customer: customerId,
              payment_method: pm,
              off_session: true,
              confirm: true,
              metadata: { booking_id: bookingId, kind: 'balance' },
            },
            { idempotencyKey: `bal_${bookingId}` },
          );

          if (pi.status === 'succeeded' || pi.status === 'processing' || pi.status === 'requires_capture') {
            await db.rpc('finalize_balance_charge', { p_booking_id: bookingId, p_stripe_pi_id: pi.id, p_success: true });
            balanceCharged = true;
          } else {
            balanceChargeError = `unexpected_status_${pi.status}`;
            await db.rpc('finalize_balance_charge', { p_booking_id: bookingId, p_stripe_pi_id: null, p_success: false });
          }
        } catch (e: any) {
          const stripeType = e?.type ?? e?.rawType ?? '';
          const ambiguous = stripeCreateStarted && ['StripeConnectionError', 'StripeAPIError', 'StripeTimeoutError'].includes(stripeType);
          if (ambiguous) {
            balanceChargePending = true;
            await db.rpc('mark_balance_charge_ambiguous', { p_booking_id: bookingId });
          } else {
            balanceChargeError = e?.code ?? e?.raw?.code ?? 'charge_failed';
            await db.rpc('finalize_balance_charge', { p_booking_id: bookingId, p_stripe_pi_id: null, p_success: false });
          }
        }
      }
    }

    // Safety net: whatever happened to the balance charge above, the job itself already
    // happened -- always mark complete. finalize_balance_charge already does this when it ran,
    // this is a no-op then; it's the only path when booking_kind !== 'rfq' or no balance was owed.
    await db.from('bookings').update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', bookingId).in('status', ['confirmed', 'in_progress']);

    const other = uid === ownerId ? (bk as any).customer_id : ownerId;
    try {
      await db.rpc('notify', {
        p_user: other, p_kind: 'booking', p_title: 'Booking completed',
        p_body: balanceChargePending
          ? 'A booking was marked complete. The remaining payment is still being confirmed.'
          : balanceChargeError
          ? 'A booking was marked complete. The remaining balance could not be charged.'
          : 'A booking was marked complete.',
      });
    } catch (_e) { /* best-effort */ }

    return json(200, { status: 'completed', balanceCharged, balanceChargeError, balanceChargePending });
  } catch (_e) {
    return json(500, { error: 'Could not complete the booking.' });
  }
});
