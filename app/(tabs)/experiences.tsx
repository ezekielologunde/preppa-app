import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { Palette, type, radius, shadow } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press, GradBox } from '../../src/ui';
import { SectionHeader, useColumns } from '../../src/components/cards';
import { money } from '../../src/data/data';
import { listMyRequests, SERVICE_LABELS, type RequestView, type ServiceCategory } from '../../src/lib/services';
import { listMySubscriptions, customerWeeklyCents, type MySubscription } from '../../src/lib/subscriptions';

const money2 = (cents: number) => money(cents / 100);

/** Tinted card palette per key (mirrors the service-card look). */
function tints(c: Palette): Record<string, { bg: string; g: [string, string] }> {
  return {
    amber: { bg: c.primaryL, g: ['#FF8A4C', c.primary] },
    purple: { bg: c.purpleL, g: ['#A855F7', c.purple] },
    green: { bg: c.greenL, g: ['#34D399', c.green] },
    blue: { bg: c.blueL, g: ['#38BDF8', c.blue] },
    red: { bg: c.pinkL, g: ['#FB7185', c.pink] },
  };
}

// Real service categories (DB enum) → tile look. Order = the "book a cook" menu.
const CATS: { cat: ServiceCategory; ico: string; cls: string; sub: string }[] = [
  { cat: 'meal_plan', ico: 'repeat', cls: 'purple', sub: 'A cook designs your weekly plan' },
  { cat: 'cook_at_home', ico: 'chefhat', cls: 'amber', sub: 'A prepper cooks in your kitchen' },
  { cat: 'private_dinner', ico: 'utensils', cls: 'purple', sub: 'A hosted dinner for your table' },
  { cat: 'catering', ico: 'box', cls: 'blue', sub: 'Food for your event or party' },
  { cat: 'consultation', ico: 'chat', cls: 'green', sub: 'Plan your week with a pro' },
  { cat: 'class', ico: 'spark', cls: 'red', sub: 'Learn a dish, hands-on' },
];

const chip = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, height: 22, paddingHorizontal: 9, borderRadius: radius.pill };

function RequestStatusChip({ r }: { r: RequestView }) {
  const c = useC();
  const nq = r.quotes.length;
  if (r.status === 'accepted') {
    return <View style={[chip, { backgroundColor: c.greenL }]}><Icon name="check" size={11} color={c.green} /><Text style={[type(10.5, 900), { color: c.green, textTransform: 'uppercase', letterSpacing: 0.4 }]}>Booked</Text></View>;
  }
  if (r.status === 'cancelled' || r.status === 'expired') {
    return <View style={[chip, { backgroundColor: c.bg2 }]}><Text style={[type(10.5, 900), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.4 }]}>{r.status === 'expired' ? 'Expired' : 'Cancelled'}</Text></View>;
  }
  if (nq > 0) {
    return <View style={[chip, { backgroundColor: c.primaryL }]}><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.primary }} /><Text style={[type(10.5, 900), { color: c.primary, textTransform: 'uppercase', letterSpacing: 0.4 }]}>{nq} quote{nq !== 1 ? 's' : ''}</Text></View>;
  }
  return <View style={[chip, { backgroundColor: c.bg2 }]}><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.soft }} /><Text style={[type(10.5, 900), { color: c.soft, textTransform: 'uppercase', letterSpacing: 0.4 }]}>Finding cooks</Text></View>;
}

function RealReqCard({ r, onPress }: { r: RequestView; onPress: () => void }) {
  const c = useC();
  const foot = r.status === 'accepted' ? 'View booking' : r.quotes.length > 0 ? 'Review quotes' : 'View request';
  return (
    <Press scale={0.985} onPress={onPress} style={{ marginHorizontal: 16, marginBottom: 10 }}>
      <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: radius.card, padding: 16, paddingVertical: 15, ...shadow.card }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <Text style={[type(11, 800), { color: c.soft, backgroundColor: c.bg2, textTransform: 'uppercase', letterSpacing: 0.3, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill, overflow: 'hidden' }]}>{SERVICE_LABELS[r.category] ?? r.category}</Text>
          <RequestStatusChip r={r} />
        </View>
        <Text style={[type(15.5, 900), { color: c.ink, letterSpacing: -0.3, marginTop: 9 }]}>{SERVICE_LABELS[r.category] ?? 'Request'}</Text>
        <Text style={[type(12.5, 600), { color: c.soft, marginTop: 3 }]}>
          {r.eventDate}{r.guests ? ` · ${r.guests} guests` : ''}{r.budgetCents ? ` · ${money2(r.budgetCents)} budget` : ''}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 11 }}>
          <Text style={[type(12.5, 800), { color: c.primary }]}>{foot}</Text>
          <Icon name="chevRight" size={15} color={c.primary} />
        </View>
      </View>
    </Press>
  );
}

function NeedGrid() {
  const c = useC();
  const router = useRouter();
  const [w, setW] = useState(0);
  const cols = useColumns(w);
  const gap = 12;
  const cardW = w > 0 ? (w - gap * (cols - 1)) / cols : 0;
  const t = tints(c);
  return (
    <View style={{ paddingHorizontal: 16 }}>
      <View onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
        {w > 0 && CATS.map((s) => {
          const tint = t[s.cls] ?? t.amber;
          return (
            <Press key={s.cat} scale={0.97} onPress={() => router.push(`/service-request?category=${s.cat}`)} style={{ width: cardW }}>
              <View style={{ backgroundColor: tint.bg, borderRadius: radius.xl, padding: 15, paddingTop: 16 }}>
                <GradBox grad={tint.g} style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 12, ...shadow.soft }}>
                  <Icon name={s.ico} size={21} color="#fff" />
                </GradBox>
                <Text style={[type(15, 900), { color: c.ink, letterSpacing: -0.3 }]}>{SERVICE_LABELS[s.cat]}</Text>
                <Text style={[type(12, 600), { color: c.soft, marginTop: 4, lineHeight: 17 }]}>{s.sub}</Text>
              </View>
            </Press>
          );
        })}
      </View>
    </View>
  );
}

export default function ExperiencesScreen() {
  const c = useC();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { notifCount } = useStore();
  const [reqs, setReqs] = useState<RequestView[]>([]);
  const [subs, setSubs] = useState<MySubscription[]>([]);

  useFocusEffect(useCallback(() => {
    let alive = true;
    Promise.all([listMyRequests(), listMySubscriptions()]).then(([r, s]) => {
      if (!alive) return;
      setReqs(r); setSubs(s);
    });
    return () => { alive = false; };
  }, []));

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ backgroundColor: c.surface, paddingTop: insets.top + 10, paddingBottom: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: c.border2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={[type(28, 900), { color: c.ink, letterSpacing: -1 }]}>Experiences</Text>
          <Press scale={0.9} onPress={() => router.push('/notifications')}>
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="bell" size={19} color={c.ink2} />
              {notifCount > 0 ? <View style={{ position: 'absolute', top: 9, right: 10, width: 9, height: 9, borderRadius: 5, backgroundColor: c.primary, borderWidth: 2, borderColor: c.bg2 }} /> : null}
            </View>
          </Press>
        </View>
        <Text style={[type(14, 500), { color: c.soft, marginTop: 10, lineHeight: 20 }]}>Tell your local cooks what you need — a cook for the night, a weekly plan, or a hand in the kitchen. Get fixed quotes back and pick your Preppa.</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40, maxWidth: 1040, alignSelf: 'center', width: '100%' }}>
        {/* Weekly meal plans — the recurring relationship layer */}
        <Press scale={0.98} onPress={() => router.push('/plans')} style={{ marginHorizontal: 16, marginTop: 16 }} label="Weekly meal plans">
          <GradBox grad={['#A855F7', c.purple]} style={{ borderRadius: radius.xl, padding: 18, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ width: 52, height: 52, borderRadius: 15, backgroundColor: 'rgba(255,255,255,.18)', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="repeat" size={26} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[type(18, 900), { color: '#fff', letterSpacing: -0.4 }]}>Weekly meal plans</Text>
                <Text style={[type(12.5, 600), { color: 'rgba(255,255,255,.82)', marginTop: 3, lineHeight: 17 }]}>Subscribe to a cook’s box — cooked fresh, on repeat. Choose your meals, skip a week, cancel anytime.</Text>
              </View>
              <Icon name="chevRight" size={20} color="#fff" />
            </View>
          </GradBox>
        </Press>

        {/* Build your own cross-cook box */}
        <Press scale={0.98} onPress={() => router.push('/build-plan')} style={{ marginHorizontal: 16, marginTop: 12 }} label="Build your own box">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: radius.xl, padding: 16, ...shadow.card }}>
            <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: c.primaryL, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="plus" size={22} color={c.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type(15.5, 900), { color: c.ink, letterSpacing: -0.3 }]}>Build your own box</Text>
              <Text style={[type(12.5, 600), { color: c.soft, marginTop: 2, lineHeight: 17 }]}>Pick any meals across cooks — 10% off every box</Text>
            </View>
            <Icon name="chevRight" size={18} color={c.muted} />
          </View>
        </Press>

        {/* Your plans (real subscriptions) */}
        {subs.length > 0 ? (
          <>
            <SectionHeader title="Your plans" action="Manage" onAction={() => router.push('/plans')} />
            <View style={{ paddingHorizontal: 16, gap: 10 }}>
              {subs.slice(0, 3).map((s) => (
                <Press key={s.id} scale={0.99} onPress={() => router.push('/plans')}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: radius.card, padding: 14 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.primaryL, alignItems: 'center', justifyContent: 'center' }}><Icon name="repeat" size={19} color={c.primary} /></View>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={[type(14.5, 900), { color: c.ink }]}>{s.planName}</Text>
                      <Text numberOfLines={1} style={[type(12, 600), { color: c.soft, marginTop: 2 }]}>{s.kitchenName} · {money2(s.nextCycle && s.nextCycle.totalCents > 0 ? s.nextCycle.totalCents : customerWeeklyCents(s.priceCents))}/wk</Text>
                    </View>
                    <Icon name="chevRight" size={16} color={c.muted} />
                  </View>
                </Press>
              ))}
            </View>
          </>
        ) : null}

        {/* Your requests (real service requests) */}
        {reqs.length > 0 ? (
          <>
            <SectionHeader title="Your requests" />
            {reqs.map((r) => <RealReqCard key={r.id} r={r} onPress={() => router.push(`/request/${r.id}`)} />)}
          </>
        ) : null}

        {/* What do you need? — real service categories */}
        <SectionHeader title="What do you need?" />
        <NeedGrid />
      </ScrollView>
    </View>
  );
}
