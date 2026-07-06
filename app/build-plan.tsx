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
  const price = Math.round(sum * 0.9 * 100) / 100;
  const valid = ids.length >= 2;

  if (stage === 'done') {
    return (
      <Screen bg={c.surface}>
        <Burst
          title="Your plan is live"
          body={<>{ids.length} meals, every <Text style={type(15, 800)}>{day}</Text> — <Text style={type(15, 800)}>{money(price)}/week</Text> (10% bundle discount applied). Manage it anytime.</>}
          actionLabel="Manage my plan"
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
          <Block title="Payment"><PayRow /></Block>
          <View style={{ backgroundColor: c.surface, borderRadius: radius.card, margin: 16, padding: 16, borderWidth: 1, borderColor: c.border2 }}>
            <SumRow label={`${ids.length} meals weekly`} value={money(sum)} />
            <SumRow label="Bundle discount" value={`−${money(sum - price)}`} free />
            <SumRow label="Delivery" value="Free for subscribers" free />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: c.border, borderStyle: 'dashed', marginTop: 8, paddingTop: 14 }}>
              <Text style={[type(17, 900), { color: c.ink }]}>Per week</Text>
              <Text style={[type(19, 900), { color: c.ink }]}>{money(price)}</Text>
            </View>
          </View>
        </ScrollView>
        <Dock>
          <DockTotal label="Per week" value={money(price)} />
          <Btn label={`Start plan · ${money(price)}/wk`} flex={1} onPress={() => { subscribe({ name: 'My weekly box', cook: null, price, per: 'week', items: ids.map((id) => mealById(id)!.name), day, status: 'active', skipNext: false }); setStage('done'); }} />
        </Dock>
      </Screen>
    );
  }

  return (
    <Screen>
      <TopBar title="Build your plan" sub="pick 2+" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
        <Text style={[type(13.5, 600), { color: c.soft, marginHorizontal: 16, marginTop: 14, marginBottom: 6, lineHeight: 20 }]}>Choose the meals you want every week. Mix cooks freely — we bundle the deliveries.</Text>
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
        <DockTotal label={`${ids.length} meals · 10% off`} value={`${money(price)}/wk`} />
        <Btn label="Next" iconRight="arrow" flex={1} disabled={!valid} onPress={() => setStage('schedule')} />
      </Dock>
    </Screen>
  );
}

function SumRow({ label, value, free }: { label: string; value: string; free?: boolean }) {
  const c = useC();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
      <Text style={[type(14, 600), { color: c.soft }]}>{label}</Text>
      <Text style={[type(14, 800), { color: free ? c.green : c.ink }]}>{value}</Text>
    </View>
  );
}

function PayRow() {
  const c = useC();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1.5, borderColor: c.primary, backgroundColor: c.primaryL, borderRadius: radius.md }}>
      <View style={{ width: 42, height: 42, borderRadius: 11, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="card" size={20} color={c.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[type(14.5, 800), { color: c.ink }]}>Visa •••• 4242</Text>
        <Text style={[type(12, 500), { color: c.soft, marginTop: 3 }]}>Billed weekly · cancel anytime</Text>
      </View>
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: c.primary }} />
      </View>
    </View>
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
