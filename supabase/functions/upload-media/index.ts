// deno-lint-ignore-file no-explicit-any
// upload-media: single proxy-upload endpoint for every image/video upload in the app
// (avatar, plan cover, post cover, post video, meal photo, cook verification doc).
//
// WHY THIS EXISTS: direct-to-Storage client uploads only validated the CLIENT-DECLARED
// Content-Type header against each bucket's allowed_mime_types -- proven live (audit,
// 2026-08-08): uploading raw HTML/JS declared as image/png succeeded and was served back
// by the CDN with Content-Type: image/png, matching the (false) declared type, not the
// real content. Not classic drive-by XSS in this app's actual <img>/<Image> usage (browsers
// don't execute script from a response declared image/*), but it lets anyone host arbitrary
// files under Preppa's trusted CDN domain disguised as media -- phishing pages, illegal
// content, malware. This function inspects the real file bytes (magic numbers) server-side
// before accepting anything, and uploads via the service-role client so it can't be
// bypassed by calling Storage directly once the matching RLS INSERT/UPDATE policies are
// dropped (see critical_fix_lockdown_direct_storage_writes).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
}
function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing required secret: ${name}`);
  return v;
}
function admin() {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
}
function asUser(jwt: string) {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
}

type BucketId = 'avatars' | 'meal-photos' | 'post-videos' | 'cook-docs';
const BUCKET_LIMITS: Record<BucketId, number> = {
  avatars: 8 * 1024 * 1024,
  'meal-photos': 8 * 1024 * 1024,
  'cook-docs': 15 * 1024 * 1024,
  'post-videos': 100 * 1024 * 1024,
};
const BUCKET_ALLOWED: Record<BucketId, string[]> = {
  avatars: ['image/png', 'image/jpeg', 'image/webp', 'image/heic'],
  'meal-photos': ['image/png', 'image/jpeg', 'image/webp', 'image/heic'],
  'cook-docs': ['image/png', 'image/jpeg', 'image/webp', 'image/heic'],
  'post-videos': ['video/mp4', 'video/quicktime'],
};
const EXT_FOR: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/heic': 'heic',
  'video/mp4': 'mp4', 'video/quicktime': 'mov',
};

// Real magic-number sniffing -- NOT the declared Content-Type. Returns the ACTUAL type of
// the bytes, or null if it doesn't match any format this app accepts.
function sniffType(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
      && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  // ISO-BMFF box-based formats (HEIC/HEIF, MP4, MOV) all start with a 'ftyp' box at offset 4.
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = new TextDecoder().decode(bytes.slice(8, 12)).trim();
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'heim', 'heis', 'hevm', 'hevs'].includes(brand)) return 'image/heic';
    if (brand === 'qt') return 'video/quicktime';
    return 'video/mp4'; // isom/iso2/mp41/mp42/avc1/3gp*/etc — the broad MP4-family case
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });
  try {
    const db = admin();
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData, error: userErr } = await db.auth.getUser(jwt);
    if (userErr || !userData.user) return json(401, { error: 'unauthorized' });
    const uid = userData.user.id;

    const { error: rlErr } = await db.rpc('check_rate_limit', {
      p_action: 'upload_media', p_max_count: 30, p_window: '10 minutes', p_subject: uid,
    });
    if (rlErr) return json(429, { error: 'Too many uploads. Please wait a few minutes and try again.' });

    const form = await req.formData().catch(() => null);
    if (!form) return json(400, { error: 'expected multipart/form-data' });
    const bucket = String(form.get('bucket') ?? '') as BucketId;
    const prefix = String(form.get('prefix') ?? 'file').replace(/[^a-zA-Z0-9_-]/g, '') || 'file';
    const kitchenId = form.get('kitchenId') ? String(form.get('kitchenId')) : null;
    const file = form.get('file');

    if (!(bucket in BUCKET_LIMITS)) return json(400, { error: 'invalid bucket' });
    if (!(file instanceof File)) return json(400, { error: 'file required' });

    let folder = uid;
    if (bucket === 'meal-photos') {
      if (!kitchenId) return json(400, { error: 'kitchenId required for meal-photos' });
      const dbAsUser = asUser(jwt);
      const { data: owns } = await dbAsUser.rpc('is_kitchen_owner', { kid: kitchenId });
      if (owns !== true) return json(403, { error: 'not your kitchen' });
      folder = kitchenId;
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength === 0) return json(400, { error: 'empty file' });
    if (bytes.byteLength > BUCKET_LIMITS[bucket]) {
      return json(400, { error: `File too large — max ${Math.round(BUCKET_LIMITS[bucket] / (1024 * 1024))}MB.` });
    }

    const realType = sniffType(bytes);
    if (!realType || !BUCKET_ALLOWED[bucket].includes(realType)) {
      return json(400, { error: 'That file doesn’t look like a supported image/video — try a different file.' });
    }

    const ext = EXT_FOR[realType];
    const rand = Math.random().toString(36).slice(2, 8);
    const path = `${folder}/${prefix}-${Date.now()}-${rand}.${ext}`;

    const { error: upErr } = await db.storage.from(bucket).upload(path, bytes, { upsert: true, contentType: realType });
    if (upErr) return json(500, { error: 'Upload failed. Please try again.' });

    if (bucket === 'cook-docs') return json(200, { path });
    const { data: pub } = db.storage.from(bucket).getPublicUrl(path);
    return json(200, { url: pub.publicUrl, path });
  } catch (_e) {
    return json(500, { error: 'Upload failed. Please try again.' });
  }
});
