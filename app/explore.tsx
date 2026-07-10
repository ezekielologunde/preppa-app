import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MEALS, COOKS, Meal } from '../src/data/data';
import { useC } from '../src/theme/ThemeContext';
import { type, radius, shadow } from '../src/theme/theme';
import { Icon, Press, Btn, Sheet } from '../src/ui';
import { Screen, Empty } from '../src/ui/layout';
import { MealGrid } from '../src/components/cards';

const CATS = ['All', 'Comfort', 'Healthy', 'Halal', 'Mexican', 'Seafood', 'Soul food'];
const ALL_TAGS = Array.from(new Set(MEALS.flatMap((m) => m.tags)));
const PRICES: { label: string; test: (p: number) => boolean }[] = [
  { label: 'Under $10', test: (p) => p < 10 },
  { label: '$10–$15', test: (p) => p >= 10 && p <= 15 },
  { label: 'Over $15', test: (p) => p > 15 },
];
const GOALS: { label: string; test: (m: Meal) => boolean }[] = [
  { label: 'High protein', test: (m) => m.protein >= 35 },
  { label: 'Lean & light', test: (m) => m.kcal <= 500 },
  { label: 'Cutting', test: (m) => m.protein >= 35 && m.kcal <= 550 },
  { label: 'Bulking', test: (m) => m.kcal >= 600 },
];
type SortKey = 'rating' | 'price' | 'time' | 'protein';
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'rating', label: 'Top rated' },
  { key: 'protein', label: 'Most protein' },
  { key: 'price', label: 'Price: low to high' },
  { key: 'time', label: 'Fastest' },
];

export default function Explore() {
  const c = useC();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [q, setQ] = useState('');
  const { cat: catParam } = useLocalSearchParams<{ cat?: string }>();
  const [cat, setCat] = useState(typeof catParam === 'string' && catParam ? catParam : 'All');
  const [tags, setTags] = useState<string[]>([]);
  const [price, setPrice] = useState<string | null>(null);
  const [goal, setGoal] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const activeCount = tags.length + (price ? 1 : 0) + (goal ? 1 : 0) + (sort ? 1 : 0);
  const toggleTag = (t: string) => setTags((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));
  const clearFilters = () => { setTags([]); setPrice(null); setGoal(null); setSort(null); };

  let list = MEALS.filter((m) => {
    const okCat = cat === 'All' || m.tags.some((t) => t.toLowerCase().includes(cat.toLowerCase()));
    const okQ = !q || m.name.toLowerCase().includes(q.toLowerCase()) || COOKS[m.cook].name.toLowerCase().includes(q.toLowerCase());
    const okTags = tags.length === 0 || m.tags.some((t) => tags.includes(t));
    const okPrice = !price || PRICES.find((b) => b.label === price)!.test(m.price);
    const okGoal = !goal || GOALS.find((g) => g.label === goal)!.test(m);
    return okCat && okQ && okTags && okPrice && okGoal;
  });
  if (sort === 'rating') list = [...list].sort((a, b) => b.rating - a.rating);
  else if (sort === 'protein') list = [...list].sort((a, b) => b.protein - a.protein);
  else if (sort === 'price') list = [...list].sort((a, b) => a.price - b.price);
  else if (sort === 'time') list = [...list].sort((a, b) => parseInt(a.time) - parseInt(b.time));

  return (
    <Screen max={960}>
      <View style={{ backgroundColor: c.surface, paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: c.border2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Press scale={0.9} onPress={() => router.back()} label="Go back">
            <View style={[{ width: 42, height: 42, borderRadius: 21, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }, shadow.soft]}>
              <Icon name="chevLeft" size={20} color={c.ink} />
            </View>
          </Press>
          <Text style={[type(24, 900), { color: c.ink, letterSpacing: -0.7, flex: 1 }]}>Explore</Text>
          <Press scale={0.9} onPress={() => setFilterOpen(true)} label="Filters">
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: activeCount ? c.primary : c.bg2, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="sliders" size={18} color={activeCount ? '#fff' : c.ink2} />
              {activeCount ? (
                <View style={{ position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: c.surface }}>
                  <Text style={[type(10, 900), { color: '#fff' }]}>{activeCount}</Text>
                </View>
              ) : null}
            </View>
          </Press>
        </View>
        <View style={{ height: 54, borderRadius: radius.lg, backgroundColor: c.bg2, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 17, marginTop: 14 }}>
          <Icon name="search" size={18} color={c.muted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search meals, cooks, cuisines…"
            placeholderTextColor={c.muted}
            style={[type(15, 600), { color: c.ink, flex: 1, padding: 0 }]}
          />
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
          {CATS.map((x) => {
            const on = cat === x;
            return (
              <Press key={x} scale={0.94} onPress={() => setCat(x)}>
                <View style={{ height: 36, paddingHorizontal: 15, borderRadius: radius.pill, backgroundColor: on ? c.primary : c.surface, borderWidth: 1, borderColor: on ? c.primary : c.border, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={[type(13, 700), { color: on ? '#fff' : c.soft }]}>{x}</Text>
                </View>
              </Press>
            );
          })}
        </ScrollView>

        <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 }}>
          <Text style={[type(20, 900), { color: c.ink, letterSpacing: -0.7 }]}>{list.length} result{list.length !== 1 ? 's' : ''}</Text>
        </View>

        {list.length === 0 ? (
          <Empty icon="search" title="No matches" body="Try another cuisine, clear filters, or search again." />
        ) : (
          <MealGrid meals={list} showMatch px={16} />
        )}
      </ScrollView>

      <Sheet visible={filterOpen} onClose={() => setFilterOpen(false)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 6 }}>
          <Text style={[type(19, 900), { color: c.ink, letterSpacing: -0.4 }]}>Filters</Text>
          {activeCount ? <Press scale={0.95} onPress={clearFilters} label="Clear filters"><Text style={[type(14, 800), { color: c.primary }]}>Clear all</Text></Press> : null}
        </View>
        <ScrollView showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }} contentContainerStyle={{ paddingBottom: 10 }}>
          <FSec title="Sort by">
            {SORTS.map((s) => <Chip key={s.key} label={s.label} on={sort === s.key} onPress={() => setSort(sort === s.key ? null : s.key)} />)}
          </FSec>
          <FSec title="Goals">
            {GOALS.map((g) => <Chip key={g.label} label={g.label} on={goal === g.label} onPress={() => setGoal(goal === g.label ? null : g.label)} />)}
          </FSec>
          <FSec title="Price">
            {PRICES.map((p) => <Chip key={p.label} label={p.label} on={price === p.label} onPress={() => setPrice(price === p.label ? null : p.label)} />)}
          </FSec>
          <FSec title="Tags">
            {ALL_TAGS.map((t) => <Chip key={t} label={t} on={tags.includes(t)} onPress={() => toggleTag(t)} />)}
          </FSec>
        </ScrollView>
        <View style={{ paddingTop: 8 }}>
          <Btn label={`Show ${list.length} result${list.length !== 1 ? 's' : ''}`} block onPress={() => setFilterOpen(false)} />
        </View>
      </Sheet>
    </Screen>
  );
}

function FSec({ title, children }: { title: string; children: React.ReactNode }) {
  const c = useC();
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={[type(13, 900), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }]}>{title}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>
    </View>
  );
}
function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const c = useC();
  return (
    <Press scale={0.95} onPress={onPress}>
      <View style={{ height: 38, paddingHorizontal: 15, borderRadius: radius.pill, backgroundColor: on ? c.primary : c.bg2, borderWidth: 1, borderColor: on ? c.primary : c.border, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={[type(13.5, 700), { color: on ? '#fff' : c.soft }]}>{label}</Text>
      </View>
    </Press>
  );
}
