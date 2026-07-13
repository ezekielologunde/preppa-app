import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Image, LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { Palette, type, radius, shadow } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press, GradBox } from '../../src/ui';
import { SectionHeader, useColumns } from '../../src/components/cards';
import { ModeTabs } from '../../src/components/ModeTabs';
import { BrowsePlansSection, MyPlansSection, money2 } from '../../src/components/plans';
import { listMyRequests, SERVICE_LABELS, type RequestView, type ServiceCategory } from '../../src/lib/services';
import { fetchExperiences, type Experience } from '../../src/lib/experiences';

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ETYPE_LABEL: Record<string, string> = { class: 'Class', supper_club: 'Supper club', tasting: 'Tasting', workshop: 'Workshop' };
function nextSession(e: Experience): string {
  const up = e.sessions.filter((s) => s.status === 'open' && new Date(s.startsAt).getTime() > Date.now()).sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt))[0];
  if (!up) return 'New dates soon';
  const d = new Date(up.startsAt);
  return `${WD[d.getDay()]} ${MO[d.getMonth()]} ${d.getDate()}`;
}

function ExperienceCard({ e, onPress }: { e: Experience; onPress: () => void }) {
  const c = useC();
  return (
    <Press scale={0.985} onPress={onPress} style={{ marginHorizontal: 16, marginBottom: 12 }}>
      <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: radius.xl, overflow: 'hidden', ...shadow.card }}>
        <GradBox grad={['#FB7185', '#E11D48']} img={e.coverUrl ?? undefined} style={{ height: 130 }}>
          <View style={{ position: 'absolute', top: 12, left: 12, height: 22, paddingHorizontal: 9, borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,.45)', flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[type(10.5, 900), { color: '#fff', textTransform: 'uppercase', letterSpacing: 0.3 }]}>{ETYPE_LABEL[e.experienceType] ?? 'Experience'}</Text>
          </View>
        </GradBox>
        <View style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[type(15.5, 900), { color: c.ink, letterSpacing: -0.3 }]}>{e.title}</Text>
            <Text numberOfLines={1} style={[type(12.5, 600), { color: c.soft, marginTop: 3 }]}>{e.kitchenName} · {nextSession(e)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[type(16, 900), { color: c.ink, letterSpacing: -0.4 }]}>{money2(e.perPersonCents ?? 0)}</Text>
            <Text style={[type(10.5, 700), { color: c.muted }]}>/person</Text>
          </View>
        </View>
      </View>
    </Press>
  );
}

type Tab = 'plans' | 'experiences' | 'mine';
const TABS: { key: Tab; label: string }[] = [
  { key: 'plans', label: 'Meal Plans' },
  { key: 'experiences', label: 'Experiences' },
  { key: 'mine', label: 'My Plans' },
];

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

/** The "Experiences" tab body — browse bookable experiences, then request something custom. */
function ExperiencesBody() {
  const c = useC();
  const router = useRouter();
  const [exps, setExps] = useState<Experience[]>([]);
  const [reqs, setReqs] = useState<RequestView[]>([]);
  const [loading, setLoading] = useState(true);
  useFocusEffect(useCallback(() => {
    let alive = true;
    Promise.all([fetchExperiences(), listMyRequests()]).then(([e, r]) => { if (!alive) return; setExps(e); setReqs(r); setLoading(false); });
    return () => { alive = false; };
  }, []));
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40, maxWidth: 1040, alignSelf: 'center', width: '100%' }}>
      {loading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}><ActivityIndicator color={c.primary} /></View>
      ) : exps.length > 0 ? (
        <>
          <SectionHeader title="Book an experience" />
          {exps.map((e) => <ExperienceCard key={e.id} e={e} onPress={() => router.push(`/experience/${e.id}`)} />)}
        </>
      ) : null}

      <SectionHeader title={exps.length > 0 ? 'Or request something custom' : 'What do you need?'} />
      <NeedGrid />

      {reqs.length > 0 ? (
        <>
          <SectionHeader title="Your requests" />
          {reqs.map((r) => <RealReqCard key={r.id} r={r} onPress={() => router.push(`/request/${r.id}`)} />)}
        </>
      ) : null}
    </ScrollView>
  );
}

const isTab = (v: unknown): v is Tab => v === 'plans' || v === 'experiences' || v === 'mine';

export default function ExperiencesScreen() {
  const c = useC();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { notifCount } = useStore();
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(isTab(tabParam) ? tabParam : 'plans');

  // honor a changing ?tab= (e.g. the /plans redirect, or post-subscribe return to My Plans)
  useEffect(() => { if (isTab(tabParam)) setTab(tabParam); }, [tabParam]);

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
        <Text style={[type(14, 500), { color: c.soft, marginTop: 10, lineHeight: 20 }]}>Subscribe to a weekly meal plan, manage your subscriptions, or book a local cook for a night, an event, or a hand in the kitchen.</Text>
        <View style={{ marginTop: 14, maxWidth: 460 }}>
          <ModeTabs modes={TABS} value={tab} onChange={setTab} />
        </View>
      </View>

      {tab === 'plans' ? <BrowsePlansSection />
        : tab === 'experiences' ? <ExperiencesBody />
        : <MyPlansSection onBrowse={() => setTab('plans')} />}
    </View>
  );
}
