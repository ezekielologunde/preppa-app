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

// Owner-initiated end of a live stream. Belt-and-suspenders alongside the mux-webhook's
// video.live_stream.idle/disconnected handling — this fires immediately on user action
// instead of waiting for Mux to notice the stream stopped.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });
  try {
    const db = admin();
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await db.auth.getUser(jwt);
    const userId = userData.user?.id;
    if (!userId) return json(401, { error: 'unauthorized' });

    const body = await req.json().catch(() => ({}));
    const livestreamId = body?.livestreamId;
    if (typeof livestreamId !== 'string') return json(400, { error: 'livestreamId required' });

    const { data: ls } = await db.from('livestreams').select('id, kitchen_id, mux_stream_id, status').eq('id', livestreamId).single();
    if (!ls) return json(404, { error: 'stream not found' });
    const { data: kitchen } = await db.from('kitchens').select('owner_id').eq('id', ls.kitchen_id).single();
    if (!kitchen || kitchen.owner_id !== userId) return json(403, { error: 'not your stream' });

    if (ls.status !== 'ended') {
      await fetch(`https://api.mux.com/video/v1/live-streams/${ls.mux_stream_id}/complete`, {
        method: 'PUT',
        headers: { 'Authorization': muxAuthHeader() },
      }).catch(() => {}); // best-effort — the webhook is the source of truth either way
      await db.from('livestreams').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', livestreamId).neq('status', 'ended');
    }

    return json(200, { ok: true });
  } catch (e) {
    return json(500, { error: (e as any)?.message || 'Could not end the stream.' });
  }
});
