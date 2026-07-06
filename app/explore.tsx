import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MEALS, COOKS } from '../src/data/data';
import { useC } from '../src/theme/ThemeContext';
import { type, radius, shadow } from '../src/theme/theme';
import { useStore } from '../src/store/store';
import { Icon, Press } from '../src/ui';
import { Screen, Empty } from '../src/ui/layout';
import { MealGrid } from '../src/components/cards';

const CATS = ['All', 'Comfort', 'Healthy', 'Halal', 'Mexican', 'Seafood', 'Soul food'];

export default function Explore() {
  const c = useC();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { toast } = useStore();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');

  const list = MEALS.filter((m) => {
    const okCat = cat === 'All' || m.tags.some((t) => t.toLowerCase().includes(cat.toLowerCase()));
    const okQ = !q || m.name.toLowerCase().includes(q.toLowerCase()) || COOKS[m.cook].name.toLowerCase().includes(q.toLowerCase());
    return okCat && okQ;
  });

  return (
    <Screen>
      <View style={{ backgroundColor: c.surface, paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: c.border2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Press scale={0.9} onPress={() => router.back()}>
            <View style={[{ width: 42, height: 42, borderRadius: 21, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }, shadow.soft]}>
              <Icon name="chevLeft" size={20} color={c.ink} />
            </View>
          </Press>
          <Text style={[type(24, 900), { color: c.ink, letterSpacing: -0.7, flex: 1 }]}>Explore</Text>
          <Press scale={0.9} onPress={() => toast('Filters coming soon', 'sliders')}>
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="sliders" size={18} color={c.ink2} />
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
          <Empty icon="search" title="No matches" body="Try another cuisine or clear your search." />
        ) : (
          <MealGrid meals={list} showMatch px={16} />
        )}
      </ScrollView>
    </Screen>
  );
}
