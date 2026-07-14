import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, ActivityIndicator, Platform } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press, Btn } from '../../src/ui';
import { Screen, TopBar } from '../../src/ui/layout';
import { getMyKitchen } from '../../src/lib/connect';
import { startLivestream, endLivestream, fetchKitchenLivestream, type LiveStreamRow, type StartedStream } from '../../src/lib/livestream';

/**
 * Go live (Mux-backed). NOTE: there's no in-app camera broadcast yet — no official Mux React
 * Native broadcast SDK exists, and wiring one in needs a native-module spike (custom EAS dev
 * client, New Architecture compatibility unverified). For now this screen creates the real
 * Mux live stream and hands you the RTMP URL + stream key to broadcast with any RTMP encoder
 * (OBS Studio, ffmpeg, a hardware encoder) — the whole Mux pipeline (ingest → HLS → webhook →
 * VOD post) is fully real and independent of how the RTMP push happens.
 */
export default function GoLive() {
  const c = useC();
  const router = useRouter();
  const { toast } = useStore();
  const [kitchenId, setKitchenId] = useState<string | null>(null);
  const [current, setCurrent] = useState<LiveStreamRow | null>(null);
  const [started, setStarted] = useState<StartedStream | null>(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    let alive = true;
    getMyKitchen().then(async (k) => {
      if (!alive || !k) { setLoading(false); return; }
      setKitchenId(k.id);
      const live = await fetchKitchenLivestream(k.id).catch(() => null);
      if (alive) { setCurrent(live && live.status === 'live' ? live : null); setLoading(false); }
    });
    return () => { alive = false; };
  }, []));

  const goLive = async () => {
    if (!kitchenId || busy) return;
    setBusy(true);
    try {
      const s = await startLivestream(kitchenId, title.trim() || undefined);
      setStarted(s);
      setCurrent({ id: s.livestreamId, kitchenId, kitchenName: '', kitchenAvatarUrl: null, playbackId: s.playbackId, title: title.trim() || null, status: 'live', startedAt: new Date().toISOString() });
    } catch (e: any) {
      toast(e?.message || 'Could not start your live stream.', 'info');
    } finally { setBusy(false); }
  };

  const stopLive = async () => {
    if (!current || busy) return;
    setBusy(true);
    try {
      await endLivestream(current.id);
      setCurrent(null);
      setStarted(null);
      toast('Stream ended', 'check', true);
    } catch (e: any) {
      toast(e?.message || 'Could not end the stream.', 'info');
    } finally { setBusy(false); }
  };

  if (loading) {
    return (
      <Screen>
        <TopBar title="Go live" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.primary} /></View>
      </Screen>
    );
  }

  return (
    <Screen bg={c.surface}>
      <TopBar title="Go live" onBack={() => router.back()} />
      <View style={{ padding: 20, gap: 16 }}>
        {!current ? (
          <>
            <View>
              <Text style={[type(12.5, 800), { color: c.soft, marginBottom: 8 }]}>Stream title (optional)</Text>
              <TextInput
                value={title} onChangeText={setTitle} placeholder="Sunday prep session"
                placeholderTextColor={c.muted}
                style={[type(15.5, 600), { color: c.ink, backgroundColor: c.bg2, borderWidth: 1.5, borderColor: c.border, borderRadius: radius.md, height: 52, paddingHorizontal: 15 }]}
              />
            </View>
            <Btn label={busy ? 'Starting…' : 'Go live'} icon="video" block loading={busy} onPress={goLive} />
            <Text style={[type(12, 600), { color: c.muted, textAlign: 'center', lineHeight: 18 }]}>
              In-app camera broadcast is coming soon. For now you'll get an RTMP URL + stream key to broadcast with (OBS Studio, ffmpeg, or a hardware encoder).
            </Text>
          </>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.red }} />
              <Text style={[type(15, 900), { color: c.ink }]}>You're live</Text>
            </View>
            {started ? (
              <View style={{ backgroundColor: c.bg2, borderRadius: radius.lg, padding: 16, gap: 10 }}>
                <Text style={[type(12, 800), { color: c.soft, textTransform: 'uppercase', letterSpacing: 0.5 }]}>Broadcast with any RTMP encoder</Text>
                <View>
                  <Text style={[type(11.5, 700), { color: c.muted }]}>Server URL</Text>
                  <Text selectable style={[type(13.5, 700), { color: c.ink }]}>{started.rtmpUrl}</Text>
                </View>
                <View>
                  <Text style={[type(11.5, 700), { color: c.muted }]}>Stream key</Text>
                  <Text selectable style={[type(13.5, 700), { color: c.ink }]}>{started.streamKey}</Text>
                </View>
              </View>
            ) : (
              <Text style={[type(13, 600), { color: c.soft }]}>Already live from a previous session on this device — reopen where you started it to see the stream key, or just end the stream below.</Text>
            )}
            <Press scale={0.98} onPress={() => router.push(`/store/${kitchenId}/live`)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 46, paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: c.bg2 }}>
                <Icon name="eye" size={17} color={c.ink2} />
                <Text style={[type(13.5, 800), { color: c.ink }]}>View as a viewer would</Text>
              </View>
            </Press>
            <Btn label={busy ? 'Ending…' : 'End stream'} variant="dark" block loading={busy} onPress={stopLive} />
          </>
        )}
      </View>
    </Screen>
  );
}
