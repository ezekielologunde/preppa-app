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
