import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { MARKET_PLANS, COOKS, MEALS, PLAN_DAYS, money } from '../src/data/data';
import { useC } from '../src/theme/ThemeContext';
import { type, radius, shadow } from '../src/theme/theme';
import { useStore } from '../src/store/store';
import { Icon, Press, GradBox, Avatar } from '../src/ui';
import { Screen, TopBar } from '../src/ui/layout';
import { SectionHeader, GoalBadge } from '../src/components/cards';

export default function MealPlansScreen() {
  const c = useC();
  const router = useRouter();
  const { subscription: sub, updateSub, cancelSub, toast } = useStore();
  const [swapping, setSwapping] = useState(false);

  return (
    <Screen>
      <TopBar title="Meal plans" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {sub ? (
          <>
            <View style={{ marginHorizontal: 16, marginTop: 16, padding: 18, borderRadius: radius.xxl, backgroundColor: c.feature, overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={[type(11, 800), { color: 'rgba(255,255,255,.55)', textTransform: 'uppercase', letterSpacing: 0.8 }]}>Your reservation</Text>
                  <Text style={[type(20, 900), { color: '#fff', letterSpacing: -0.5, marginTop: 5 }]}>{sub.name}</Text>
                </View>
                <View style={{ height: 24, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,.14)', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={[type(10.5, 900), { color: '#fff', textTransform: 'uppercase', letterSpacing: 0.4 }]}>Reserved</Text>
                </View>
              </View>
              <Text style={[type(13, 600), { color: 'rgba(255,255,255,.65)', marginTop: 3 }]}>{sub.cook ? 'by ' + COOKS[sub.cook].name : 'Built by you'} · {money(sub.price)}/{sub.per} when live</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 15, paddingVertical: 11, paddingHorizontal: 13, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.09)' }}>
                <Icon name="bolt" size={17} color={c.primary} />
                <Text style={[type(13, 700), { color: '#fff', flex: 1 }]}>Launching soon — you’ll get {sub.day} boxes when it goes live near you.</Text>
              </View>
            </View>

            <SectionHeader title="In your box" />
            <MList>
              {sub.items.map((it, i) => (
                <MRow key={i} icon="chefhat" title={it} last={i === sub.items.length - 1} right={
                  swapping ? (
                    <Press scale={0.95} onPress={() => {
                      const alt = MEALS.find((m) => !sub.items.includes(m.name));
                      if (alt) { updateSub({ items: sub.items.map((x, xi) => (xi === i ? alt.name : x)) }); toast(`Swapped for ${alt.name}`, 'check', true); }
                      setSwapping(false);
                    }}>
                      <View style={{ height: 32, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={[type(13, 800), { color: c.soft }]}>Swap</Text>
                      </View>
                    </Press>
                  ) : undefined
                } />
              ))}
            </MList>

            <SectionHeader title="Your preferences" />
            <MList>
              <MRow icon="repeat" title="Swap a meal" sub={swapping ? 'Tap “Swap” next to a meal above' : 'Trade any meal in your box'}
                onPress={() => setSwapping((s) => !s)}
                right={<Icon name="chevRight" size={17} color={c.muted} />} />
              <View style={{ padding: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="truck" size={17} color={c.ink2} />
                  </View>
                  <Text style={[type(14.5, 700), { color: c.ink, flex: 1 }]}>Preferred delivery day</Text>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>
                  {PLAN_DAYS.map((d) => <DayChip key={d} label={d} on={sub.day === d} onPress={() => { updateSub({ day: d }); toast('We’ll aim for ' + d, 'check', true); }} />)}
                </View>
                <View style={{ height: 1, backgroundColor: c.border2, marginTop: 14, marginHorizontal: -14 }} />
              </View>
              <MRow icon="x" iconColor={c.red} title="Cancel reservation" titleColor={c.red} last onPress={() => { cancelSub(); toast('Reservation cancelled', 'x'); }} />
            </MList>

            <SectionHeader title="More plans near you" />
          </>
        ) : (
          <>
            <View style={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 4 }}>
              <Text style={[type(24, 900), { color: c.ink, letterSpacing: -0.8 }]}>Dinner, handled</Text>
              <Text style={[type(14, 600), { color: c.soft, marginTop: 6, lineHeight: 21 }]}>Reserve a weekly box from a local cook you love — launching soon. Founding members get 10% off their first month.</Text>
            </View>
            <SectionHeader title="Plans from cooks near you" />
          </>
        )}

        {MARKET_PLANS.map((p) => {
          const cook = COOKS[p.cook];
          return (
            <Press key={p.id} scale={0.985} onPress={() => router.push(`/plan/${p.id}`)} style={{ marginHorizontal: 16, marginBottom: 12 }}>
              <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: radius.xl, overflow: 'hidden', ...shadow.card }}>
                <GradBox grad={p.grad} style={{ height: 6 }} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, paddingHorizontal: 16 }}>
                  <Avatar cook={p.cook} size={42} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={[type(15.5, 900), { color: c.ink, letterSpacing: -0.3 }]}>{p.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                      <Text style={[type(12.5, 600), { color: c.soft }]}>{cook.name} · {p.meals} meal{p.meals !== 1 ? 's' : ''}/wk · </Text>
                      <Icon name="star" size={11} color={c.star} />
                      <Text style={[type(12.5, 600), { color: c.soft }]}>{cook.rating}</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 7 }}>
                    <GoalBadge goal={p.goal} />
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[type(18, 900), { color: c.ink, letterSpacing: -0.5 }]}>{money(p.price)}</Text>
                      <Text style={[type(10.5, 700), { color: c.muted }]}>/{p.per}</Text>
                    </View>
                  </View>
                </View>
              </View>
            </Press>
          );
        })}

        <Press scale={0.97} onPress={() => router.push('/build-plan')} style={{ alignSelf: 'center', marginTop: 6 }}>
          <Text style={[type(13.5, 700), { color: c.soft }]}>Prefer to pick your own meals? <Text style={{ color: c.primary }}>Build your own plan →</Text></Text>
        </Press>
      </ScrollView>
    </Screen>
  );
}

function MList({ children }: { children: React.ReactNode }) {
  const c = useC();
  return <View style={{ marginHorizontal: 16, borderRadius: radius.card, overflow: 'hidden', borderWidth: 1, borderColor: c.border2 }}>{children}</View>;
}

function MRow({ icon, iconColor, title, titleColor, sub, right, onPress, last }: { icon: string; iconColor?: string; title: string; titleColor?: string; sub?: string; right?: React.ReactNode; onPress?: () => void; last?: boolean }) {
  const c = useC();
  const inner = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13, padding: 14, backgroundColor: c.surface, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.border2 }}>
      <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={17} color={iconColor ?? c.ink2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[type(14.5, 700), { color: titleColor ?? c.ink }]}>{title}</Text>
        {sub ? <Text style={[type(12, 600), { color: c.soft, marginTop: 1 }]}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
  if (!onPress) return inner;
  return <Press scale={1} onPress={onPress}>{inner}</Press>;
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
