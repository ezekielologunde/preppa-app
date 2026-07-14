// deno-lint-ignore-file no-explicit-any
// edit-service-request: the owning customer edits their OWN request while it's still `open`
// (before any quote locks it). If the category or location changed, re-route to newly-
// matching preppers and notify them. Existing targets/quotes are left intact.
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
  requestId: z.string().uuid(),
  action: z.enum(['edit', 'cancel']).default('edit'),
  category: z.enum(['cook_at_home','private_dinner','catering','consultation','class']).optional(),
  eventDate: z.string().min(8).max(10).optional(),
  eventTime: z.string().max(8).optional(),
  address: z.string().max(300).optional(),
  lat: z.number().optional(), lng: z.number().optional(),
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

    const { data: cur } = await db.from('service_requests')
      .select('id, customer_id, status, category, lat, lng').eq('id', p.requestId).maybeSingle();
    if (!cur) return json(404, { error: 'Request not found.' });
    if (cur.customer_id !== uid) return json(403, { error: 'Not your request.' });

    if (p.action === 'cancel') {
      if (['accepted', 'cancelled'].includes(cur.status)) return json(409, { error: "This request can't be cancelled." });
      await db.from('service_requests').update({ status: 'cancelled' }).eq('id', p.requestId);
      return json(200, { requestId: p.requestId, status: 'cancelled' });
    }

    // edit: only before a quote locks it
    if (cur.status !== 'open') return json(409, { error: 'This request already has quotes and can no longer be edited. Cancel it and post a new one.' });

    const patch: any = {};
    if (p.category !== undefined) patch.category = p.category;
    if (p.eventDate !== undefined) patch.event_date = p.eventDate;
    if (p.eventTime !== undefined) patch.event_time = p.eventTime;
    if (p.address !== undefined) patch.address_text = p.address;
    if (p.lat !== undefined) patch.lat = p.lat;
    if (p.lng !== undefined) patch.lng = p.lng;
    if (p.approxArea !== undefined) patch.approx_area = p.approxArea;
    if (p.guests !== undefined) patch.guests = p.guests;
    if (p.budgetCents !== undefined) patch.budget_cents = p.budgetCents;
    if (p.details !== undefined) patch.details = p.details;
    if (p.answers !== undefined) patch.answers = p.answers;
    if (Object.keys(patch).length) {
      const { error: uErr } = await db.from('service_requests').update(patch).eq('id', p.requestId).eq('status', 'open');
      if (uErr) throw uErr;
    }

    // re-route only if category or location changed
    const newCat = p.category ?? cur.category;
    const newLat = p.lat ?? (cur.lat != null ? Number(cur.lat) : undefined);
    const newLng = p.lng ?? (cur.lng != null ? Number(cur.lng) : undefined);
    const catChanged = p.category !== undefined && p.category !== cur.category;
    const locChanged = (p.lat !== undefined && p.lat !== (cur.lat != null ? Number(cur.lat) : undefined))
                    || (p.lng !== undefined && p.lng !== (cur.lng != null ? Number(cur.lng) : undefined));
    let newTargets = 0;
    if (catChanged || locChanged) {
      const { data: existing } = await db.from('service_request_targets').select('kitchen_id').eq('request_id', p.requestId);
      const have = new Set((existing ?? []).map((t: any) => t.kitchen_id));
      const { data: kitchens } = await db.from('kitchens')
        .select('id, owner_id, approx_lat, approx_lng, service_categories')
        .eq('verification_status', 'verified')
        .contains('service_categories', [newCat]);
      let candidates = (kitchens ?? []).filter((k: any) => k.owner_id !== uid && !have.has(k.id));
      if (typeof newLat === 'number' && typeof newLng === 'number') {
        candidates = candidates
          .map((k: any) => ({ k, d: (k.approx_lat != null && k.approx_lng != null) ? distanceKm({ lat: newLat, lng: newLng }, { lat: Number(k.approx_lat), lng: Number(k.approx_lng) }) : Infinity }))
          .filter((x: any) => x.d <= 40).sort((a: any, b: any) => a.d - b.d).map((x: any) => x.k);
      }
      candidates = candidates.slice(0, 15);
      if (candidates.length) {
        await db.from('service_request_targets').insert(candidates.map((k: any) => ({ request_id: p.requestId, kitchen_id: k.id })));
        const catLabel = newCat.replace(/_/g, ' ');
        for (const k of candidates) {
          try { await db.rpc('notify', { p_user: k.owner_id, p_kind: 'service_request', p_title: 'New service request', p_body: `A customer needs ${catLabel}. Send a quote.` }); } catch (_e) { /* best-effort */ }
        }
        newTargets = candidates.length;
      }
    }

    return json(200, { requestId: p.requestId, status: 'open', newTargets });
  } catch (_e) {
    return json(500, { error: 'Could not update your request. Please try again.' });
  }
});
