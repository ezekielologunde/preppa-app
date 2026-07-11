import React, { useState } from 'react';
import { View, Text, ScrollView, LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Redirect } from 'expo-router';
import { FLAGS } from '../../src/config/flags';
import { SERVICES, EXPERIENCES, Service, ServiceRequest, svcById, COOKS, CookId } from '../../src/data/data';
import { useC } from '../../src/theme/ThemeContext';
import { Palette, type, radius, shadow } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press, GradBox } from '../../src/ui';
import { ExpRail, SectionHeader, useColumns, CookRail } from '../../src/components/cards';

/** Tinted service-card palette per Service.cls (exp.css .xsvc t-* + .ico gradients). */
function svcTint(c: Palette): Record<string, { bg: string; g: [string, string] }> {
  return {
    amber: { bg: c.primaryL, g: ['#FF8A4C', c.primary] },
    purple: { bg: c.purpleL, g: ['#A855F7', c.purple] },
    green: { bg: c.greenL, g: ['#34D399', c.green] },
    blue: { bg: c.blueL, g: ['#38BDF8', c.blue] },
    red: { bg: c.pinkL, g: ['#FB7185', c.pink] },
  };
}

export function ReqStatusChip({ r }: { r: ServiceRequest }) {
  const c = useC();
  if (r.status === 'booked') {
    return (
      <View style={[chip, { backgroundColor: c.greenL }]}>
        <Icon name="check" size={11} color={c.green} />
        <Text style={[type(10.5, 900), { color: c.green, textTransform: 'uppercase', letterSpacing: 0.4 }]}>Booked</Text>
      </View>
    );
  }
  if (r.status === 'quoted') {
    return (
      <View style={[chip, { backgroundColor: c.primaryL }]}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.primary }} />
        <Text style={[type(10.5, 900), { color: c.primary, textTransform: 'uppercase', letterSpacing: 0.4 }]}>{r.quotes.length} quote{r.quotes.length !== 1 ? 's' : ''}</Text>
      </View>
    );
  }
  return (
    <View style={[chip, { backgroundColor: c.bg2 }]}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.soft }} />
      <Text style={[type(10.5, 900), { color: c.soft, textTransform: 'uppercase', letterSpacing: 0.4 }]}>Finding cooks</Text>
    </View>
  );
}

const chip = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, height: 22, paddingHorizontal: 9, borderRadius: radius.pill };

/** Service tiles — 2 col on phone, 3 tablet, 4 desktop. Measures a padding-free
 *  inner row so `cardW` fills exactly and never over-wraps. */
// MVP service menu — the coherent "Book a cook" set. Grocery/errand/class are
// a different job (logistics / low-stakes) and stay off-menu until later.
const MVP_SVCS = ['cookhome', 'catering', 'bulk'];

function SvcGrid() {
  const [w, setW] = useState(0);
  const cols = useColumns(w);
  const gap = 12;
  const cardW = w > 0 ? (w - gap * (cols - 1)) / cols : 0;
  const svcs = SERVICES.filter((s) => MVP_SVCS.includes(s.id));
  return (
    <View style={{ paddingHorizontal: 16 }}>
      <View onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
        {w > 0 && svcs.map((s) => <SvcCard key={s.id} s={s} width={cardW} />)}
      </View>
    </View>
  );
}

function SvcCard({ s, width }: { s: Service; width?: number }) {
  const c = useC();
  const router = useRouter();
  const tint = svcTint(c)[s.cls] ?? svcTint(c).amber;
  return (
    <Press scale={0.97} onPress={() => router.push(`/request/${s.id}`)} style={{ width }}>
      <View style={{ backgroundColor: tint.bg, borderRadius: radius.xl, padding: 15, paddingTop: 16 }}>
        {s.premium ? (
          <Text style={[type(9.5, 900), { position: 'absolute', top: 12, right: 12, color: '#fff', backgroundColor: c.primary, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, overflow: 'hidden' }]}>Premium</Text>
        ) : null}
        <GradBox grad={tint.g} style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 12, ...shadow.soft }}>
          <Icon name={s.ico} size={21} color="#fff" />
        </GradBox>
        <Text style={[type(15, 900), { color: c.ink, letterSpacing: -0.3 }]}>{s.name}</Text>
        <Text style={[type(12, 600), { color: c.soft, marginTop: 4, lineHeight: 17 }]}>{s.sub}</Text>
      </View>
    </Press>
  );
}

function ReqCard({ r }: { r: ServiceRequest }) {
  const c = useC();
  const router = useRouter();
  const foot = r.status === 'booked' ? 'View booking' : r.status === 'quoted' ? 'Review quotes' : 'View request';
  return (
    <Press scale={0.985} onPress={() => router.push(`/quotes/${r.id}`)} style={{ marginHorizontal: 16, marginBottom: 10 }}>
      <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: radius.card, padding: 16, paddingVertical: 15, ...shadow.card }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <Text style={[type(11, 800), { color: c.soft, backgroundColor: c.bg2, textTransform: 'uppercase', letterSpacing: 0.3, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill, overflow: 'hidden' }]}>{svcById(r.svc)?.name}</Text>
          <ReqStatusChip r={r} />
        </View>
        <Text style={[type(15.5, 900), { color: c.ink, letterSpacing: -0.3, marginTop: 9 }]}>{r.title}</Text>
        <Text style={[type(12.5, 600), { color: c.soft, marginTop: 3 }]}>{r.when} · {r.budget}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 11 }}>
          <Text style={[type(12.5, 800), { color: c.primary }]}>{foot}</Text>
          <Icon name="chevRight" size={15} color={c.primary} />
        </View>
      </View>
    </Press>
  );
}

export default function ExperiencesScreen() {
  const c = useC();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { requests, notifCount } = useStore();

  // Not live in v1 — hidden from both navs. Guard the route too so a stale-cached
  // direct URL can't render it (mirrors the My Hub redirect pattern).
  if (!FLAGS.experiences) return <Redirect href="/(tabs)/home" />;

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
        <Text style={[type(14, 500), { color: c.soft, marginTop: 10, lineHeight: 20 }]}>Your local cooks, beyond dinner. Tell them what you need, get fixed quotes back, pick your Preppa.</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40, maxWidth: 1040, alignSelf: 'center', width: '100%' }}>
        <Press scale={0.98} onPress={() => router.push('/plans')} style={{ marginHorizontal: 16, marginTop: 16 }} label="Weekly meal plans">
          <GradBox grad={['#A855F7', c.purple]} style={{ borderRadius: radius.xl, padding: 18, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ width: 52, height: 52, borderRadius: 15, backgroundColor: 'rgba(255,255,255,.18)', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="repeat" size={26} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[type(18, 900), { color: '#fff', letterSpacing: -0.4 }]}>Weekly meal plans</Text>
                <Text style={[type(12.5, 600), { color: 'rgba(255,255,255,.82)', marginTop: 3, lineHeight: 17 }]}>Subscribe to a cook’s box — or build your own from several cooks.</Text>
              </View>
              <Icon name="chevRight" size={20} color="#fff" />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, alignSelf: 'flex-start', height: 26, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,.92)' }}>
              <Icon name="bolt" size={13} color={c.purple} />
              <Text style={[type(11.5, 900), { color: c.purple, textTransform: 'uppercase', letterSpacing: 0.3 }]}>Reserve · launching soon</Text>
            </View>
          </GradBox>
        </Press>

        {requests.length > 0 ? (
          <>
            <SectionHeader title="Your requests" />
            {requests.map((r) => <ReqCard key={r.id} r={r} />)}
          </>
        ) : null}

        <SectionHeader title="Book a cook" />
        <SvcGrid />

        <SectionHeader title="Cooks near you" action="See all" onAction={() => router.push('/discover?mode=preppers')} />
        <CookRail cooks={Object.keys(COOKS) as CookId[]} />

        <SectionHeader title="Classes & supper clubs" />
        <ExpRail exps={EXPERIENCES} />
      </ScrollView>
    </View>
  );
}
