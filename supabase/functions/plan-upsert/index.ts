// deno-lint-ignore-file no-explicit-any
// plan-upsert: a cook creates/updates a weekly meal plan backed by their real meals. Billing is
// app-controlled (per-cycle) so NO Stripe price is minted here. Persists the full plan config
// additively; UPDATE is a PARTIAL update (only provided keys) so omitting a field never nulls
// existing config. JWT-scoped to the caller's own kitchen.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { z } from 'https://esm.sh/zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
}
function admin() {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } });
}

const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const input = z.object({
  planId: z.string().uuid().optional(),
  name: z.string().min(2).max(80),
  description: z.string().max(600).optional(),
  priceCents: z.number().int().min(0).max(500_000).optional(),
  fulfillment: z.enum(['pickup', 'delivery']).optional(),
  goal: z.string().max(24).optional(),
  items: z.array(z.object({ mealId: z.string().uuid(), qty: z.number().int().min(1).max(20) })).min(1).max(30),
  // rich config (all optional; omitted -> DB default on insert, unchanged on update)
  selectionModel: z.enum(['fixed','customer_choice']).optional(),
  perMealCents: z.number().int().min(0).max(500_000).optional(),
  perDeliveryCents: z.number().int().min(0).max(100_000).optional(),
  mealsPerDelivery: z.number().int().min(1).max(30).optional(),
  servings: z.number().int().min(1).max(20).optional(),
  mealsPerWeek: z.number().int().min(1).max(30).optional(),
  deliveryDays: z.array(z.enum(DAYS as any)).max(7).optional(),
  cutoffHours: z.number().int().min(0).max(336).optional(),
  leadTimeHours: z.number().int().min(0).max(336).optional(),
  minCommitment: z.number().int().min(1).max(52).optional(),
  trialPriceCents: z.number().int().min(0).max(500_000).optional(),
  trialCycles: z.number().int().min(0).max(12).optional(),
  rotating: z.boolean().optional(),
  coverUrl: z.string().max(600).optional(),
  photoUrls: z.array(z.string().max(600)).max(8).optional(),
  dietaryTags: z.array(z.string().max(40)).max(20).optional(),
  allergens: z.array(z.string().max(40)).max(20).optional(),
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

    const parsed = input.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: 'invalid input', issues: parsed.error.issues });
    const p = parsed.data;

    const { data: kitchen } = await db.from('kitchens').select('id, name').eq('owner_id', uid).limit(1).maybeSingle();
    if (!kitchen) return json(400, { error: 'Create your kitchen first.' });

    const mealIds = [...new Set(p.items.map((i) => i.mealId))];
    const { data: meals } = await db.from('meals').select('id, kitchen_id').in('id', mealIds);
    if (!meals || meals.length !== mealIds.length) return json(400, { error: 'Some meals were not found.' });
    for (const m of meals as any[]) if (m.kitchen_id !== kitchen.id) return json(400, { error: 'All meals must be from your own kitchen.' });

    if (p.planId) {
      const { data: owned } = await db.from('plans').select('id').eq('id', p.planId).eq('kitchen_id', kitchen.id).maybeSingle();
      if (!owned) return json(404, { error: 'Plan not found.' });
    }

    // cross-field validation
    const isChoice = p.selectionModel === 'customer_choice';
    if (isChoice) {
      if (!(p.perMealCents && p.perMealCents >= 100)) return json(400, { error: 'Set a price per meal (at least $1).' });
      if (!(p.mealsPerDelivery && p.mealsPerDelivery >= 1)) return json(400, { error: 'Set how many meals per delivery.' });
    } else if (!p.planId) {
      // a new fixed plan needs a weekly price
      if (!(p.priceCents && p.priceCents >= 100)) return json(400, { error: 'Set a weekly price (at least $1).' });
    }
    if (p.trialCycles && p.trialCycles > 0 && p.trialPriceCents == null) return json(400, { error: 'Set a trial price.' });

    // build fields: only keys actually provided (partial update never nulls omitted config)
    const f: any = {};
    const set = (k: string, v: any) => { if (v !== undefined) f[k] = v; };
    set('name', p.name);
    if (p.description !== undefined) f.description = p.description.trim() || null;
    if (p.priceCents !== undefined) f.price_cents = isChoice ? (p.priceCents ?? 0) : p.priceCents;
    else if (isChoice && !p.planId) f.price_cents = 0;
    set('fulfillment', p.fulfillment);
    if (p.goal !== undefined) f.goal = p.goal || null;
    set('selection_model', p.selectionModel);
    set('per_meal_cents', p.perMealCents);
    set('per_delivery_cents', p.perDeliveryCents);
    set('meals_per_delivery', p.mealsPerDelivery);
    set('servings', p.servings);
    set('meals_per_week', p.mealsPerWeek);
    set('delivery_days', p.deliveryDays);
    set('cutoff_hours', p.cutoffHours);
    set('lead_time_hours', p.leadTimeHours);
    set('min_commitment', p.minCommitment);
    set('trial_price_cents', p.trialPriceCents);
    set('trial_cycles', p.trialCycles);
    set('rotating', p.rotating);
    if (p.coverUrl !== undefined) f.cover_url = p.coverUrl || null;
    set('photo_urls', p.photoUrls);
    set('dietary_tags', p.dietaryTags);
    set('allergens', p.allergens);

    let planId = p.planId;
    if (planId) {
      const { error: uErr } = await db.from('plans').update(f).eq('id', planId);
      if (uErr) throw uErr;
      await db.from('plan_items').delete().eq('plan_id', planId);
    } else {
      const row = { kitchen_id: kitchen.id, status: 'active', price_cents: 0, fulfillment: 'delivery', ...f };
      const { data: created, error: cErr } = await db.from('plans').insert(row).select('id').single();
      if (cErr) throw cErr;
      planId = created.id;
    }
    const itemRows = p.items.map((it) => ({ plan_id: planId, meal_id: it.mealId, qty: it.qty }));
    const { error: iErr } = await db.from('plan_items').insert(itemRows);
    if (iErr) throw iErr;

    return json(200, { planId });
  } catch (_e) {
    return json(500, { error: 'Could not save the plan. Please try again.' });
  }
});
