import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius, shadow } from '../../src/theme/theme';
import { Icon, GradBox, Press } from '../../src/ui';
import { Screen, TopBar } from '../../src/ui/layout';
import { money } from '../../src/data/data';
import { KSec, KBtn } from '../(tabs)/my-hub';
import { fetchMyExperiences, type Experience } from '../../src/lib/experiences';

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function nextSessionLabel(e: Experience): string {
  const now = Date.now();
  const up = e.sessions.filter((s) => s.status === 'open' && new Date(s.startsAt).getTime() > now).sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt))[0];
  if (!up) return 'No upcoming sessions';
  const d = new Date(up.startsAt);
  const left = Math.max(0, up.capacity - up.seatsTaken);
  return `${WD[d.getDay()]} ${MO[d.getMonth()]} ${d.getDate()} · ${left} seat${left !== 1 ? 's' : ''} left`;
}
const STATUS: Record<string, { label: string; fg: (c: any) => string; bg: (c: any) => string }> = {
  draft: { label: 'Draft', fg: (c) => c.soft, bg: (c) => c.bg2 },
  pending: { label: 'In review', fg: (c) => c.primary, bg: (c) => c.primaryL },
  published: { label: 'Live', fg: (c) => c.green, bg: (c) => c.greenL },
  paused: { label: 'Paused', fg: (c) => c.muted, bg: (c) => c.bg2 },
  archived: { label: 'Archived', fg: (c) => c.muted, bg: (c) => c.bg2 },
};

export default function HubExperiences() {
  const c = useC();
  const router = useRouter();
  const [items, setItems] = useState<Experience[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => { setLoading(true); setItems(await fetchMyExperiences()); setLoading(false); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <Screen>
      <TopBar title="Experiences" sub={loading ? '' : `${items.length} listing${items.length !== 1 ? 's' : ''}`} onBack={() => router.back()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}>
        <View style={{ marginHorizontal: 20, backgroundColor: c.primaryL, borderRadius: 18, padding: 16, flexDirection: 'row', gap: 11, alignItems: 'flex-start' }}>
          <Icon name="spark" size={19} color={c.primary} />
          <Text style={[type(12.5, 600), { color: c.primaryD, lineHeight: 19, flex: 1 }]}>Host a cooking class, supper club, or private dinner. Customers book a session and pay in full — your payout lands in Earnings, net of the Stripe fee.</Text>
        </View>

        <KSec title="Your experiences" />
        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}><ActivityIndicator color={c.primary} /></View>
        ) : items.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 30, paddingHorizontal: 24 }}>
            <View style={{ width: 54, height: 54, borderRadius: 17, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center' }}><Icon name="spark" size={25} color={c.muted} /></View>
            <Text style={[type(16, 900), { color: c.ink, marginTop: 12 }]}>No experiences yet</Text>
            <Text style={[type(13, 600), { color: c.soft, textAlign: 'center', marginTop: 6, maxWidth: 280, lineHeight: 19 }]}>Publish a class or supper club with dated sessions customers can book.</Text>
          </View>
        ) : (
          items.map((e) => {
            const st = STATUS[e.status] ?? STATUS.draft;
            return (
              <Press key={e.id} scale={0.99} onPress={() => router.push(`/hub/create-experience?experienceId=${e.id}`)} style={{ marginHorizontal: 20, marginBottom: 14 }}>
                <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 20, padding: 16, ...shadow.card }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
                    <GradBox grad={['#FB7185', '#E11D48']} style={{ width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}><Icon name="spark" size={20} color="#fff" /></GradBox>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={[type(15, 900), { color: c.ink, letterSpacing: -0.2 }]}>{e.title}</Text>
                      <Text style={[type(12.5, 600), { color: c.soft, marginTop: 2 }]}>{nextSessionLabel(e)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      <Text style={[type(15, 900), { color: c.ink }]}>{money((e.perPersonCents ?? 0) / 100)}</Text>
                      <View style={{ height: 20, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: st.bg(c), alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={[type(10, 900), { color: st.fg(c), textTransform: 'uppercase', letterSpacing: 0.3 }]}>{st.label}</Text>
                      </View>
                    </View>
                    <Icon name="chevRight" size={16} color={c.muted} />
                  </View>
                </View>
              </Press>
            );
          })
        )}
        <View style={{ paddingHorizontal: 20, paddingTop: 2 }}>
          <KBtn label="New experience" variant="pri" block icon="plus" onPress={() => router.push('/hub/create-experience')} />
        </View>
      </ScrollView>
    </Screen>
  );
}
