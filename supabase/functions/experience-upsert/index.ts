// deno-lint-ignore-file no-explicit-any
// experience-upsert: a verified prepper creates/edits a browsable Experience listing + its dated
// sessions. verify_jwt, service-role admin() client, zod, ownership-enforced, partial-update. The
// virtual join link is written to the protected experience_private table (never the public row).
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

const CATEGORY_FOR: Record<string, string> = { class: 'class', workshop: 'class', tasting: 'private_dinner', supper_club: 'private_dinner' };

const sessionInput = z.object({
  id: z.string().uuid().optional(),
  startsAt: z.string().min(10),
  capacity: z.number().int().min(1).max(200),
  status: z.enum(['open', 'closed', 'cancelled']).optional(),
});
const input = z.object({
  experienceId: z.string().uuid().optional(),
  title: z.string().min(2).max(120),
  description: z.string().max(4000).optional(),
  experienceType: z.enum(['class', 'supper_club', 'tasting', 'workshop']).optional(),
  coverUrl: z.string().max(600).optional(),
  photoUrls: z.array(z.string().max(600)).max(8).optional(),
  locationType: z.enum(['prepper_place', 'customer_place', 'venue', 'virtual']).optional(),
  addressText: z.string().max(300).optional(),
  meetingUrl: z.string().url().max(600).optional(),
  durationMin: z.number().int().min(15).max(1440).optional(),
  minGuests: z.number().int().min(1).max(200).optional(),
  maxGuests: z.number().int().min(1).max(200).optional(),
  priceModel: z.enum(['per_person', 'flat']).optional(),
  perPersonCents: z.number().int().min(0).max(500_000).optional(),
  priceCents: z.number().int().min(0).max(500_000).optional(),
  whatsIncluded: z.array(z.string().max(60)).max(20).optional(),
  requirements: z.string().max(2000).optional(),
  dietaryTags: z.array(z.string().max(40)).max(20).optional(),
  allergens: z.array(z.string().max(40)).max(20).optional(),
  cancellationPolicy: z.enum(['flexible', 'standard', 'strict']).optional(),
  submit: z.boolean().optional(),
  sessions: z.array(sessionInput).max(60).optional(),
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

    const { data: kitchen } = await db.from('kitchens').select('id, verification_status').eq('owner_id', uid).limit(1).maybeSingle();
    if (!kitchen) return json(400, { error: 'Create your kitchen first.' });
    if (kitchen.verification_status !== 'verified') return json(403, { error: 'Your kitchen must be verified to publish experiences.' });

    if (p.minGuests && p.maxGuests && p.maxGuests < p.minGuests) return json(400, { error: 'Max guests must be ≥ min guests.' });
    const willSubmit = p.submit === true;
    if (willSubmit) {
      const model = p.priceModel ?? 'per_person';
      if (model === 'per_person' && !(p.perPersonCents && p.perPersonCents >= 100)) return json(400, { error: 'Set a price per person (at least $1).' });
      if (model === 'flat' && !(p.priceCents && p.priceCents >= 100)) return json(400, { error: 'Set a price (at least $1).' });
      if (p.locationType === 'virtual' && !(p.meetingUrl && p.meetingUrl.trim())) return json(400, { error: 'Add a meeting link for the online session.' });
    }

    let existingStatus: string | null = null;
    if (p.experienceId) {
      const { data: owned } = await db.from('experiences').select('status, kitchen_id').eq('id', p.experienceId).maybeSingle();
      if (!owned || owned.kitchen_id !== kitchen.id) return json(404, { error: 'Experience not found.' });
      existingStatus = owned.status;
    }

    const f: any = { updated_at: new Date().toISOString() };
    const set = (k: string, v: any) => { if (v !== undefined) f[k] = v; };
    set('title', p.title);
    if (p.description !== undefined) f.description = p.description.trim() || null;
    if (p.experienceType !== undefined) { f.experience_type = p.experienceType; f.category = CATEGORY_FOR[p.experienceType] ?? 'class'; }
    if (p.coverUrl !== undefined) f.cover_url = p.coverUrl || null;
    set('photo_urls', p.photoUrls);
    set('location_type', p.locationType);
    if (p.addressText !== undefined) f.address_text = p.addressText.trim() || null;
    set('duration_min', p.durationMin);
    set('min_guests', p.minGuests);
    set('max_guests', p.maxGuests);
    set('price_model', p.priceModel);
    set('per_person_cents', p.perPersonCents);
    set('price_cents', p.priceCents);
    if (p.requirements !== undefined) f.requirements = p.requirements.trim() || null;
    set('dietary_tags', p.dietaryTags);
    set('allergens', p.allergens);
    set('whats_included', p.whatsIncluded);
    set('cancellation_policy', p.cancellationPolicy);
    if (willSubmit) f.status = existingStatus === 'published' ? 'published' : 'pending';
    else if (!p.experienceId) f.status = 'draft';

    let experienceId = p.experienceId;
    if (experienceId) {
      const { error: uErr } = await db.from('experiences').update(f).eq('id', experienceId);
      if (uErr) throw uErr;
    } else {
      const row = { kitchen_id: kitchen.id, ...f };
      const { data: created, error: cErr } = await db.from('experiences').insert(row).select('id').single();
      if (cErr) throw cErr;
      experienceId = created.id;
    }

    // virtual join link → protected sibling table; cleared when the location isn't virtual
    if (p.locationType === 'virtual' && p.meetingUrl) {
      await db.from('experience_private').upsert({ experience_id: experienceId, meeting_url: p.meetingUrl.trim(), updated_at: new Date().toISOString() });
    } else if (p.locationType !== undefined && p.locationType !== 'virtual') {
      await db.from('experience_private').delete().eq('experience_id', experienceId);
    }

    if (p.sessions) {
      const keepIds: string[] = [];
      for (const s of p.sessions) {
        if (s.id) {
          keepIds.push(s.id);
          const { error } = await db.from('experience_sessions')
            .update({ starts_at: s.startsAt, capacity: s.capacity, status: s.status ?? 'open' })
            .eq('id', s.id).eq('experience_id', experienceId);
          if (error) throw error;
        } else {
          const { data: ins, error } = await db.from('experience_sessions')
            .insert({ experience_id: experienceId, kitchen_id: kitchen.id, starts_at: s.startsAt, capacity: s.capacity, status: s.status ?? 'open' })
            .select('id').single();
          if (error) throw error;
          keepIds.push(ins.id);
        }
      }
      const { data: existing } = await db.from('experience_sessions').select('id, starts_at').eq('experience_id', experienceId);
      for (const ex of (existing ?? [])) {
        if (keepIds.includes(ex.id)) continue;
        const { count } = await db.from('experience_seat_reservations').select('id', { count: 'exact', head: true }).eq('session_id', ex.id).is('released_at', null);
        if ((count ?? 0) === 0) await db.from('experience_sessions').delete().eq('id', ex.id);
        else await db.from('experience_sessions').update({ status: 'cancelled' }).eq('id', ex.id);
      }
    }

    return json(200, { experienceId, status: f.status ?? existingStatus });
  } catch (_e) {
    return json(500, { error: 'Could not save the experience. Please try again.' });
  }
});
