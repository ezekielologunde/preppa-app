import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, GradAvatar } from '../../src/ui';
import { Screen, TopBar } from '../../src/ui/layout';
import { money } from '../../src/data/data';
import { MY_PLANS, SUBSCRIBERS, Subscriber } from '../../src/data/cook';
import { KSec, KBtn, well, Tone } from '../(tabs)/my-hub';

function BreakRow({ ic, tone, label, value, last }: { ic: string; tone: Tone; label: string; value: string; last?: boolean }) {
  const c = useC();
  const [bg, fg] = well(c, tone);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.border2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1, minWidth: 0 }}>
        <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={ic} size={15} color={fg} />
        </View>
        <Text numberOfLines={1} style={[type(13.5, 700), { color: c.soft, flex: 1 }]}>{label}</Text>
      </View>
      <Text numberOfLines={1} style={[type(15, 900), { color: c.ink, letterSpacing: -0.3, marginLeft: 12 }]}>{value}</Text>
    </View>
  );
}

function chip(c: any, s: Subscriber) {
  if (s.status === 'active') return { label: s.day, bg: c.greenL, fg: '#0f7a39' };
  if (s.status === 'paused') return { label: 'Paused', bg: c.bg2, fg: c.muted };
  return { label: 'Skipping', bg: c.purpleL, fg: c.purple };
}

export default function SubscribersScreen() {
  const c = useC();
  const router = useRouter();
  const { toast } = useStore();
  const mrr = MY_PLANS.reduce((s, p) => s + p.subs * p.price, 0);
  const active = MY_PLANS.reduce((s, p) => s + p.subs, 0);

  return (
    <Screen>
      <TopBar title="Subscribers" sub={`${active} active`} onBack={() => router.back()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}>
        <View style={{ marginHorizontal: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 20, padding: 16 }}>
          <Text style={[type(13, 900), { color: c.ink, marginBottom: 4 }]}>This week’s prep</Text>
          <BreakRow ic="box" tone="ic-amber" label="Thu · Weeknight Italian" value="24 boxes · 72 meals" />
          <BreakRow ic="utensils" tone="ic-purple" label="Sun · Family Sunday Tray" value="11 trays" />
          <BreakRow ic="wallet" tone="ic-green" label="Recurring · weekly" value={money(mrr)} last />
          <Text style={[type(12.5, 600), { color: c.primaryD, lineHeight: 20, marginTop: 12, padding: 13, backgroundColor: c.primaryL, borderRadius: 12 }]}>2 subscribers skipped next week — prep 22 boxes for Thursday, not 24.</Text>
        </View>

        <KSec title="Subscribers" />
        <View style={{ marginHorizontal: 20, borderWidth: 1, borderColor: c.border2, borderRadius: 18, overflow: 'hidden' }}>
          {SUBSCRIBERS.map((s, i) => {
            const ch = chip(c, s);
            return (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, backgroundColor: c.surface, borderBottomWidth: i === SUBSCRIBERS.length - 1 ? 0 : 1, borderBottomColor: c.border2 }}>
                <GradAvatar grad={s.grad} letter={s.name[0]} size={40} rad={13} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[type(14.5, 800), { color: c.ink, letterSpacing: -0.2 }]}>{s.name}</Text>
                  <Text numberOfLines={1} style={[type(12.5, 600), { color: c.soft, marginTop: 2 }]}>{s.plan} · since {s.since}</Text>
                </View>
                <Text style={[type(11.5, 800), { color: ch.fg, backgroundColor: ch.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' }]}>{ch.label}</Text>
              </View>
            );
          })}
        </View>
        <View style={{ paddingHorizontal: 20, paddingTop: 14 }}>
          <KBtn label="Message all subscribers" variant="ghost" block icon="mega" onPress={() => toast('Message all subscribers — demo', 'mega')} />
        </View>
      </ScrollView>
    </Screen>
  );
}
