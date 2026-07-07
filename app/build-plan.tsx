import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { MEALS, COOKS, mealById, PLAN_DAYS, money } from '../src/data/data';
import { useC } from '../src/theme/ThemeContext';
import { type, radius } from '../src/theme/theme';
import { useStore } from '../src/store/store';
import { Icon, Press, GradBox, Btn } from '../src/ui';
import { Screen, TopBar, Dock, DockTotal, Block } from '../src/ui/layout';
import { Burst } from '../src/components/shared';

type Stage = 'pick' | 'schedule' | 'done';

export default function BuildPlanFlow() {
  const c = useC();
  const router = useRouter();
  const { subscribe } = useStore();
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [day, setDay] = useState('Thu');
  const [stage, setStage] = useState<Stage>('pick');

  const ids = Object.keys(picked).filter((k) => picked[k]);
  const sum = ids.reduce((s, id) => s + (mealById(id)?.price ?? 0), 0);
  const price = Math.round(sum * 100) / 100;
  const valid = ids.length >= 2;

  if (stage === 'done') {
    return (
      <Screen bg={c.surface}>
        <Burst
          title="You’re on the list!"
          body={<>You’ve reserved a custom box of {ids.length} meals, every <Text style={type(15, 800)}>{day}</Text> (<Text style={type(15, 800)}>{money(price)}/week</Text> when live). Weekly plans are launching soon — we’ll message you when yours goes live.</>}
          actionLabel="View my reservation"
          onAction={() => router.replace('/plans')}
        />
      </Screen>
    );
  }

  if (stage === 'schedule') {
    return (
      <Screen>
        <TopBar title="Schedule" sub={`${ids.length} meals`} onBack={() => setStage('pick')} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
          <Block title="Delivery day">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
              {PLAN_DAYS.map((d) => <DayChip key={d} label={d} on={day === d} onPress={() => setDay(d)} />)}
            </View>
          </Block>
          <View style={{ backgroundColor: c.surface, borderRadius: radius.card, margin: 16, padding: 16, borderWidth: 1, borderColor: c.border2 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[type(15, 800), { color: c.ink }]}>{ids.length} meals weekly · when live</Text>
              <Text style={[type(19, 900), { color: c.ink }]}>{money(price)}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: c.border, borderStyle: 'dashed' }}>
              <Icon name="shield" size={17} color={c.primary} />
              <Text style={[type(12.5, 600), { color: c.ink2, flex: 1, lineHeight: 18 }]}>No charge today — you’re reserving your box. Weekly billing starts only when plans go live in your area.</Text>
            </View>
          </View>
        </ScrollView>
        <Dock>
          <DockTotal label="When live" value={`${money(price)}/wk`} />
          <Btn label="Reserve my box" flex={1} onPress={() => { subscribe({ name: 'My weekly box', cook: null, price, per: 'week', items: ids.map((id) => mealById(id)!.name), day, status: 'active', skipNext: false }); setStage('done'); }} />
        </Dock>
      </Screen>
    );
  }

  return (
    <Screen>
      <TopBar title="Build your plan" sub="pick 2+" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
        <Text style={[type(13.5, 600), { color: c.soft, marginHorizontal: 16, marginTop: 14, marginBottom: 6, lineHeight: 20 }]}>Choose the meals you want every week. Mix cooks freely — we bundle the deliveries. (Most people prefer a cook’s ready-made box.)</Text>
        {MEALS.map((m) => {
          const on = !!picked[m.id];
          return (
            <Press key={m.id} scale={0.99} onPress={() => setPicked((p) => ({ ...p, [m.id]: !p[m.id] }))}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: c.border2 }}>
                <GradBox grad={m.grad} style={{ width: 48, height: 48, borderRadius: 13 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[type(14, 800), { color: c.ink, letterSpacing: -0.1 }]}>{m.name}</Text>
                  <Text style={[type(12, 600), { color: c.soft, marginTop: 1 }]}>{COOKS[m.cook].name} · {money(m.price)}</Text>
                </View>
                <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  {on ? <Icon name="check" size={14} color="#fff" /> : null}
                </View>
              </View>
            </Press>
          );
        })}
      </ScrollView>
      <Dock>
        <DockTotal label={`${ids.length} meals`} value={`${money(price)}/wk`} />
        <Btn label="Next" iconRight="arrow" flex={1} disabled={!valid} onPress={() => setStage('schedule')} />
      </Dock>
    </Screen>
  );
}

function DayChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const c = useC();
  return (
    <Press scale={0.95} onPress={onPress}>
      <View style={{ height: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: on ? c.primary : c.bg2, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={[type(13, 800), { color: on ? '#fff' : c.soft }]}>{label}</Text>
      </View>
    </Press>
  );
}
