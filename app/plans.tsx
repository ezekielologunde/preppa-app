import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useC } from '../src/theme/ThemeContext';
import { type, radius, shadow } from '../src/theme/theme';
import { useStore } from '../src/store/store';
import { Icon, Press } from '../src/ui';
import { money } from '../src/data/data';
import {
  fetchActivePlans, listMySubscriptions, pauseSubscription, resumeSubscription, cancelSubscription,
  type Plan, type MySubscription,
} from '../src/lib/subscriptions';

// What the customer is billed weekly = cook price + 10% service fee.
const weekly = (cents: number) => money((cents + Math.round(cents * 0.1)) / 100);

export default function PlansTab() {
  const c = useC();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { toast } = useStore();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subs, setSubs] = useState<MySubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, s] = await Promise.all([fetchActivePlans(), listMySubscriptions()]);
    setPlans(p);
    setSubs(s);
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const act = async (sub: MySubscription, action: 'pause' | 'resume' | 'cancel') => {
    if (busy) return;
    setBusy(sub.id);
    try {
      if (action === 'pause') { await pauseSubscription(sub.id); toast('Plan paused', 'check', true); }
      else if (action === 'resume') { await resumeSubscription(sub.id); toast('Plan resumed', 'check', true); }
      else { await cancelSubscription(sub.id); toast('Plan canceled', 'x'); }
      await load();
    } catch (e: any) {
      toast(e?.message || 'Could not update your plan', 'info');
    } finally { setBusy(null); }
  };

  // Don't list a plan the customer already subscribes to.
  const subscribedNames = new Set(subs.map((s) => s.planName));
  const available = plans.filter((p) => !subscribedNames.has(p.name));

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ backgroundColor: c.surface, paddingTop: insets.top + 10, paddingBottom: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: c.border2 }}>
        <Text style={[type(28, 900), { color: c.ink, letterSpacing: -1 }]}>Meal plans</Text>
        <Text style={[type(14, 500), { color: c.soft, marginTop: 8, lineHeight: 20 }]}>A weekly box from a local cook you love — cooked fresh, delivered on repeat. Pause or cancel anytime.</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40, maxWidth: 760, alignSelf: 'center', width: '100%' }}>
        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: 'center' }}><ActivityIndicator color={c.primary} /></View>
        ) : (
          <>
            {subs.length > 0 ? (
              <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 12 }}>
                <Text style={[type(12, 800), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5 }]}>Your plans</Text>
                {subs.map((s) => (
                  <SubCard key={s.id} s={s} busy={busy === s.id} onAct={(a) => act(s, a)} />
                ))}
              </View>
            ) : null}

            <View style={{ paddingHorizontal: 16, paddingTop: 18 }}>
              <Text style={[type(12, 800), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }]}>
                {subs.length > 0 ? 'More plans near you' : 'Plans from cooks near you'}
              </Text>
              {available.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 }}>
                  <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: c.primaryL, alignItems: 'center', justifyContent: 'center' }}><Icon name="repeat" size={26} color={c.primary} /></View>
                  <Text style={[type(16, 900), { color: c.ink, marginTop: 14 }]}>No plans near you yet</Text>
                  <Text style={[type(13.5, 600), { color: c.soft, textAlign: 'center', marginTop: 6, maxWidth: 300, lineHeight: 20 }]}>Cooks are adding weekly boxes. Check back soon — or order a meal now on Home.</Text>
                </View>
              ) : (
                available.map((p) => <PlanCard key={p.id} p={p} onPress={() => router.push(`/plan/${p.id}`)} />)
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function SubCard({ s, busy, onAct }: { s: MySubscription; busy: boolean; onAct: (a: 'pause' | 'resume' | 'cancel') => void }) {
  const c = useC();
  const paused = s.status === 'paused';
  const pastDue = s.status === 'past_due';
  const tint = pastDue ? c.red : paused ? c.muted : c.green;
  const statusLbl = pastDue ? 'Payment due' : paused ? 'Paused' : 'Active';
  return (
    <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: radius.xl, padding: 16, ...shadow.card }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={[type(16.5, 900), { color: c.ink, letterSpacing: -0.3 }]}>{s.planName}</Text>
          <Text style={[type(12.5, 600), { color: c.soft, marginTop: 3 }]}>{s.kitchenName} · {weekly(s.priceCents)}/wk{s.preferredDay ? ` · ${s.preferredDay}` : ''}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 24, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: c.bg2 }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: tint }} />
          <Text style={[type(11, 900), { color: tint, textTransform: 'uppercase', letterSpacing: 0.3 }]}>{statusLbl}</Text>
        </View>
      </View>
      {s.items.length > 0 ? (
        <Text numberOfLines={1} style={[type(12.5, 600), { color: c.ink2, marginTop: 10 }]}>
          {s.items.map((i) => (i.qty > 1 ? `${i.name} ×${i.qty}` : i.name)).join(' · ')}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
        {paused ? (
          <PillBtn label="Resume" primary busy={busy} onPress={() => onAct('resume')} />
        ) : (
          <PillBtn label="Pause" busy={busy} onPress={() => onAct('pause')} />
        )}
        <PillBtn label="Cancel" danger busy={busy} onPress={() => onAct('cancel')} />
      </View>
    </View>
  );
}

function PillBtn({ label, primary, danger, busy, onPress }: { label: string; primary?: boolean; danger?: boolean; busy?: boolean; onPress: () => void }) {
  const c = useC();
  const bg = primary ? c.primary : c.bg2;
  const fg = primary ? '#fff' : danger ? c.red : c.ink2;
  return (
    <Press scale={0.96} onPress={busy ? undefined : onPress} style={{ flex: 1 }}>
      <View style={{ height: 40, borderRadius: radius.md, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', borderWidth: primary ? 0 : 1, borderColor: c.border }}>
        {busy ? <ActivityIndicator size="small" color={fg} /> : <Text style={[type(13.5, 800), { color: fg }]}>{label}</Text>}
      </View>
    </Press>
  );
}

function PlanCard({ p, onPress }: { p: Plan; onPress: () => void }) {
  const c = useC();
  return (
    <Press scale={0.985} onPress={onPress} style={{ marginBottom: 12 }}>
      <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: radius.xl, padding: 16, ...shadow.card }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={[type(16, 900), { color: c.ink, letterSpacing: -0.3 }]}>{p.name}</Text>
            <Text style={[type(12.5, 600), { color: c.soft, marginTop: 3 }]}>{p.kitchenName} · {p.items.reduce((n, i) => n + i.qty, 0)} meals/wk · {p.fulfillment === 'pickup' ? 'Pickup' : 'Delivery'}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[type(18, 900), { color: c.ink, letterSpacing: -0.5 }]}>{weekly(p.priceCents)}</Text>
            <Text style={[type(10.5, 700), { color: c.muted }]}>/week</Text>
          </View>
        </View>
        {p.items.length > 0 ? (
          <Text numberOfLines={1} style={[type(12.5, 600), { color: c.ink2, marginTop: 10 }]}>{p.items.map((i) => i.name).join(' · ')}</Text>
        ) : null}
      </View>
    </Press>
  );
}
