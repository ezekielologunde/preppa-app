import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VideoView, useVideoPlayer } from 'expo-video';
import { COOKS, CookId } from '../../../src/data/data';
import { KITCHEN_ID } from '../../../src/lib/supabase';
import { type, radius } from '../../../src/theme/theme';
import { Icon, Press } from '../../../src/ui';
import { fetchKitchenLivestream, hlsUrl, type LiveStreamRow } from '../../../src/lib/livestream';
import { FLAGS } from '../../../src/config/flags';

/** Viewer-side live playback. Plain HLS via expo-video — no vendor SDK needed on this side;
 * the hard part (broadcasting) lives entirely on the go-live/publisher side. */
export default function KitchenLive() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { cook } = useLocalSearchParams<{ cook: string }>();
  const kitchenId = COOKS[cook as CookId] ? KITCHEN_ID[cook as CookId] : cook;

  const [stream, setStream] = useState<LiveStreamRow | null | undefined>(undefined);
  const player = useVideoPlayer(stream?.status === 'live' ? hlsUrl(stream.playbackId) : null, (p) => { p.play(); });

  useFocusEffect(useCallback(() => {
    let alive = true;
    if (!FLAGS.live || !kitchenId) { setStream(null); return; }
    fetchKitchenLivestream(kitchenId).then((s) => { if (alive) setStream(s); }).catch(() => { if (alive) setStream(null); });
    return () => { alive = false; };
  }, [kitchenId]));

  useEffect(() => {
    if (FLAGS.live && stream?.status === 'live') player.play();
    return () => player.pause();
  }, [stream?.status, player]);

  // Guarded route (audit Critical): livestreaming has no moderation/kill-switch yet. A stale
  // deep link or cached "Live now" button can't reach real playback while the flag is off.
  if (!FLAGS.live) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <Icon name="video" size={40} color="rgba(255,255,255,.5)" />
        <Text style={[type(16, 900), { color: '#fff', marginTop: 14 }]}>Live isn't open yet</Text>
        <Press scale={0.9} onPress={() => router.back()} label="Back" style={{ marginTop: 20 }}>
          <Text style={[type(13, 700), { color: 'rgba(255,255,255,.8)' }]}>Go back</Text>
        </Press>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {stream === undefined ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color="#fff" /></View>
      ) : stream?.status === 'live' ? (
        <VideoView player={player} style={{ flex: 1 }} contentFit="cover" nativeControls={false} />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <Icon name="video" size={40} color="rgba(255,255,255,.5)" />
          <Text style={[type(16, 900), { color: '#fff', marginTop: 14 }]}>Not live right now</Text>
          <Text style={[type(13, 500), { color: 'rgba(255,255,255,.6)', textAlign: 'center', marginTop: 6, lineHeight: 19 }]}>Check back later — you'll see it in Live now on the feed once they start.</Text>
        </View>
      )}

      <View style={{ position: 'absolute', top: insets.top + 10, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Press scale={0.9} onPress={() => router.back()} label="Back">
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,.4)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="chevLeft" size={20} color="#fff" />
          </View>
        </Press>
        {stream?.status === 'live' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 11, borderRadius: radius.pill, backgroundColor: '#E11D48' }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' }} />
            <Text style={[type(11, 900), { color: '#fff' }]}>LIVE</Text>
          </View>
        ) : null}
      </View>

      {stream?.status === 'live' ? (
        <View style={{ position: 'absolute', bottom: 30, left: 16, right: 16 }}>
          <Text style={[type(15, 900), { color: '#fff' }]}>{stream.kitchenName}</Text>
          {stream.title ? <Text style={[type(13, 600), { color: 'rgba(255,255,255,.85)', marginTop: 3 }]}>{stream.title}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}
