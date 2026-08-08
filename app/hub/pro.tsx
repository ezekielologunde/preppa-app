import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Platform, ActivityIndicator } from 'react-native';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius, shadow } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Btn, GradBox, Press } from '../../src/ui';
import { Screen, TopBar, Dock, DockTotal } from '../../src/ui/layout';
import { CardPaymentSheet } from '../../src/components/CardPaymentSheet';
import { createSetupIntent } from '../../src/lib/payments';
import { getMyKitchen } from '../../src/lib/connect';
import {
  fetchCookMembership, subscribeToCookPro, manageCookPro, cookMembershipActive,
  fetchCookProSalesSummary, CookMembership, CookProSalesSummary,
  COOK_PRO_MONTHLY_CENTS, COOK_PRO_ANNUAL_CENTS,
} from '../../src/lib/cookPro';

type Tone = 'amber' | 'purple' | 'blue' | 'green';

const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';

const BENEFITS: { ico: string; tone: Tone; t: string; s: string }[] = [
  { ico: 'wallet', tone: 'amber', t: 'Lower processing fee', s: 'Pay a flat 1% instead of ~2.9% + 30¢ on every sale — more of each order stays yours' },
  { ico: 'bolt', tone: 'purple', t: 'Priority placement', s: 'Your kitchen and meals surface first in Discover, ahead of non-member kitchens' },
  { ico: 'shield', tone: 'blue', t: '"Pro" badge', s: 'A visible trust signal on your storefront, next to your verified checkmark' },
  { ico: 'bars', tone: 'green', t: 'Sales insights', s: '30-day revenue, order count, and your top-selling meal at a glance' },
];

export default function CookPro() {
  const c = useC();
  const { toast, reconcileAccount } = useStore();

  const [loading, setLoading] = useState(true);
  const [kitchenId, setKitchenId] = useState<string | null>(null);
  const [mem, setMem] = useState<CookMembership | null>(null);
  const [summary, setSummary] = useState<CookProSalesSummary | null>(null);
  const [interval, setInterval] = useState<'month' | 'year'>('month');
  const [busy, setBusy] = useState(false);
  const [addCard, setAddCard] = useState<string | null>(null);

  const refresh = async (kid: string) => {
    try { setMem(await fetchCookMembership(kid)); } catch { /* keep */ }
  };

  useEffect(() => {
    (async () => {
      const k = await getMyKitchen();
      if (k) { setKitchenId(k.id); await refresh(k.id); }
      setLoading(false);
    })();
  }, []);

  const isMember = cookMembershipActive(mem);
  const trialAvailable = !mem?.trialConsumed;
  const priceCents = interval === 'year' ? COOK_PRO_ANNUAL_CENTS : COOK_PRO_MONTHLY_CENTS;

  useEffect(() => {
    if (!kitchenId || !isMember) { setSummary(null); return; }
    fetchCookProSalesSummary(kitchenId).then(setSummary).catch(() => setSummary(null));
  }, [kitchenId, isMember]);

  const doSubscribe = async () => {
    if (busy || !kitchenId) return;
    if (Platform.OS !== 'web') { toast('Preppa Pro is available on the web app for now.', 'info'); return; }
    setBusy(true);
    try {
      const res = await subscribeToCookPro(kitchenId, interval);
      await refresh(kitchenId);
      await reconcileAccount();
      toast(res.trial ? '7-day free trial started 🎉' : 'Welcome to Preppa Pro 🎉', 'bolt', true);
    } catch (e: any) {
      if (e?.code === 'no_card') {
        try { const { clientSecret } = await createSetupIntent(); setAddCard(clientSecret); }
        catch { toast('Add a card to start your membership.', 'info'); }
      } else {
        toast(e?.message || 'Could not start your membership. Please try again.', 'info');
      }
    } finally { setBusy(false); }
  };
  const onCardSaved = async () => { setAddCard(null); await doSubscribe(); };

  const doManage = async (action: 'cancel' | 'resume' | 'switch', iv?: 'month' | 'year') => {
    if (busy || !kitchenId) return;
    setBusy(true);
    try {
      await manageCookPro(kitchenId, action, iv);
      await refresh(kitchenId);
      await reconcileAccount();
      toast(action === 'cancel' ? 'Membership will end at the period close' : action === 'resume' ? 'Membership resumed' : 'Plan switched', 'check', true);
    } catch (e: any) {
      toast(e?.message || 'Could not update your membership.', 'info');
    } finally { setBusy(false); }
  };

  if (loading) {
    return (
      <Screen>
        <TopBar title="Preppa Pro" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.primary} /></View>
      </Screen>
    );
  }

  if (!kitchenId) {
    return (
      <Screen>
        <TopBar title="Preppa Pro" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={[type(14, 700), { color: c.soft, textAlign: 'center' }]}>You need a kitchen to join Preppa Pro.</Text>
        </View>
      </Screen>
    );
  }

  // --- Member state ---------------------------------------------------------
  if (isMember) {
    const trialing = mem?.status === 'trialing';
    const ending = mem?.cancelAtPeriodEnd;
    return (
      <Screen>
        <TopBar title="Preppa Pro" />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          <GradBox grad={['#1D6B4A', '#2E9E6B']} style={{ margin: 16, borderRadius: radius.xl, padding: 22, overflow: 'hidden', ...shadow.hero }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,.18)', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="bolt" size={22} color="#fff" />
              </View>
              <Text style={[type(22, 900), { color: '#fff', letterSpacing: -0.6 }]}>You're a Pro member</Text>
            </View>
            <Text style={[type(14, 600), { color: 'rgba(255,255,255,.92)', marginTop: 12, lineHeight: 21 }]}>
              {trialing ? `Free trial — renews ${fmtDate(mem?.currentPeriodEnd ?? null)}`
                : ending ? `Ends ${fmtDate(mem?.currentPeriodEnd ?? null)}`
                : `Renews ${fmtDate(mem?.currentPeriodEnd ?? null)} · ${mem?.planInterval === 'year' ? 'Annual' : 'Monthly'}`}
            </Text>
          </GradBox>

          {summary ? (
            <View style={{ backgroundColor: c.surface, borderRadius: radius.card, marginHorizontal: 16, padding: 16, borderWidth: 1, borderColor: c.border2 }}>
              <Text style={[type(12, 900), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }]}>Last 30 days</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Stat label="Revenue" value={money(summary.revenueCents)} />
                <Stat label="Orders" value={String(summary.orderCount)} />
                <Stat label="Avg order" value={money(Math.round(summary.avgOrderCents))} />
              </View>
              {summary.topMealName ? (
                <Text style={[type(12.5, 600), { color: c.soft, marginTop: 12 }]}>
                  Top seller: <Text style={{ color: c.ink, fontWeight: '800' as any }}>{summary.topMealName}</Text> ({summary.topMealQty}×)
                </Text>
              ) : null}
            </View>
          ) : null}

          <View style={{ backgroundColor: c.surface, borderRadius: radius.card, marginHorizontal: 16, marginTop: 14, padding: 16, borderWidth: 1, borderColor: c.border2 }}>
            <Text style={[type(12, 900), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }]}>Your perks</Text>
            {BENEFITS.map((b, i) => (
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

          <View style={{ padding: 16, gap: 10 }}>
            {ending ? (
              <Btn label="Resume membership" variant="dark" onPress={() => doManage('resume')} disabled={busy} />
            ) : (
              <>
                <Btn label={`Switch to ${mem?.planInterval === 'year' ? 'monthly' : 'annual'}`} variant="ghost"
                  onPress={() => doManage('switch', mem?.planInterval === 'year' ? 'month' : 'year')} disabled={busy} />
                <Press scale={0.98} onPress={() => doManage('cancel')} disabled={busy} label="Cancel membership"
                  style={{ alignItems: 'center', paddingVertical: 12 }}>
                  <Text style={[type(13.5, 800), { color: c.red }]}>Cancel membership</Text>
                </Press>
              </>
            )}
          </View>
        </ScrollView>
      </Screen>
    );
  }

  // --- Paywall --------------------------------------------------------------
  return (
    <Screen>
      <TopBar title="Preppa Pro" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
        <GradBox grad={['#1D6B4A', '#2E9E6B']} style={{ margin: 16, borderRadius: radius.xl, padding: 22, overflow: 'hidden', ...shadow.hero }}>
          <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: 'rgba(255,255,255,.18)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="bolt" size={28} color="#fff" />
          </View>
          <Text style={[type(28, 900), { color: '#fff', letterSpacing: -0.8, marginTop: 16 }]}>Preppa Pro</Text>
          <Text style={[type(14.5, 600), { color: 'rgba(255,255,255,.9)', marginTop: 6, lineHeight: 21 }]}>Keep more of every sale, get seen first.</Text>
        </GradBox>

        <View style={{ backgroundColor: c.surface, borderRadius: radius.card, marginHorizontal: 16, marginTop: 14, padding: 16, borderWidth: 1, borderColor: c.border2 }}>
          <Text style={[type(12, 900), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }]}>What you get</Text>
          {BENEFITS.map((b, i) => (
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

        <View style={{ flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 14 }}>
          <IntervalPill on={interval === 'month'} onPress={() => setInterval('month')} title="Monthly" price={money(COOK_PRO_MONTHLY_CENTS)} unit="/mo" />
          <IntervalPill on={interval === 'year'} onPress={() => setInterval('year')} title="Annual" price={money(COOK_PRO_ANNUAL_CENTS)} unit="/yr" badge="Save 26%" />
        </View>
        <Text style={[type(12, 500), { color: c.muted, marginTop: 10, textAlign: 'center' }]}>
          {trialAvailable ? '7-day free trial · Cancel anytime' : 'Cancel anytime'}
        </Text>
      </ScrollView>

      <Dock>
        <DockTotal label={interval === 'year' ? 'Annual' : 'Monthly'} value={`${money(priceCents)} ${interval === 'year' ? '/ year' : '/ month'}`} />
        <Btn label={busy ? 'Starting…' : trialAvailable ? 'Start free trial' : 'Subscribe'} flex={1} onPress={doSubscribe} disabled={busy} />
      </Dock>

      <CardPaymentSheet visible={!!addCard} clientSecret={addCard} amountLabel="" mode="save" onPaid={onCardSaved} onClose={() => setAddCard(null)} />
    </Screen>
  );
}

function IntervalPill({ on, onPress, title, price, unit, badge }: { on: boolean; onPress: () => void; title: string; price: string; unit: string; badge?: string }) {
  const c = useC();
  return (
    <Press scale={0.98} onPress={onPress} label={title} style={{
      flex: 1, backgroundColor: c.surface, borderRadius: radius.card, padding: 14,
      borderWidth: on ? 1.5 : 1, borderColor: on ? c.primary : c.border2, ...(on ? shadow.card : null),
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={[type(13.5, 800), { color: c.ink }]}>{title}</Text>
        {badge ? <View style={{ backgroundColor: c.greenL, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 }}><Text style={[type(10, 900), { color: c.green }]}>{badge}</Text></View> : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3, marginTop: 8 }}>
        <Text style={[type(22, 900), { color: on ? c.primary : c.ink, letterSpacing: -0.5 }]}>{price}</Text>
        <Text style={[type(12, 700), { color: c.soft }]}>{unit}</Text>
      </View>
    </Press>
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

function Stat({ label, value }: { label: string; value: string }) {
  const c = useC();
  return (
    <View style={{ flex: 1 }}>
      <Text style={[type(16.5, 900), { color: c.ink, letterSpacing: -0.3 }]}>{value}</Text>
      <Text style={[type(11, 700), { color: c.soft, marginTop: 2 }]}>{label}</Text>
    </View>
  );
}
