// deno-lint-ignore-file no-explicit-any
// charge-due-cycles: cron-invoked worker. Claims selection_closed cycles due for
// billing and charges the saved card off-session. Order/ledger are created by the
// reconcile_paid_pi trigger when the PI settles (branch on metadata.cycle_id).
// The Stripe idempotency key includes the per-cycle attempt count so a genuine retry
// (after a decline) uses a FRESH key instead of returning the prior failed PI.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});
function admin() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
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

Deno.serve(async (req) => {
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
      const pi = await stripe.paymentIntents.create(
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
        { idempotencyKey: `cyc_${cycleId}_a${attempt}` },
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
      if (code === 'authentication_required') {
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
