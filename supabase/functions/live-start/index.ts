// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

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

function muxAuthHeader(): string {
  const id = Deno.env.get('MUX_TOKEN_ID') ?? '';
  const secret = Deno.env.get('MUX_TOKEN_SECRET') ?? '';
  return 'Basic ' + btoa(`${id}:${secret}`);
}

// Real server-side kill switch, independent of the client-only FLAGS.live gate (which a
// rebuilt/patched client could simply ignore). Fails closed: unset/missing = disabled, matching
// the client's current FLAGS.live=false default. Flip via the LIVE_ENABLED Edge Function secret.
const LIVE_ENABLED = Deno.env.get('LIVE_ENABLED') === 'true';

// Start a live stream for the caller's verified kitchen: creates a real Mux Live Stream
// (auto-recorded to VOD via new_asset_settings), stores the stream key service-role-only
// (never client-readable again), and returns the RTMP ingest URL + stream key ONCE.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });
  try {
    if (!LIVE_ENABLED) return json(403, { error: 'Livestreaming is not enabled yet.' });

    const db = admin();
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await db.auth.getUser(jwt);
    const userId = userData.user?.id;
    if (!userId) return json(401, { error: 'unauthorized' });

    const { error: rlErr } = await db.rpc('check_rate_limit', {
      p_action: 'live_start', p_max_count: 5, p_window: '10 minutes', p_subject: userId,
    });
    if (rlErr) return json(429, { error: 'Too many attempts. Please wait a few minutes and try again.' });

    const body = await req.json().catch(() => ({}));
    const kitchenId = body?.kitchenId;
    const title = typeof body?.title === 'string' ? body.title.slice(0, 200) : null;
    if (typeof kitchenId !== 'string') return json(400, { error: 'kitchenId required' });

    const { data: kitchen } = await db.from('kitchens').select('id, owner_id, verification_status').eq('id', kitchenId).single();
    if (!kitchen || kitchen.owner_id !== userId) return json(403, { error: 'not your kitchen' });
    if (kitchen.verification_status !== 'verified') return json(403, { error: 'kitchen is not approved yet' });

    const { data: existingLive } = await db.from('livestreams').select('id').eq('kitchen_id', kitchenId).eq('status', 'live').maybeSingle();
    if (existingLive) return json(409, { error: 'You already have a live stream in progress.' });

    const muxRes = await fetch('https://api.mux.com/video/v1/live-streams', {
      method: 'POST',
      headers: { 'Authorization': muxAuthHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playback_policy: ['public'],
        new_asset_settings: { playback_policy: ['public'] },
        reconnect_window: 60,
      }),
    });
    if (!muxRes.ok) {
      const errBody = await muxRes.text().catch(() => '');
      throw new Error(`Mux live-stream creation failed (${muxRes.status}): ${errBody.slice(0, 300)}`);
    }
    const mux = await muxRes.json();
    const streamId = mux?.data?.id;
    const streamKey = mux?.data?.stream_key;
    const playbackId = mux?.data?.playback_ids?.[0]?.id;
    if (!streamId || !streamKey || !playbackId) throw new Error('Unexpected Mux response shape');

    const { data: row, error: insErr } = await db
      .from('livestreams')
      .insert({ kitchen_id: kitchenId, mux_stream_id: streamId, mux_playback_id: playbackId, title })
      .select('id').single();
    if (insErr) throw insErr;

    await db.from('livestream_secrets').insert({ livestream_id: row.id, stream_key: streamKey });

    return json(200, {
      livestreamId: row.id,
      rtmpUrl: 'rtmps://global-live.mux.com:443/app',
      streamKey,
      playbackId,
    });
  } catch (_e) {
    return json(500, { error: 'Could not start your live stream. Please try again.' });
  }
});
