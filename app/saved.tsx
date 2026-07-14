import React, { useCallback, useState } from 'react';
import { ScrollView, View, Text, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useC } from '../src/theme/ThemeContext';
import { type, radius, shadow } from '../src/theme/theme';
import { money } from '../src/data/data';
import { Btn, Icon, Press, GradBox } from '../src/ui';
import { Screen, TopBar, Empty } from '../src/ui/layout';
import { fetchSavedPosts, togglePostSave, recordFeedEvent, FeedPost } from '../src/lib/feed';

/** Profile → Saved: the posts a customer bookmarked in the feed, newest-saved first.
 *  A re-order shortlist — each pinned dish that's still orderable gets a direct Order CTA. */
export default function Saved() {
  const c = useC();
  const router = useRouter();
  const [items, setItems] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let alive = true;
    setLoading(true);
    fetchSavedPosts()
      .then((p) => { if (alive) { setItems(p); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []));

  const unsave = async (postId: string) => {
    if (removing) return;
    setRemoving(postId);
    const prev = items;
    setItems((cur) => cur.filter((p) => p.id !== postId)); // optimistic
    try {
      const stillSaved = await togglePostSave(postId);
      if (stillSaved) setItems(prev); // toggled the wrong way somehow — put it back
    } catch {
      setItems(prev); // restore on failure
    } finally { setRemoving(null); }
  };

  return (
    <Screen>
      <TopBar title="Saved" sub={items.length ? `${items.length} saved` : undefined} />
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.primary} /></View>
      ) : items.length === 0 ? (
        <Empty
          icon="bookmark"
          title="Nothing saved yet"
          body="Tap Save on any post in the feed to keep it here — a quick shortlist for reordering."
          action={<Btn label="Open the feed" onPress={() => router.replace('/(tabs)/feeds')} />}
        />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
          {items.map((f) => (
            <View key={f.id} style={{ flexDirection: 'row', gap: 12, backgroundColor: c.surface, borderRadius: radius.card, borderWidth: 1, borderColor: c.border2, padding: 10, ...shadow.soft }}>
              <GradBox grad={f.grad} img={f.coverUrl} style={{ width: 76, height: 76, borderRadius: radius.md }} />
              <Press scale={0.9} onPress={() => unsave(f.id)} label="Remove from saved" style={{ position: 'absolute', top: 10, right: 10 }}>
                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="bookmarkFill" size={15} color={c.primary} />
                </View>
              </Press>
              <View style={{ flex: 1, justifyContent: 'space-between', paddingRight: 34 }}>
                <View>
                  <Press onPress={() => { recordFeedEvent(f.id, 'open_store'); router.push(`/store/${f.kitchenId}`); }}>
                    <Text style={[type(14, 900), { color: c.ink }]} numberOfLines={1}>{f.kitchenName}</Text>
                  </Press>
                  {f.caption ? <Text style={[type(12.5, 500), { color: c.soft, marginTop: 2 }]} numberOfLines={2}>{f.caption}</Text> : null}
                </View>
                {f.mealOrderable && f.mealId ? (
                  <Press scale={0.98} onPress={() => { recordFeedEvent(f.id, 'open_meal'); router.push(`/meal/${f.mealId}`); }} style={{ marginTop: 8, alignSelf: 'flex-start' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: c.primary }}>
                      <Icon name="cart" size={14} color="#fff" />
                      <Text style={[type(12.5, 800), { color: '#fff' }]}>Order {f.mealName ?? 'dish'}{f.mealPriceCents != null ? ` · ${money(f.mealPriceCents / 100)}` : ''}</Text>
                    </View>
                  </Press>
                ) : f.mealId ? (
                  <Text style={[type(12, 700), { color: c.muted, marginTop: 8 }]}>Dish currently unavailable</Text>
                ) : null}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}
