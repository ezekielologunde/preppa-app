import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useC } from '../src/theme/ThemeContext';
import { type, radius, shadow } from '../src/theme/theme';
import { useStore } from '../src/store/store';
import { Icon, Btn, GradBox } from '../src/ui';
import { Screen, TopBar, Dock, DockTotal } from '../src/ui/layout';

type Tone = 'amber' | 'purple' | 'blue' | 'green';

export default function PrepPlus() {
  const c = useC();
  const router = useRouter();
  const { toast } = useStore();
  const [joined, setJoined] = useState(false);

  const benefits: { ico: string; tone: Tone; t: string; s: string }[] = [
    { ico: 'truck', tone: 'green', t: 'Free delivery on every order', s: 'No delivery fees, no minimums' },
    { ico: 'bolt', tone: 'amber', t: 'Early access to daily drops', s: 'Shop new menus before anyone else' },
    { ico: 'gift', tone: 'purple', t: 'Members-only cook boxes', s: 'Exclusive curated bundles' },
    { ico: 'shield', tone: 'blue', t: 'Priority support', s: 'Skip the line, get help faster' },
    { ico: 'trophy', tone: 'amber', t: '2× rewards points', s: 'Earn toward perks twice as fast' },
  ];

  if (joined) {
    return (
      <Screen>
        <TopBar title="PrepPlus" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: c.greenL, alignItems: 'center', justifyContent: 'center', ...shadow.soft }}>
            <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: c.green, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="check" size={32} color="#fff" />
            </View>
          </View>
          <Text style={[type(22, 900), { color: c.ink, letterSpacing: -0.5, marginTop: 22 }]}>Welcome to PrepPlus!</Text>
          <Text style={[type(14, 500), { color: c.soft, textAlign: 'center', maxWidth: 260, marginTop: 8, lineHeight: 21 }]}>Your 7-day free trial is active. Free delivery and members-only perks are unlocked.</Text>
          <View style={{ height: 26 }} />
          <Btn label="Done" variant="dark" onPress={() => router.back()} style={{ width: 200 }} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <TopBar title="PrepPlus" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
        {/* premium hero */}
        <GradBox grad={['#7C3AED', '#F26B1D']} style={{ margin: 16, borderRadius: radius.xl, padding: 22, overflow: 'hidden', ...shadow.hero }}>
          <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: 'rgba(255,255,255,.18)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="bolt" size={28} color="#fff" />
          </View>
          <Text style={[type(28, 900), { color: '#fff', letterSpacing: -0.8, marginTop: 16 }]}>PrepPlus</Text>
          <Text style={[type(14.5, 600), { color: 'rgba(255,255,255,.9)', marginTop: 6, lineHeight: 21 }]}>Free delivery. Early drops. Members-only boxes.</Text>
        </GradBox>

        {/* benefits */}
        <View style={{ backgroundColor: c.surface, borderRadius: radius.card, marginHorizontal: 16, marginTop: 14, padding: 16, borderWidth: 1, borderColor: c.border2 }}>
          <Text style={[type(12, 900), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }]}>What you get</Text>
          {benefits.map((b, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.border2 }}>
              <Well ico={b.ico} tone={b.tone} />
              <View style={{ flex: 1 }}>
                <Text style={[type(14.5, 800), { color: c.ink }]}>{b.t}</Text>
                <Text style={[type(12.5, 500), { color: c.soft, marginTop: 2 }]}>{b.s}</Text>
              </View>
              <Icon name="check" size={18} color={c.green} />
            </View>
          ))}
        </View>

        {/* pricing */}
        <View style={{ backgroundColor: c.surface, borderRadius: radius.card, marginHorizontal: 16, marginTop: 14, padding: 20, borderWidth: 1.5, borderColor: c.primary, alignItems: 'center', ...shadow.card }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            <Text style={[type(34, 900), { color: c.primary, letterSpacing: -1 }]}>$9.99</Text>
            <Text style={[type(15, 700), { color: c.soft }]}>/mo</Text>
          </View>
          <Text style={[type(13.5, 700), { color: c.ink, marginTop: 6 }]}>or $89/yr — <Text style={{ color: c.green, fontFamily: type(13.5, 900).fontFamily }}>save 26%</Text></Text>
          <Text style={[type(12, 500), { color: c.muted, marginTop: 8 }]}>Cancel anytime</Text>
        </View>
      </ScrollView>

      <Dock>
        <DockTotal label="Total" value="$9.99 / month" />
        <Btn label="Start free trial" flex={1} onPress={() => { setJoined(true); toast('7-day free trial started', 'bolt', true); }} />
      </Dock>
    </Screen>
  );
}

function Well({ ico, tone }: { ico: string; tone: Tone }) {
  const c = useC();
  const map: Record<Tone, [string, string]> = {
    amber: [c.primaryL, c.primary],
    purple: [c.purpleL, c.purple],
    blue: [c.blueL, c.blue],
    green: [c.greenL, c.green],
  };
  const [bg, fg] = map[tone];
  return (
    <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={ico} size={19} color={fg} />
    </View>
  );
}
