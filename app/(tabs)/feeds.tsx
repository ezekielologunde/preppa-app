import React, { useState } from 'react';
import { View, Text, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { FEED, COOKS, mealById, money } from '../../src/data/data';
import { type, radius } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press, GradBox } from '../../src/ui';
import { shareAndNotify, SITE } from '../../src/lib/share';

export default function Feeds() {
  const [h, setH] = useState(0);
  const { reels } = useStore();
  const items = [...reels, ...FEED];
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }} onLayout={(e) => setH(e.nativeEvent.layout.height)}>
      {h > 0 ? (
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

const Reel = React.memo(function Reel({ f, height }: { f: (typeof FEED)[number]; height: number }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { toast } = useStore();
  const cook = COOKS[f.cook];
  const meal = mealById(f.meal);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [following, setFollowing] = useState(false);
  return (
    <View style={{ height, width: '100%' }}>
      <GradBox grad={f.grad} img={meal?.img} style={{ ...StyleAbs }} />
      <LinearGradient colors={['rgba(0,0,0,.35)', 'transparent', 'rgba(0,0,0,.72)']} locations={[0, 0.4, 1]} style={StyleAbs} />

      {/* play */}
      <View style={{ position: 'absolute', top: '44%', left: 0, right: 0, alignItems: 'center' }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,.4)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="play" size={26} color="#fff" />
        </View>
      </View>

      {/* top */}
      <View style={{ position: 'absolute', top: insets.top + 10, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 11, borderRadius: radius.pill, backgroundColor: f.live ? '#EF4444' : 'rgba(0,0,0,.4)' }}>
          {f.live ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' }} /> : null}
          <Text style={[type(11, 900), { color: '#fff' }]}>{f.live ? 'LIVE' : 'REEL'}</Text>
        </View>
        <Text style={[type(17, 900), { color: '#fff' }]}>Feed</Text>
      </View>

      {/* right rail */}
      <View style={{ position: 'absolute', right: 12, bottom: 40, alignItems: 'center', gap: 20 }}>
        <RailBtn icon={liked ? 'heartFill' : 'heart'} label={f.likes} active={liked} onPress={() => setLiked((v) => !v)} />
        <RailBtn icon="comment" label={String(f.comments)} onPress={() => toast('Comments — demo', 'comment')} />
        <RailBtn icon="share" label="Share" onPress={() => shareAndNotify(toast, meal ? { title: meal.name, url: `${SITE}/meal/${meal.id}` } : { title: `${cook.name} on Preppa`, url: `${SITE}/store/${f.cook}` })} />
        <RailBtn icon={saved ? 'bookmarkFill' : 'bookmark'} label={saved ? 'Saved' : 'Save'} active={saved} onPress={() => { setSaved((v) => !v); toast(saved ? 'Removed from saved' : 'Saved to your list', 'bookmark', !saved); }} />
      </View>

      {/* bottom */}
      <View style={{ position: 'absolute', left: 16, right: 74, bottom: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <Press scale={0.9} onPress={() => router.push(`/store/${f.cook}`)}>
            <GradBox grad={cook.grad} style={{ width: 40, height: 40, borderRadius: 13, borderWidth: 1.5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={[type(15, 900), { color: '#fff' }]}>{cook.initial}</Text>
            </GradBox>
          </Press>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text style={[type(15, 900), { color: '#fff' }]}>{cook.name}</Text>
            <Icon name="shield" size={14} color="#fff" />
          </View>
          <Press scale={0.94} onPress={() => { setFollowing((v) => !v); toast(following ? `Unfollowed ${cook.name}` : `Following ${cook.name}`, following ? 'x' : 'check', !following); }}>
            <View style={{ height: 30, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: following ? 'rgba(255,255,255,.2)' : '#fff', borderWidth: following ? 1 : 0, borderColor: 'rgba(255,255,255,.5)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={[type(12.5, 900), { color: following ? '#fff' : '#0E0E10' }]}>{following ? 'Following' : 'Follow'}</Text>
            </View>
          </Press>
        </View>
        <Text style={[type(13.5, 500), { color: '#fff', marginTop: 11, lineHeight: 19 }]}>{f.caption}</Text>
        {meal ? (
          <Press scale={0.98} onPress={() => router.push(`/meal/${meal.id}`)} style={{ marginTop: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, padding: 8, paddingLeft: 12, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,.22)' }}>
              <GradBox grad={meal.grad} style={{ width: 42, height: 42, borderRadius: 11 }} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={[type(13, 800), { color: '#fff' }]}>{meal.name}</Text>
                <Text style={[type(12, 700), { color: 'rgba(255,255,255,.85)' }]}>by {cook.name} · {money(meal.price)}</Text>
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
