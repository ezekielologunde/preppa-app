import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius, shadow } from '../../src/theme/theme';
import { Icon, Press, Avatar } from '../../src/ui';
import { money, COOKS } from '../../src/data/data';
import { useKitchens, type KitchenCard } from '../../src/data/hooks';
import { seedCookForKitchen } from '../../src/data/supabaseRepository';
import { MealsBrowser } from '../../src/components/MealsBrowser';
import { ModeTabs } from '../../src/components/ModeTabs';
import { fetchActivePlans, type Plan } from '../../src/lib/subscriptions';
import { FLAGS } from '../../src/config/flags';

type Mode = 'meals' | 'plans' | 'preppers' | 'services';
const planWeekly = (cents: number) => money((cents + Math.round(cents * 0.1)) / 100);

export default function DiscoverTab() {
  const c = useC();
  const insets = useSafeAreaInsets();
  const { mode: modeParam } = useLocalSearchParams<{ mode?: string }>();
  const MODES: { key: Mode; label: string }[] = [
    { key: 'meals', label: 'Meals' },
    { key: 'plans', label: 'Plans' },
    { key: 'preppers', label: 'Preppers' },
    ...(FLAGS.services ? [{ key: 'services' as Mode, label: 'Services' }] : []),
  ];
  const initial = (MODES.find((m) => m.key === modeParam)?.key ?? 'meals') as Mode;
  const [mode, setMode] = useState<Mode>(initial);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ backgroundColor: c.surface, paddingTop: insets.top + 10, paddingBottom: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: c.border2 }}>
        <Text style={[type(26, 900), { color: c.ink, letterSpacing: -0.9, marginBottom: 12, paddingHorizontal: 4 }]}>Discover</Text>
        <ModeTabs modes={MODES} value={mode} onChange={setMode} />
      </View>
      {mode === 'meals' ? <MealsBrowser /> : mode === 'plans' ? <PlansMode /> : <PreppersMode />}
    </View>
  );
}

function PlansMode() {
  const c = useC();
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  useFocusEffect(useCallback(() => { let a = true; setLoading(true); fetchActivePlans().then((p) => { if (a) { setPlans(p); setLoading(false); } }); return () => { a = false; }; }, []));
  if (loading) return <View style={{ paddingVertical: 60, alignItems: 'center' }}><ActivityIndicator color={c.primary} /></View>;
  if (plans.length === 0) return (
    <View style={{ alignItems: 'center', paddingVertical: 50, paddingHorizontal: 24 }}>
      <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: c.primaryL, alignItems: 'center', justifyContent: 'center' }}><Icon name="repeat" size={26} color={c.primary} /></View>
      <Text style={[type(16, 900), { color: c.ink, marginTop: 14 }]}>No weekly plans near you yet</Text>
      <Text style={[type(13.5, 600), { color: c.soft, textAlign: 'center', marginTop: 6, maxWidth: 300, lineHeight: 20 }]}>Preppers are adding weekly boxes. Check back soon.</Text>
    </View>
  );
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
      {plans.map((p) => (
        <Press key={p.id} scale={0.985} onPress={() => router.push(`/plan/${p.id}`)}>
          <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: radius.xl, padding: 16, ...shadow.card }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={[type(16, 900), { color: c.ink, letterSpacing: -0.3 }]}>{p.name}</Text>
                <Text style={[type(12.5, 600), { color: c.soft, marginTop: 3 }]}>{p.kitchenName} · {p.items.reduce((n, i) => n + i.qty, 0)} meals/wk</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[type(18, 900), { color: c.ink, letterSpacing: -0.5 }]}>{planWeekly(p.priceCents)}</Text>
                <Text style={[type(10.5, 700), { color: c.muted }]}>/week</Text>
              </View>
            </View>
          </View>
        </Press>
      ))}
    </ScrollView>
  );
}

function PreppersMode() {
  const c = useC();
  const router = useRouter();
  const { data: kitchens, loading } = useKitchens();
  if (loading) return <View style={{ paddingVertical: 60, alignItems: 'center' }}><ActivityIndicator color={c.primary} /></View>;
  const list = kitchens ?? [];
  if (list.length === 0) return (
    <View style={{ alignItems: 'center', paddingVertical: 50, paddingHorizontal: 24 }}>
      <Text style={[type(14, 600), { color: c.soft, textAlign: 'center' }]}>No preppers near you yet.</Text>
    </View>
  );
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
      {list.map((k) => <PrepperRow key={k.id} k={k} onPress={() => router.push(`/store/${seedCookForKitchen(k.id) ?? k.id}`)} />)}
    </ScrollView>
  );
}

function PrepperRow({ k, onPress }: { k: KitchenCard; onPress: () => void }) {
  const c = useC();
  const seed = seedCookForKitchen(k.id);
  const cook = seed ? COOKS[seed] : null;
  const name = cook?.name ?? k.name;
  const cuisine = cook?.cuisine ?? k.cuisine;
  const distTxt = k.dist || cook?.dist || k.area;
  const rating = k.ratingCount > 0 ? k.ratingAvg.toFixed(1) : 'New';
  return (
    <Press scale={0.99} onPress={onPress} label={`${name} kitchen`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: radius.xl, padding: 14, ...shadow.card }}>
        {seed ? <Avatar cook={seed} size={52} rad={16} /> : (
          <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={[type(21, 900), { color: '#fff' }]}>{name.trim()[0]?.toUpperCase() ?? 'K'}</Text>
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text numberOfLines={1} style={[type(16, 900), { color: c.ink, letterSpacing: -0.3 }]}>{name}</Text>
            <Icon name="shield" size={14} color={c.green} />
          </View>
          <Text numberOfLines={1} style={[type(12.5, 600), { color: c.soft, marginTop: 2 }]}>{cuisine}{distTxt ? ` · ${distTxt}` : ''}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <Icon name="star" size={12} color={c.star} />
            <Text style={[type(12, 800), { color: c.ink2 }]}>{rating}</Text>
          </View>
        </View>
        <Icon name="chevRight" size={18} color={c.muted} />
      </View>
    </Press>
  );
}
