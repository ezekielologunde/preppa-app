// deno-lint-ignore-file no-explicit-any
// Reconciles subscription cycles whose original Stripe request returned ambiguously.
// It never creates a PaymentIntent. It only finds the original by metadata and applies its
// authoritative state, or releases the cycle after a 24-hour exhaustive no-match window.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required secret: ${name}`);
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
