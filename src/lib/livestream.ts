import { supabase } from './supabase';

/**
 * Mux-backed livestreaming. Preppa creates the Mux Live Stream server-side (live-start edge
 * function); the stream key is only ever returned once to the client that started it and is
 * never re-readable afterward (stored service-role-only in livestream_secrets). Viewer
 * playback is plain HLS via the Mux playback URL — no vendor SDK needed on that side.
 */

export interface StartedStream {
  livestreamId: string;
  rtmpUrl: string;
  streamKey: string;
  playbackId: string;
}

/** Start a live stream for the caller's verified kitchen. Returns the RTMP ingest details
 * ONCE — hand these to a broadcast client (or OBS/ffmpeg for testing); they are not
 * retrievable again after this call returns. */
export async function startLivestream(kitchenId: string, title?: string): Promise<StartedStream> {
  const { data, error } = await supabase.functions.invoke('live-start', { body: { kitchenId, title } });
  if (error || data?.error) throw new Error(data?.error || error?.message || 'Could not start your live stream.');
  return {
    livestreamId: data.livestreamId,
    rtmpUrl: data.rtmpUrl,
    streamKey: data.streamKey,
    playbackId: data.playbackId,
  };
}

/** End a live stream (owner-initiated; belt-and-suspenders alongside the Mux webhook). */
export async function endLivestream(livestreamId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('live-end', { body: { livestreamId } });
  if (error || data?.error) throw new Error(data?.error || error?.message || 'Could not end the stream.');
}

export interface LiveStreamRow {
  id: string;
  kitchenId: string;
  kitchenName: string;
  kitchenAvatarUrl: string | null;
  playbackId: string;
  title: string | null;
  status: 'idle' | 'live' | 'ended';
  startedAt: string | null;
}

function mapRow(r: any): LiveStreamRow {
  return {
    id: r.id,
    kitchenId: r.kitchen_id,
    kitchenName: r.kitchens?.name ?? 'Kitchen',
    kitchenAvatarUrl: r.kitchens?.avatar_url ?? null,
    playbackId: r.mux_playback_id,
    title: r.title ?? null,
    status: r.status,
    startedAt: r.started_at ?? null,
  };
}

/** Every kitchen currently live, newest-started first — for a "Live now" rail. */
export async function fetchLiveNow(): Promise<LiveStreamRow[]> {
  const { data, error } = await supabase
    .from('livestreams')
    .select('id, kitchen_id, mux_playback_id, title, status, started_at, kitchens!inner(name, avatar_url, verification_status)')
    .eq('status', 'live')
    .eq('kitchens.verification_status', 'verified')
    .order('started_at', { ascending: false });
  if (error || !data) return [];
  return (data as any[]).map(mapRow);
}

/** The live (or most recently ended) stream for one kitchen, if any. */
export async function fetchKitchenLivestream(kitchenId: string): Promise<LiveStreamRow | null> {
  const { data, error } = await supabase
    .from('livestreams')
    .select('id, kitchen_id, mux_playback_id, title, status, started_at, kitchens!inner(name, avatar_url)')
    .eq('kitchen_id', kitchenId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data);
}

/** HLS playback URL for a Mux playback id — plays in expo-video's VideoView on any platform. */
export function hlsUrl(playbackId: string): string {
  return `https://stream.mux.com/${playbackId}.m3u8`;
}
