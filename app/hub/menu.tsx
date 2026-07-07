import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press, GradBox } from '../../src/ui';
import { money } from '../../src/data/data';
import { MY_MEALS, MY_PLANS, MyMeal, MealStatus } from '../../src/data/cook';
import { HubHeader, KBtn, KSec, KPill } from '../(tabs)/my-hub';

function statusPill(c: any, s: MealStatus) {
  if (s === 'live') return { label: 'Live', bg: c.greenL, fg: '#0f7a39', dot: true };
  if (s === 'paused') return { label: 'Paused', bg: c.bg2, fg: c.muted };
  return { label: 'Sold out', bg: '#FEF3E2', fg: '#B45309' };
}

export default function MenuScreen() {
  const c = useC();
  const router = useRouter();
  const { toast } = useStore();
  const [meals, setMeals] = useState<MyMeal[]>(MY_MEALS);
  const toggle = (id: string) => setMeals((ms) => ms.map((m) => (m.id === id ? { ...m, status: m.status === 'live' ? 'paused' : 'live' } : m)));
  const live = meals.filter((m) => m.status === 'live').length;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <HubHeader eyebrow="My Hub" name="My menu" onBack={() => router.back()} noAvail right={<KBtn label="Add meal" icon="plus" onPress={() => router.push('/hub/create-meal')} />} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 14, paddingBottom: 40, maxWidth: 1040, alignSelf: 'center', width: '100%' }}>
        <Text style={[type(13, 600), { color: c.soft, paddingHorizontal: 20, paddingBottom: 8 }]}>{live} live · {meals.length} total dishes</Text>
        {meals.map((m) => {
          const p = statusPill(c, m.status);
          return (
            <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 16, padding: 13, marginHorizontal: 20, marginBottom: 10 }}>
              <GradBox grad={m.grad} style={{ width: 50, height: 50, borderRadius: 13 }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={[type(14.5, 800), { color: c.ink, letterSpacing: -0.3 }]}>{m.name}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <Icon name="star" size={12} color={c.star} />
                  <Text style={[type(12.5, 600), { color: c.soft }]}>{m.rating} · {m.sold} sold · {money(m.price)}</Text>
                </View>
                <View style={{ marginTop: 5 }}>
                  <KPill label={p.label} bg={p.bg} fg={p.fg} dot={p.dot} />
                </View>
              </View>
              <View style={{ gap: 7, alignItems: 'flex-end' }}>
                <KBtn label="Edit" variant="ghost" sm icon="edit" onPress={() => toast('Edit ' + m.name, 'edit')} />
                <KBtn label={m.status === 'live' ? 'Pause' : 'Make live'} variant="ghost" sm onPress={() => toggle(m.id)} />
              </View>
            </View>
          );
        })}

        <KSec title="Meal plans" link="Manage" onLink={() => router.push('/hub/plans')} />
        {MY_PLANS.map((pl) => (
          <View key={pl.id} style={{ marginHorizontal: 20, marginBottom: 10, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 13 }}>
            <GradBox grad={pl.grad} style={{ width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="repeat" size={20} color="#fff" />
            </GradBox>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[type(15, 900), { color: c.ink, letterSpacing: -0.2 }]}>{pl.name}</Text>
              <Text style={[type(12.5, 600), { color: c.soft, marginTop: 2 }]}>{pl.meals} · {pl.subs} reserved</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[type(16, 900), { color: c.ink, letterSpacing: -0.3 }]}>{money(pl.price)}</Text>
              <Text style={[type(11, 700), { color: c.muted }]}>/{pl.per}</Text>
            </View>
          </View>
        ))}
        <View style={{ paddingHorizontal: 20, paddingTop: 2 }}>
          <KBtn label="Create a meal plan" variant="ghost" block icon="plus" onPress={() => router.push('/hub/create-plan')} />
        </View>
      </ScrollView>
    </View>
  );
}
