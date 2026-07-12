import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, GradAvatar } from '../../src/ui';
import { Screen, TopBar } from '../../src/ui/layout';
import { money } from '../../src/data/data';
import { KSec, KBtn } from '../(tabs)/my-hub';
import { fetchPrepRollup, fetchCookSubscribers, type PrepDay, type CookSubscriber, type Lifecycle } from '../../src/lib/subscriptions';

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDay(iso: string): string { const d = new Date(iso + 'T00:00:00'); return `${WD[d.getDay()]} ${MO[d.getMonth()]} ${d.getDate()}`; }

function lifeChip(c: any, l: Lifecycle): { label: string; bg: string; fg: string } {
  if (l === 'active') return { label: 'Active', bg: c.greenL, fg: c.green };
  if (l === 'paused') return { label: 'Paused', bg: c.bg2, fg: c.muted };
  if (l === 'payment_failed' || l === 'suspended') return { label: 'Payment issue', bg: c.redL, fg: c.red };
  if (l === 'cancellation_scheduled') return { label: 'Ending', bg: c.bg2, fg: c.muted };
  return { label: l, bg: c.bg2, fg: c.soft };
}

export default function SubscribersScreen() {
  const c = useC();
  const router = useRouter();
  const { toast } = useStore();
  const [prep, setPrep] = useState<PrepDay[]>([]);
  const [subs, setSubs] = useState<CookSubscriber[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, s] = await Promise.all([fetchPrepRollup(), fetchCookSubscribers()]);
    setPrep(p); setSubs(s); setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const active = subs.filter((s) => s.lifecycle === 'active');
  const mrrCents = active.reduce((n, s) => n + s.priceCents, 0);
  const totalPortions = prep.reduce((n, d) => n + d.meals.reduce((m, x) => m + x.portions, 0), 0);

  return (
    <Screen>
      <TopBar title="Subscribers" sub={loading ? '' : `${active.length} active`} onBack={() => router.back()} />
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.primary} /></View>
      ) : subs.length === 0 && prep.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 56, paddingHorizontal: 24 }}>
          <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: c.primaryL, alignItems: 'center', justifyContent: 'center' }}><Icon name="repeat" size={26} color={c.primary} /></View>
          <Text style={[type(16, 900), { color: c.ink, marginTop: 12 }]}>No subscribers yet</Text>
          <Text style={[type(13, 600), { color: c.soft, textAlign: 'center', marginTop: 6, maxWidth: 300, lineHeight: 19 }]}>Publish a meal plan and customers can subscribe. Their weekly prep and billing show up here automatically.</Text>
          <View style={{ marginTop: 16, alignSelf: 'stretch', paddingHorizontal: 16 }}><KBtn label="Create a meal plan" variant="pri" block icon="plus" onPress={() => router.push('/hub/create-plan')} /></View>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}>
          {/* MRR + portions summary */}
          <View style={{ flexDirection: 'row', gap: 12, marginHorizontal: 20 }}>
            <Stat c={c} ico="wallet" label="Weekly recurring" value={money(mrrCents / 100)} tint={c.green} />
            <Stat c={c} ico="box" label="Meals this week" value={String(totalPortions)} tint={c.primary} />
          </View>

          {/* This week's prep — what must I cook */}
          <KSec title="What to cook" />
          {prep.length === 0 ? (
            <Text style={[type(13, 600), { color: c.soft, marginHorizontal: 20 }]}>No prep due yet — subscribers’ upcoming weeks will appear here as they lock in.</Text>
          ) : prep.map((d) => (
            <View key={d.deliveryDate} style={{ marginHorizontal: 20, marginBottom: 12, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 18, overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, paddingVertical: 11, backgroundColor: c.bg2 }}>
                <Text style={[type(13.5, 900), { color: c.ink }]}>{fmtDay(d.deliveryDate)}</Text>
                <Text style={[type(12, 700), { color: c.soft }]}>{d.meals.reduce((n, m) => n + m.portions, 0)} portions</Text>
              </View>
              {d.meals.map((m) => (
                <View key={m.mealId} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, paddingVertical: 11, borderTopWidth: 1, borderTopColor: c.border2 }}>
                  <Text numberOfLines={1} style={[type(14, 700), { color: c.ink2, flex: 1 }]}>{m.name}</Text>
                  <Text style={[type(14, 900), { color: c.ink, letterSpacing: -0.3 }]}>×{m.portions}</Text>
                </View>
              ))}
              {d.allergens.length > 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 15, paddingVertical: 11, borderTopWidth: 1, borderTopColor: c.border2, backgroundColor: c.redL }}>
                  <Icon name="info" size={14} color={c.red} />
                  <Text style={[type(12, 700), { color: c.red, flex: 1, lineHeight: 17 }]}>Allergies (customer-provided): {d.allergens.join(', ')}</Text>
                </View>
              ) : null}
            </View>
          ))}

          {/* Roster */}
          <KSec title="Subscribers" />
          <View style={{ marginHorizontal: 20, borderWidth: 1, borderColor: c.border2, borderRadius: 18, overflow: 'hidden' }}>
            {subs.length === 0 ? (
              <Text style={[type(13, 600), { color: c.soft, padding: 15 }]}>No plan subscribers yet.</Text>
            ) : subs.map((s, i) => {
              const ch = lifeChip(c, s.lifecycle);
              return (
                <View key={s.subscriptionId} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, backgroundColor: c.surface, borderBottomWidth: i === subs.length - 1 ? 0 : 1, borderBottomColor: c.border2 }}>
                  <GradAvatar grad="g2" letter={(s.customerName[0] ?? '?').toUpperCase()} size={40} rad={13} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[type(14.5, 800), { color: c.ink, letterSpacing: -0.2 }]}>{s.customerName}</Text>
                    <Text numberOfLines={1} style={[type(12.5, 600), { color: c.soft, marginTop: 2 }]}>{s.planName} · {money(s.priceCents / 100)}/wk{s.preferredDay ? ` · ${s.preferredDay}` : ''}</Text>
                  </View>
                  <Text style={[type(11.5, 800), { color: ch.fg, backgroundColor: ch.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' }]}>{ch.label}</Text>
                </View>
              );
            })}
          </View>
          <View style={{ paddingHorizontal: 20, paddingTop: 14 }}>
            <KBtn label="Message all subscribers" variant="ghost" block icon="mega" onPress={() => toast('Messaging subscribers is coming soon', 'mega')} />
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}

function Stat({ c, ico, label, value, tint }: { c: any; ico: string; label: string; value: string; tint: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 16, padding: 14 }}>
      <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center' }}><Icon name={ico} size={15} color={tint} /></View>
      <Text style={[type(20, 900), { color: c.ink, letterSpacing: -0.6, marginTop: 9 }]}>{value}</Text>
      <Text style={[type(11.5, 700), { color: c.muted, marginTop: 1 }]}>{label}</Text>
    </View>
  );
}
