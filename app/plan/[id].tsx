import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { marketPlanById, COOKS, PLAN_DAYS, money } from '../../src/data/data';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press, GradBox, Btn } from '../../src/ui';
import { Screen, TopBar, Dock, DockTotal, Block, SectionLabel } from '../../src/ui/layout';
import { CookRow, HeroTopBar, Burst } from '../../src/components/shared';

type Stage = 'info' | 'pay' | 'done';

export default function PlanDetailScreen() {
  const c = useC();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { subscribe } = useStore();
  const p = marketPlanById(id!);
  const [day, setDay] = useState('Thu');
  const [stage, setStage] = useState<Stage>('info');
  if (!p) return <Screen><View /></Screen>;
  const cook = COOKS[p.cook];
  const mealsLbl = `${p.meals} meal${p.meals !== 1 ? 's' : ''}`;

  if (stage === 'done') {
    return (
      <Screen bg={c.surface}>
        <Burst
          title="You’re subscribed!"
          body={<>First <Text style={type(15, 800)}>{p.name}</Text> arrives <Text style={type(15, 800)}>{day}</Text>, 5–7 PM. Pause, skip or swap meals anytime — no lock-in.</>}
          actionLabel="Manage my plan"
          onAction={() => router.replace('/plans')}
        />
      </Screen>
    );
  }

  if (stage === 'pay') {
    return (
      <Screen>
        <TopBar title="Confirm subscription" onBack={() => setStage('info')} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
          <Block title={`${p.name} · every ${day}`}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
              <Fact icon="chefhat" text={cook.name} />
              <Fact icon="repeat" text={`${mealsLbl}/week`} />
              <Fact icon="truck" text={`${day} · 5–7 PM`} />
            </View>
          </Block>
          <Block title="Payment"><PayRow /></Block>
          <View style={{ backgroundColor: c.surface, borderRadius: radius.card, margin: 16, padding: 16, borderWidth: 1, borderColor: c.border2 }}>
            <SumRow label="Weekly box" value={money(p.price)} />
            <SumRow label="Delivery" value="Free for subscribers" free />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: c.border, borderStyle: 'dashed', marginTop: 8, paddingTop: 14 }}>
              <Text style={[type(17, 900), { color: c.ink }]}>Per week</Text>
              <Text style={[type(19, 900), { color: c.ink }]}>{money(p.price)}</Text>
            </View>
          </View>
        </ScrollView>
        <Dock>
          <DockTotal label="Per week" value={money(p.price)} />
          <Btn label={`Subscribe · ${money(p.price)}/wk`} flex={1} onPress={() => { subscribe({ name: p.name, cook: p.cook, price: p.price, per: 'week', items: p.items, day, status: 'active', skipNext: false }); setStage('done'); }} />
        </Dock>
      </Screen>
    );
  }

  return (
    <Screen bg={c.surface}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <GradBox grad={p.grad} style={{ height: 280 }}>
          <HeroTopBar topInset={insets.top} onBack={() => router.back()} />
          <View style={{ position: 'absolute', bottom: 38, left: 18, height: 24, borderRadius: radius.pill, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.purple }}>
            <Icon name="repeat" size={11} color="#fff" />
            <Text style={[type(10, 900), { color: '#fff', textTransform: 'uppercase', letterSpacing: 0.3 }]}>Weekly plan</Text>
          </View>
        </GradBox>

        <View style={{ backgroundColor: c.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, marginTop: -26, padding: 18, paddingTop: 22 }}>
          <Text style={[type(23, 900), { color: c.ink, letterSpacing: -0.8, lineHeight: 27 }]}>{p.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
            <Icon name="repeat" size={15} color={c.primary} />
            <Text style={[type(13.5, 700), { color: c.ink }]}>{mealsLbl} every week</Text>
          </View>

          <CookRow cook={p.cook} />

          <SectionLabel>About this plan</SectionLabel>
          <Text style={[type(14.5, 500), { color: c.soft, lineHeight: 23 }]}>{p.desc}</Text>

          <SectionLabel>In a typical week</SectionLabel>
          {p.items.map((it, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="check" size={14} color="#fff" />
              </View>
              <Text style={[type(14.5, 700), { color: c.ink, flex: 1 }]}>{it}</Text>
            </View>
          ))}

          <SectionLabel>Delivery day</SectionLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
            {PLAN_DAYS.map((d) => <DayChip key={d} label={d} on={day === d} onPress={() => setDay(d)} />)}
          </View>
          <Text style={[type(12.5, 600), { color: c.muted, marginTop: 16, lineHeight: 19 }]}>Pause, skip a week, or swap meals anytime. No commitment — cancel whenever.</Text>
        </View>
      </ScrollView>

      <Dock>
        <DockTotal label="Per week" value={money(p.price)} />
        <Btn label="Subscribe" iconRight="arrow" flex={1} onPress={() => setStage('pay')} />
      </Dock>
    </Screen>
  );
}

function Fact({ icon, text }: { icon: string; text: string }) {
  const c = useC();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 11, borderRadius: radius.pill, backgroundColor: c.bg2 }}>
      <Icon name={icon} size={14} color={c.muted} />
      <Text style={[type(12, 700), { color: c.ink2 }]}>{text}</Text>
    </View>
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
