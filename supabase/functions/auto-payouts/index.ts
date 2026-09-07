// deno-lint-ignore-file no-explicit-any
// auto-payouts: cron-invoked worker (weekly). Sweeps eligible kitchens' balances out via
// Stripe Transfer, same as a manual cash-out (connect-payout) but initiated by the platform.
// claim_auto_payouts() does all the eligibility/locking/threshold logic and inserts a
// source='auto' payouts row per kitchen; this function's only job is to turn each of those
// into a real Stripe transfer using the exact same idempotency-key + ambiguous-error handling
// as connect-payout, so a stuck row here is picked up by reconcile-payouts exactly like a
// stuck manual cash-out would be.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing required secret: ${name}`);
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

function isAmbiguousStripeError(err: any): boolean {
  const type = err?.type ?? err?.raw?.type;
  return type === 'StripeConnectionError' || type === 'StripeAPIError' || type === 'StripeTimeoutError';
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

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json(401, { error: 'unauthorized' });
  const token = authHeader.substring(7);

  const db = admin();
  const { data: ok } = await db.rpc('verify_worker_secret', { p_token: token });
  if (ok !== true) return json(401, { error: 'unauthorized' });

  const { data: claimed, error: claimErr } = await db.rpc('claim_auto_payouts', { p_limit: 50 });
  if (claimErr) return json(500, { error: 'claim failed', detail: claimErr.message });

  const results: any[] = [];
  for (const row of (claimed ?? [])) {
    const payoutId = row.payout_id as string;
    const kitchenId = row.kitchen_id as string;
    const destination = row.stripe_account_id as string;
    try {
      const transfer = await createTransferWithRetry(
        { amount: row.amount_cents, currency: 'usd', destination, metadata: { kitchen_id: kitchenId, payout_id: payoutId } },
        `payout_${payoutId}`,
      );
      await db.rpc('finalize_payout', { p_payout_id: payoutId, p_stripe_transfer_id: transfer.id, p_success: true });
      await db.rpc('notify', {
        p_user: row.owner_id,
        p_kind: 'payout',
        p_title: 'Payout sent',
        p_body: `We sent $${(row.amount_cents / 100).toFixed(2)} to your bank.`,
      });
      results.push({ payoutId, status: 'paid' });
    } catch (err: any) {
      if (isAmbiguousStripeError(err)) {
        // Same discipline as connect-payout: leave it pending. reconcile-payouts resolves it.
        results.push({ payoutId, status: 'pending_ambiguous' });
      } else {
        await db.rpc('finalize_payout', { p_payout_id: payoutId, p_stripe_transfer_id: null, p_success: false });
        results.push({ payoutId, status: 'failed', detail: err?.message });
      }
    }
  }

  return json(200, { processed: results.length, results });
});
