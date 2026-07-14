import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Redirect, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { FLAGS } from '../../src/config/flags';
import { money } from '../../src/data/data';
import { type, radius } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press, GradBox } from '../../src/ui';
import { shareAndNotify, SITE } from '../../src/lib/share';
import { fetchFeed, togglePostLike, initialOf, FeedPost } from '../../src/lib/feed';

export default function Feeds() {
  const [h, setH] = useState(0);
  const [items, setItems] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  // Guard the route so a stale-cached direct URL can't render it when the flag is off.
  if (!FLAGS.feed) return <Redirect href="/(tabs)/home" />;

  useFocusEffect(useCallback(() => {
    let alive = true;
    fetchFeed().then((f) => { if (alive) { setItems(f); setLoading(false); } });
    return () => { alive = false; };
  }, []));

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }} onLayout={(e) => setH(e.nativeEvent.layout.height)}>
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color="#fff" /></View>
      ) : items.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <Icon name="video" size={40} color="rgba(255,255,255,.5)" />
          <Text style={[type(16, 900), { color: '#fff', marginTop: 14 }]}>No posts yet</Text>
          <Text style={[type(13, 500), { color: 'rgba(255,255,255,.6)', textAlign: 'center', marginTop: 6, lineHeight: 19 }]}>
            When cooks share their kitchen, their posts show up here.
          </Text>
        </View>
      ) : h > 0 ? (
        <FlatList
          data={items}
          keyExtractor={(f) => f.id}
          renderItem={({ item }) => <Reel f={item} height={h} />}
          pagingEnabled
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, i) => ({ length: h, offset: h * i, index: i })}
          initialNumToRender={1}
          windowSize={3}
          maxToRenderPerBatch={2}
        />
      ) : null}
    </View>
  );
}

const Reel = React.memo(function Reel({ f, height }: { f: FeedPost; height: number }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { toast } = useStore();
  const [liked, setLiked] = useState(f.liked);
  const [likes, setLikes] = useState(f.likeCount);
  const [saved, setSaved] = useState(false);

  const onLike = async () => {
    const next = !liked;
    setLiked(next); setLikes((n) => n + (next ? 1 : -1)); // optimistic
    try { const real = await togglePostLike(f.id); if (real !== next) { setLiked(real); setLikes((n) => n + (real ? 1 : -1) - (next ? 1 : -1)); } }
    catch { setLiked(!next); setLikes((n) => n + (next ? -1 : 1)); toast('Sign in to like posts', 'info'); }
  };

  return (
    <View style={{ height, width: '100%' }}>
      <GradBox grad={f.grad} img={f.coverUrl} style={{ ...StyleAbs }} />
      <LinearGradient colors={['rgba(0,0,0,.35)', 'transparent', 'rgba(0,0,0,.72)']} locations={[0, 0.4, 1]} style={StyleAbs} />

      {/* top */}
      <View style={{ position: 'absolute', top: insets.top + 10, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 11, borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,.4)' }}>
          <Text style={[type(11, 900), { color: '#fff' }]}>{f.tag ? f.tag.toUpperCase() : 'REEL'}</Text>
        </View>
        <Text style={[type(17, 900), { color: '#fff' }]}>Feed</Text>
      </View>

      {/* right rail */}
      <View style={{ position: 'absolute', right: 12, bottom: 40, alignItems: 'center', gap: 20 }}>
        <RailBtn icon={liked ? 'heartFill' : 'heart'} label={likes > 0 ? String(likes) : 'Like'} active={liked} onPress={onLike} />
        <RailBtn icon="share" label="Share" onPress={() => shareAndNotify(toast, f.mealId ? { title: f.mealName ?? 'A dish on Preppa', url: `${SITE}/meal/${f.mealId}` } : { title: `${f.kitchenName} on Preppa`, url: `${SITE}/store/${f.kitchenId}` })} />
        <RailBtn icon={saved ? 'bookmarkFill' : 'bookmark'} label={saved ? 'Saved' : 'Save'} active={saved} onPress={() => { setSaved((v) => !v); toast(saved ? 'Removed from saved' : 'Saved to your list', 'bookmark', !saved); }} />
      </View>

      {/* bottom */}
      <View style={{ position: 'absolute', left: 16, right: 74, bottom: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <Press scale={0.9} onPress={() => router.push(`/store/${f.kitchenId}`)}>
            <GradBox grad={f.grad} img={f.kitchenAvatarUrl ?? undefined} style={{ width: 40, height: 40, borderRadius: 13, borderWidth: 1.5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
              {f.kitchenAvatarUrl ? null : <Text style={[type(15, 900), { color: '#fff' }]}>{initialOf(f.kitchenName)}</Text>}
            </GradBox>
          </Press>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text style={[type(15, 900), { color: '#fff' }]}>{f.kitchenName}</Text>
            <Icon name="shield" size={14} color="#fff" />
          </View>
        </View>
        {f.caption ? <Text style={[type(13.5, 500), { color: '#fff', marginTop: 11, lineHeight: 19 }]}>{f.caption}</Text> : null}
        {f.mealId ? (
          <Press scale={0.98} onPress={() => router.push(`/meal/${f.mealId}`)} style={{ marginTop: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, padding: 8, paddingLeft: 12, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,.22)' }}>
              <GradBox grad={f.grad} img={f.mealImageUrl ?? undefined} style={{ width: 42, height: 42, borderRadius: 11 }} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={[type(13, 800), { color: '#fff' }]}>{f.mealName}</Text>
                <Text style={[type(12, 700), { color: 'rgba(255,255,255,.85)' }]}>by {f.kitchenName}{f.mealPriceCents != null ? ` · ${money(f.mealPriceCents / 100)}` : ''}</Text>
              </View>
              <View style={{ height: 38, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: '#F26B1D', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name="cart" size={15} color="#fff" />
                <Text style={[type(13.5, 800), { color: '#fff' }]}>Order</Text>
              </View>
            </View>
          </Press>
        ) : null}
      </View>
    </View>
  );
});

function RailBtn({ icon, label, active, onPress }: { icon: string; label: string; active?: boolean; onPress: () => void }) {
  return (
    <Press scale={0.85} onPress={onPress}>
      <View style={{ alignItems: 'center', gap: 5 }}>
        <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: active ? '#F26B1D' : 'rgba(0,0,0,.32)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={24} color="#fff" />
        </View>
        <Text style={[type(11, 800), { color: '#fff' }]}>{label}</Text>
      </View>
    </Press>
  );
}

const StyleAbs = { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 };
