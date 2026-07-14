// deno-lint-ignore-file no-explicit-any
// subscribe-box: a customer builds their OWN cross-kitchen weekly box (≥2 meals across any
// cooks). Creates a plan-less box subscription + its standing selection; each cycle is charged
// once and the reconcile splits the credit to each cook (Model B). No charge at signup.
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
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2024-06-20', httpClient: Stripe.createFetchHttpClient() });
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
function today(): Date { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; }
function iso(d: Date): string { return d.toISOString().slice(0, 10); }

const input = z.object({
  items: z.array(z.object({ mealId: z.string().uuid(), qty: z.number().int().min(1).max(20) })).min(2).max(30),
  paymentMethodId: z.string().min(3).max(120).optional(),
  kind: z.enum(['weekly', 'biweekly']).default('weekly'),
  fulfillment: z.enum(['pickup', 'delivery']).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  preferredDay: z.string().max(12).optional(),
});

const DISCOUNT_BPS = 1000; // 10% bundle discount, funded by Preppa's margin
const BOX_FEE_BPS = 1500;  // box service fee (vs 10% single-plan)

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

    const parsed = input.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: 'invalid input', issues: parsed.error.issues });
    const inp = parsed.data;

    // validate meals: live + collect distinct kitchens (a real box spans ≥1 kitchen)
    const mealIds = [...new Set(inp.items.map((i) => i.mealId))];
    const { data: meals } = await db.from('meals').select('id, kitchen_id, status, price_cents').in('id', mealIds);
    if (!meals || meals.length !== mealIds.length) return json(400, { error: 'Some meals are unavailable.' });
    for (const m of meals as any[]) if (m.status !== 'live') return json(409, { error: 'A meal in your box is no longer available.' });
    // can't include your own kitchen's meals (you'd be paying yourself)
    const { data: myKitchen } = await db.from('kitchens').select('id').eq('owner_id', uid);
    const mine = new Set((myKitchen ?? []).map((k: any) => k.id));
    if ((meals as any[]).some((m) => mine.has(m.kitchen_id))) return json(400, { error: "You can't add your own meals to a box." });

    const stripeCustomerId = await getOrCreateCustomer(db, uid, email);
    let pmId = inp.paymentMethodId;
    if (!pmId) { const list = await stripe.paymentMethods.list({ customer: stripeCustomerId, type: 'card', limit: 1 }); pmId = list.data[0]?.id; }
    if (!pmId) return json(400, { error: 'Add a card first, then subscribe.', code: 'no_card' });
    try { await stripe.paymentMethods.attach(pmId, { customer: stripeCustomerId }); } catch (_e) { /* already attached */ }
    try { await stripe.customers.update(stripeCustomerId, { invoice_settings: { default_payment_method: pmId } }); } catch (_e) { /* non-fatal */ }

    const minStart = addDays(today(), 2);
    let start = inp.startDate ? new Date(inp.startDate + 'T00:00:00Z') : minStart;
    if (start < minStart) start = minStart;
    const cadenceWeeks = inp.kind === 'biweekly' ? 2 : 1;

    const { data: sub, error: sErr } = await db.from('subscriptions').insert({
      customer_id: uid, kitchen_id: null, plan_id: null,
      lifecycle: 'active', status: 'active', kind: 'box', cadence_weeks: cadenceWeeks,
      fulfillment: inp.fulfillment ?? 'delivery', billing_anchor: iso(start), next_cycle_date: iso(start),
      stripe_payment_method_id: pmId, preferred_day: inp.preferredDay ?? null,
      discount_bps: DISCOUNT_BPS, service_fee_bps: BOX_FEE_BPS,
    }).select('id').single();
    if (sErr) throw sErr;
    const subId = sub.id as string;

    // standing box selection (trigger freezes kitchen_id + unit price from the meal)
    const priceById = new Map((meals as any[]).map((m) => [m.id, m.price_cents as number]));
    const rows = inp.items.map((i) => ({ subscription_id: subId, meal_id: i.mealId, qty: i.qty, unit_price_cents: priceById.get(i.mealId) ?? 0 }));
    const { error: iErr } = await db.from('subscription_box_items').insert(rows);
    if (iErr) throw iErr;

    await db.rpc('advance_cycles'); // materialize the first cycle now
    const { data: cycle } = await db.from('subscription_cycles')
      .select('id, delivery_date, billing_date, selection_deadline').eq('subscription_id', subId)
      .order('cycle_start', { ascending: true }).limit(1).maybeSingle();

    return json(200, { subscriptionId: subId, status: 'active', cycleId: cycle?.id ?? null, firstDeliveryDate: cycle?.delivery_date ?? iso(start) });
  } catch (_e) {
    return json(500, { error: 'Could not create your box. Please try again.' });
  }
});
