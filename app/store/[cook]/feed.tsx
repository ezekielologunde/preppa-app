import React, { useCallback, useRef, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect, Redirect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FLAGS } from '../../../src/config/flags';
import { isRejectedSeedKitchenRoute } from '../../../src/lib/routePolicy';
import { type } from '../../../src/theme/theme';
import { Btn, Icon, Press } from '../../../src/ui';
import { fetchKitchenFeed, FeedPost } from '../../../src/lib/feed';
import { FeedReel } from '../../../src/components/FeedReel';

/** One kitchen's posts only — same paging reel as the main feed, scoped via fetchKitchenFeed. */
export default function KitchenFeed() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { cook } = useLocalSearchParams<{ cook: string }>();
  const rejectedSeed = isRejectedSeedKitchenRoute(cook);
  const kitchenId = rejectedSeed ? '' : cook;

  const [h, setH] = useState(0);
  const [items, setItems] = useState<FeedPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryNonce, setRetryNonce] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 90 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) setActiveId(viewableItems[0].item.id);
  }).current;
  if (!FLAGS.feed || rejectedSeed) return <Redirect href="/(tabs)/home" />;

  useFocusEffect(useCallback(() => {
    let alive = true;
    if (!kitchenId) { setLoading(false); return; }
    setError('');
    fetchKitchenFeed(kitchenId)
      .then((r) => { if (alive) { setItems(r.posts); setCursor(r.nextCursor); setActiveId(r.posts[0]?.id ?? null); } })
      .catch((e) => { if (alive) setError(e?.message ?? 'Couldn’t load this kitchen’s posts.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; setActiveId(null); };
  }, [kitchenId, retryNonce]));

  const onRefresh = useCallback(async () => {
    if (!kitchenId) return;
    setRefreshing(true);
    try { const r = await fetchKitchenFeed(kitchenId); setItems(r.posts); setCursor(r.nextCursor); setActiveId(r.posts[0]?.id ?? null); }
    finally { setRefreshing(false); }
  }, [kitchenId]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !cursor || !kitchenId) return;
    setLoadingMore(true);
    try {
      const r = await fetchKitchenFeed(kitchenId, { cursor });
      setItems((prev) => [...prev, ...r.posts]);
      setCursor(r.nextCursor);
    } finally { setLoadingMore(false); }
  }, [cursor, loadingMore, kitchenId]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }} onLayout={(e) => setH(e.nativeEvent.layout.height)}>
      <View style={{ position: 'absolute', top: insets.top + 54, left: 16, zIndex: 2 }}>
        <Press scale={0.9} onPress={() => router.back()} label="Back">
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,.4)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="chevLeft" size={20} color="#fff" />
          </View>
        </Press>
      </View>
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color="#fff" /></View>
      ) : error && items.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <Icon name="info" size={40} color="rgba(255,255,255,.65)" />
          <Text style={[type(16, 900), { color: '#fff', marginTop: 14 }]}>Couldn’t load posts</Text>
          <Text style={[type(13, 500), { color: 'rgba(255,255,255,.65)', textAlign: 'center', marginTop: 6, marginBottom: 16 }]}>{error}</Text>
          <Btn label="Try again" icon="repeat" onPress={() => { setLoading(true); setRetryNonce((n) => n + 1); }} />
        </View>
      ) : items.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <Icon name="video" size={40} color="rgba(255,255,255,.5)" />
          <Text style={[type(16, 900), { color: '#fff', marginTop: 14 }]}>No posts yet</Text>
        </View>
      ) : h > 0 ? (
        <FlatList
          data={items}
          keyExtractor={(f) => f.id}
          renderItem={({ item }) => <FeedReel f={item} height={h} isActive={item.id === activeId} />}
          pagingEnabled
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, i) => ({ length: h, offset: h * i, index: i })}
          initialNumToRender={1}
          windowSize={3}
          maxToRenderPerBatch={2}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 16 }} color="#fff" /> : null}
        />
      ) : null}
    </View>
  );
}
