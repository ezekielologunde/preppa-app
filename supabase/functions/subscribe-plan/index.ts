// deno-lint-ignore-file no-explicit-any
// subscribe-plan: app-controlled meal-plan subscription. Creates the subscription +
// its first cycle; NO charge here — the charge-due-cycles worker bills each cycle at its
// billing_date after the selection window closes. Preppa remains the payment hub.
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
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});
function admin() {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } });
}
async function getOrCreateCustomer(db: any, uid: string, email: string | null): Promise<string> {
  const { data: prof } = await db.from('profiles').select('stripe_customer_id').eq('id', uid).maybeSingle();
  if (prof?.stripe_customer_id) return prof.stripe_customer_id as string;
  const customer = await stripe.customers.create({ email: email ?? undefined, metadata: { user_id: uid } });
  await db.from('profiles').update({ stripe_customer_id: customer.id }).eq('id', uid);
  return customer.id;
}
// date-only helpers (UTC)
function today(): Date { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; }
function iso(d: Date): string { return d.toISOString().slice(0, 10); }

const input = z.object({
  planId: z.string().uuid(),
  paymentMethodId: z.string().min(3).max(120).optional(),
  kind: z.enum(['weekly', 'biweekly', 'trial']).default('weekly'),
  fulfillment: z.enum(['pickup', 'delivery']).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  preferredDay: z.string().max(12).optional(),
  selection: z.array(z.object({ mealId: z.string().uuid(), qty: z.number().int().min(1).max(20) })).max(50).optional(),
  preferences: z.object({
    dietary: z.array(z.string()).max(30).optional(),
    allergies: z.array(z.string()).max(30).optional(),
    dislikes: z.array(z.string()).max(30).optional(),
    servingSize: z.number().int().min(1).max(20).optional(),
    spiceLevel: z.number().int().min(0).max(5).optional(),
    householdSize: z.number().int().min(1).max(30).optional(),
    notes: z.string().max(500).optional(),
  }).optional(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });
  try {
    const db = admin();
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData, error: userErr } = await db.auth.getUser(jwt);
    if (userErr || !userData.user) return json(401, { error: 'unauthorized' });
    const uid = userData.user.id;
    const email = userData.user.email ?? null;

    const { error: rlErr } = await db.rpc('check_rate_limit', {
      p_action: 'subscribe_plan', p_max_count: 10, p_window: '10 minutes', p_subject: uid,
    });
    if (rlErr) return json(429, { error: 'Too many attempts. Please wait a few minutes and try again.' });

    const parsed = input.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: 'invalid input', issues: parsed.error.issues });
    const inp = parsed.data;

    const { data: plan } = await db.from('plans')
      .select('id, kitchen_id, price_cents, status, selection_model, fulfillment, lead_time_hours, cutoff_hours, delivery_days, trial_cycles, meals_per_delivery')
      .eq('id', inp.planId).maybeSingle();
    if (!plan || plan.status !== 'active') return json(404, { error: 'This plan is not available.' });

    const { data: kitchen } = await db.from('kitchens').select('owner_id').eq('id', plan.kitchen_id).maybeSingle();
    if (kitchen?.owner_id === uid) return json(400, { error: "You can't subscribe to your own plan." });

    // Defense-in-depth (plan-upsert already blocks creating a new plan without this) --
    // a plan created before that gate shipped, or one whose kitchen's payouts lapsed since
    // publishing, must still not be subscribable.
    const { data: acct } = await db.from('stripe_accounts').select('payouts_enabled').eq('kitchen_id', plan.kitchen_id).maybeSingle();
    if (!acct?.payouts_enabled) return json(409, { error: 'This plan is not accepting subscribers right now.' });

    // Vacation mode (audit High finding): only single-order checkout respected this before.
    // Scope note: this blocks NEW signups only -- whether an in-progress subscriber's cycles
    // should also pause when their kitchen goes on vacation mid-subscription is a separate
    // product decision, not changed here.
    const { data: orderable } = await db.rpc('is_kitchen_orderable', { kid: plan.kitchen_id });
    if (!orderable) return json(409, { error: 'This kitchen is not taking new plan subscribers right now.' });

    // one active subscription per plan
    const { data: dupe } = await db.from('subscriptions').select('id')
      .eq('customer_id', uid).eq('plan_id', plan.id)
      .in('lifecycle', ['draft', 'pending_confirmation', 'active', 'paused', 'payment_failed']).maybeSingle();
    if (dupe) return json(409, { error: "You're already subscribed to this plan.", code: 'already_subscribed' });

    // require a saved card (charged later, per cycle)
    const stripeCustomerId = await getOrCreateCustomer(db, uid, email);
    let pmId = inp.paymentMethodId;
    if (!pmId) {
      const list = await stripe.paymentMethods.list({ customer: stripeCustomerId, type: 'card', limit: 1 });
      pmId = list.data[0]?.id;
    }
    if (!pmId) return json(400, { error: 'Add a card first, then subscribe.', code: 'no_card' });
    try { await stripe.paymentMethods.attach(pmId, { customer: stripeCustomerId }); } catch (_e) { /* already attached */ }
    try { await stripe.customers.update(stripeCustomerId, { invoice_settings: { default_payment_method: pmId } }); } catch (_e) { /* non-fatal */ }

    // first delivery date: clamp to today + lead time (min tomorrow)
    const leadDays = Math.max(1, Math.ceil((plan.lead_time_hours ?? 48) / 24));
    const minStart = addDays(today(), leadDays);
    let start = inp.startDate ? new Date(inp.startDate + 'T00:00:00Z') : minStart;
    if (start < minStart) start = minStart;
    const cadenceWeeks = inp.kind === 'biweekly' ? 2 : 1;
    const trialCycles = inp.kind === 'trial' ? (plan.trial_cycles ?? 1) : 0;

    const { data: sub, error: sErr } = await db.from('subscriptions').insert({
      customer_id: uid, kitchen_id: plan.kitchen_id, plan_id: plan.id,
      lifecycle: 'active', status: 'active', kind: inp.kind, cadence_weeks: cadenceWeeks,
      fulfillment: inp.fulfillment ?? plan.fulfillment ?? 'delivery',
      billing_anchor: iso(start), next_cycle_date: iso(start),
      stripe_payment_method_id: pmId, preferred_day: inp.preferredDay ?? null,
      trial_cycles_remaining: trialCycles,
    }).select('id').single();
    if (sErr) throw sErr;
    const subId = sub.id as string;

    // preferences (customer-provided, not medical)
    if (inp.preferences) {
      const p = inp.preferences;
      await db.from('subscription_preferences').upsert({
        subscription_id: subId,
        dietary_tags: p.dietary ?? [], allergies: p.allergies ?? [], dislikes: p.dislikes ?? [],
        serving_size: p.servingSize ?? null, spice_level: p.spiceLevel ?? null,
        household_size: p.householdSize ?? null, notes: p.notes ?? null, updated_at: new Date().toISOString(),
      });
    }

    // materialize the first cycle now (don't wait up to 5 min for the cron)
    await db.rpc('advance_cycles');
    const { data: cycle } = await db.from('subscription_cycles')
      .select('id, delivery_date, billing_date, selection_deadline, status')
      .eq('subscription_id', subId).order('cycle_start', { ascending: true }).limit(1).maybeSingle();

    // customer_choice: seed the first cycle's selection (service role bypasses the window trigger)
    if (cycle && plan.selection_model === 'customer_choice' && inp.selection && inp.selection.length) {
      const mealIds = [...new Set(inp.selection.map((i) => i.mealId))];
      const { data: valid } = await db.from('meals').select('id').eq('kitchen_id', plan.kitchen_id).in('id', mealIds);
      const ok = new Set((valid ?? []).map((m: any) => m.id));
      const rows = inp.selection.filter((i) => ok.has(i.mealId)).map((i) => ({ cycle_id: cycle.id, meal_id: i.mealId, qty: i.qty }));
      if (rows.length && cycle.status === 'selection_open') {
        await db.from('subscription_cycle_items').delete().eq('cycle_id', cycle.id);
        await db.from('subscription_cycle_items').insert(rows);
      }
    }

    return json(200, {
      subscriptionId: subId, status: 'active',
      cycleId: cycle?.id ?? null,
      firstDeliveryDate: cycle?.delivery_date ?? iso(start),
      firstBillingDate: cycle?.billing_date ?? null,
      selectionDeadline: cycle?.selection_deadline ?? null,
    });
  } catch (_e) {
    return json(500, { error: 'Could not start your plan. Please try again.' });
  }
});
