import React, { useCallback, useRef, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { FLAGS } from '../../src/config/flags';
import { type, shadow, radius } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press } from '../../src/ui';
import { fetchFeed, FeedPost } from '../../src/lib/feed';
import { FeedReel } from '../../src/components/FeedReel';
import { fetchLiveNow, type LiveStreamRow } from '../../src/lib/livestream';
import { Sheet } from '../../src/ui/overlay';

export default function Feeds() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { prepperStatus } = useStore();
  const [h, setH] = useState(0);
  const [items, setItems] = useState<FeedPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'all' | 'following'>('all');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [liveNow, setLiveNow] = useState<LiveStreamRow[]>([]);
  const [liveSheet, setLiveSheet] = useState(false);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 90 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) setActiveId(viewableItems[0].item.id);
  }).current;
  // Guard the route so a stale-cached direct URL can't render it when the flag is off.
  if (!FLAGS.feed) return <Redirect href="/(tabs)/home" />;

  const following = tab === 'following';

  useFocusEffect(useCallback(() => {
    let alive = true;
    fetchFeed({ following }).then((r) => { if (alive) { setItems(r.posts); setCursor(r.nextCursor); setActiveId(r.posts[0]?.id ?? null); setLoading(false); } });
    if (FLAGS.live) fetchLiveNow().then((l) => { if (alive) setLiveNow(l); }).catch(() => {});
    return () => { alive = false; setActiveId(null); }; // pause any playing video when the tab loses focus
  }, [following]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { const r = await fetchFeed({ following }); setItems(r.posts); setCursor(r.nextCursor); setActiveId(r.posts[0]?.id ?? null); }
    finally { setRefreshing(false); }
  }, [following]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !cursor) return;
    setLoadingMore(true);
    try {
      const r = await fetchFeed({ cursor, following });
      setItems((prev) => [...prev, ...r.posts]);
      setCursor(r.nextCursor);
    } finally { setLoadingMore(false); }
  }, [cursor, loadingMore, following]);

  // Switching tabs clears the list and shows the loader; the focus effect (dep: following) refetches.
  const selectTab = useCallback((t: 'all' | 'following') => {
    setTab((cur) => {
      if (cur === t) return cur;
      setLoading(true); setItems([]); setCursor(null); setActiveId(null);
      return t;
    });
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }} onLayout={(e) => setH(e.nativeEvent.layout.height)}>
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color="#fff" /></View>
      ) : items.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <Icon name={following ? 'users' : 'video'} size={40} color="rgba(255,255,255,.5)" />
          <Text style={[type(16, 900), { color: '#fff', marginTop: 14 }]}>{following ? 'Nothing here yet' : 'No posts yet'}</Text>
          <Text style={[type(13, 500), { color: 'rgba(255,255,255,.6)', textAlign: 'center', marginTop: 6, lineHeight: 19 }]}>
            {following ? 'Follow kitchens and their latest posts show up here.' : 'When cooks share their kitchen, their posts show up here.'}
          </Text>
          {following ? (
            <Press scale={0.96} onPress={() => selectTab('all')} label="See all posts" style={{ marginTop: 16 }}>
              <View style={{ height: 38, paddingHorizontal: 18, borderRadius: radius.pill, backgroundColor: '#E24A38', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={[type(13, 800), { color: '#fff' }]}>See all posts</Text>
              </View>
            </Press>
          ) : null}
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

      {/* All / Following segmented control — centered up top, clear of the reel's tag (left) and
          "Feed" title (right). Defaults to All so an empty-following viewer still sees content. */}
      <View style={{ position: 'absolute', top: insets.top + 8, alignSelf: 'center', flexDirection: 'row', backgroundColor: 'rgba(0,0,0,.42)', borderRadius: radius.pill, padding: 3 }}>
        {(['all', 'following'] as const).map((t) => (
          <Press key={t} scale={0.95} onPress={() => selectTab(t)} label={t === 'all' ? 'All posts' : 'Following'}>
            <View style={{ paddingHorizontal: 16, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: tab === t ? '#fff' : 'transparent' }}>
              <Text style={[type(12.5, 800), { color: tab === t ? '#111' : '#fff' }]}>{t === 'all' ? 'All' : 'Following'}</Text>
            </View>
          </Press>
        ))}
      </View>

      {/* Approved preppers get a compose entry to the existing post flow.
          Placed top-left below the per-reel tag pill so it clears the reel's title + mute controls. */}
      {prepperStatus === 'approved' ? (
        <Press scale={0.9} onPress={() => router.push('/hub/post-reel')} label="Post to the feed"
          style={{ position: 'absolute', top: insets.top + 48, left: 14 }}>
          <View style={{ height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#E24A38', flexDirection: 'row', alignItems: 'center', gap: 7, ...shadow.brand }}>
            <Icon name="plus" size={18} color="#fff" />
            <Text style={[type(13.5, 800), { color: '#fff' }]}>Post</Text>
          </View>
        </Press>
      ) : null}

      {liveNow.length > 0 ? (
        <Press scale={0.9} onPress={() => (liveNow.length === 1 ? router.push(`/store/${liveNow[0].kitchenId}/live`) : setLiveSheet(true))} label="Live now"
          style={{ position: 'absolute', top: insets.top + 8, right: 14 }}>
          <View style={{ height: 30, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: '#E11D48', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' }} />
            <Text style={[type(12, 800), { color: '#fff' }]}>Live{liveNow.length > 1 ? ` (${liveNow.length})` : ''}</Text>
          </View>
        </Press>
      ) : null}

      <Sheet visible={liveSheet} onClose={() => setLiveSheet(false)} title="Live now" scroll>
        {liveNow.map((l) => (
          <Press key={l.id} scale={0.98} onPress={() => { setLiveSheet(false); router.push(`/store/${l.kitchenId}/live`); }} style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.lg, backgroundColor: 'rgba(0,0,0,.04)' }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#E11D48' }} />
              <View style={{ flex: 1 }}>
                <Text style={[type(14.5, 800)]}>{l.kitchenName}</Text>
                {l.title ? <Text style={[type(12, 600), { color: '#666', marginTop: 2 }]}>{l.title}</Text> : null}
              </View>
              <Icon name="chevRight" size={16} color="#999" />
            </View>
          </Press>
        ))}
      </Sheet>
    </View>
  );
}
