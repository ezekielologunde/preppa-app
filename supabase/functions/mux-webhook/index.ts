// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, mux-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
}

function admin() {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } });
}

async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function parseMuxSignature(header: string): { t: string; v1: string } | null {
  const parts: Record<string, string> = {};
  for (const kv of header.split(',')) {
    const [k, v] = kv.split('=');
    if (k && v) parts[k.trim()] = v.trim();
  }
  if (!parts.t || !parts.v1) return null;
  return { t: parts.t, v1: parts.v1 };
}

// Mux webhook: no user JWT (verify_jwt=false), Mux signs the payload instead. Idempotent
// DB writes only — re-delivery of the same event must never double-insert a VOD post.
//
// SECURITY FIX (Critical): this used to accept and process UNSIGNED events whenever
// MUX_WEBHOOK_SECRET was unset (fail-open), which let anyone forge stream-state transitions
// or fabricate a published VOD post by POSTing directly to this endpoint. It now fails
// CLOSED: if the secret isn't configured, or the signature is missing/invalid, the request
// is rejected with 400 and nothing is processed.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });
  const raw = await req.text();
  try {
    const secret = Deno.env.get('MUX_WEBHOOK_SECRET');
    if (!secret) {
      console.error('MUX_WEBHOOK_SECRET not set — rejecting webhook (fail closed)');
      return json(400, { error: 'webhook not configured' });
    }
    const parsed = parseMuxSignature(req.headers.get('Mux-Signature') ?? '');
    if (!parsed) return json(400, { error: 'missing signature' });
    const expected = await hmacHex(secret, `${parsed.t}.${raw}`);
    if (expected !== parsed.v1) return json(400, { error: 'invalid signature' });

    const event = JSON.parse(raw);
    const type = event?.type as string;
    const data = event?.data ?? {};
    const db = admin();

    if (type === 'video.live_stream.active') {
      await db.from('livestreams')
        .update({ status: 'live', started_at: new Date().toISOString() })
        .eq('mux_stream_id', data.id).neq('status', 'live');
    } else if (type === 'video.live_stream.idle' || type === 'video.live_stream.disconnected') {
      await db.from('livestreams')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('mux_stream_id', data.id).eq('status', 'live');
    } else if (type === 'video.asset.ready') {
      const liveStreamId = data.live_stream_id as string | undefined;
      const playbackId = data.playback_ids?.[0]?.id as string | undefined;
      if (liveStreamId && playbackId) {
        const { data: ls } = await db.from('livestreams')
          .select('id, kitchen_id, title, cover_url, vod_post_id')
          .eq('mux_stream_id', liveStreamId).maybeSingle();
        if (ls && !ls.vod_post_id) {
          const videoUrl = `https://stream.mux.com/${playbackId}.m3u8`;
          const coverUrl = ls.cover_url || `https://image.mux.com/${playbackId}/thumbnail.jpg`;
          const { data: post } = await db.from('posts').insert({
            kitchen_id: ls.kitchen_id, cover_url: coverUrl, video_url: videoUrl, media_type: 'video',
            caption: ls.title, tag: 'Livestream replay', status: 'published',
          }).select('id').single();
          if (post) await db.from('livestreams').update({ vod_post_id: post.id }).eq('id', ls.id);
        }
      }
    }

    return json(200, { received: true });
  } catch (_e) {
    return json(500, { error: 'webhook error' });
  }
});
