// deno-lint-ignore-file no-explicit-any
// create-service-request: a customer posts a food-service request OR a 'meal_plan' brief.
// Routes it to nearby verified preppers and notifies them. `answers` carries the structured
// drill-down. A meal_plan brief routes to cooks who offer plans (they respond by publishing one).
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
function distanceKm(a: {lat:number,lng:number}, b: {lat:number,lng:number}): number {
  const R = 6371, dLat = (b.lat-a.lat)*Math.PI/180, dLng = (b.lng-a.lng)*Math.PI/180;
  const s = Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.min(1, Math.sqrt(s)));
}

const input = z.object({
  category: z.enum(['cook_at_home','private_dinner','catering','consultation','class','meal_plan']),
  eventDate: z.string().min(8).max(10),
  eventTime: z.string().max(8).optional(),
  address: z.string().max(300).optional(),
  lat: z.number().min(-90).max(90).finite().optional(), lng: z.number().min(-180).max(180).finite().optional(),
  approxArea: z.string().max(120).optional(),
  guests: z.number().int().min(1).max(1000).optional(),
  budgetCents: z.number().int().min(0).max(100000000).optional(),
  details: z.string().max(2000).optional(),
  answers: z.record(z.any()).optional(),
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
    if (p.answers && JSON.stringify(p.answers).length > 10_000) {
      return json(400, { error: 'Your answers are too long. Please shorten them.' });
    }

    const { data: reqRow, error: rErr } = await db.from('service_requests').insert({
      customer_id: uid, category: p.category, event_date: p.eventDate, event_time: p.eventTime ?? null,
      address_text: p.address ?? null, lat: p.lat ?? null, lng: p.lng ?? null, approx_area: p.approxArea ?? null,
      guests: p.guests ?? null, budget_cents: p.budgetCents ?? null, details: p.details ?? null,
      answers: p.answers ?? {},
    }).select('id').single();
    if (rErr) throw rErr;
    const requestId = reqRow.id;

    // Candidate cooks. meal_plan -> verified kitchens that offer plans (≥1 active plan).
    // Everything else -> verified kitchens whose service_categories include the category.
    let candidates: any[] = [];
    if (p.category === 'meal_plan') {
      const { data: rows } = await db.from('plans')
        .select('kitchen_id, kitchens!inner(id, owner_id, approx_lat, approx_lng, verification_status)')
        .eq('status', 'active').eq('kitchens.verification_status', 'verified');
      const seen = new Set<string>();
      for (const r of (rows ?? [])) { const k = (r as any).kitchens; if (k && !seen.has(k.id)) { seen.add(k.id); candidates.push(k); } }
    } else {
      const { data: kitchens } = await db.from('kitchens')
        .select('id, owner_id, approx_lat, approx_lng, service_categories')
        .eq('verification_status', 'verified')
        .contains('service_categories', [p.category]);
      candidates = kitchens ?? [];
    }
    candidates = candidates.filter((k: any) => k.owner_id !== uid);
    if (typeof p.lat === 'number' && typeof p.lng === 'number') {
      candidates = candidates
        .map((k: any) => ({ k, d: (k.approx_lat != null && k.approx_lng != null) ? distanceKm({ lat: p.lat!, lng: p.lng! }, { lat: Number(k.approx_lat), lng: Number(k.approx_lng) }) : Infinity }))
        .filter((x: any) => x.d <= 40)
        .sort((a: any, b: any) => a.d - b.d)
        .map((x: any) => x.k);
    }
    candidates = candidates.slice(0, 15);

    if (candidates.length > 0) {
      await db.from('service_request_targets').insert(candidates.map((k: any) => ({ request_id: requestId, kitchen_id: k.id })));
      const isPlan = p.category === 'meal_plan';
      const title = isPlan ? 'New meal-plan request' : 'New service request';
      const body = isPlan
        ? 'A customer wants a weekly meal plan. Publish a plan for them to subscribe to.'
        : `A customer needs ${p.category.replace(/_/g, ' ')} on ${p.eventDate}. Send a quote.`;
      for (const k of candidates) {
        try { await db.rpc('notify', { p_user: k.owner_id, p_kind: 'service_request', p_title: title, p_body: body }); } catch (_e) { /* best-effort */ }
      }
    }

    return json(200, { requestId, targets: candidates.length });
  } catch (_e) {
    return json(500, { error: 'Could not post your request. Please try again.' });
  }
});
