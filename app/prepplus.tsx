import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Platform, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useC } from '../src/theme/ThemeContext';
import { type, radius, shadow } from '../src/theme/theme';
import { useStore } from '../src/store/store';
import { Icon, Btn, GradBox, Press } from '../src/ui';
import { Screen, TopBar, Dock, DockTotal } from '../src/ui/layout';
import { CardPaymentSheet } from '../src/components/CardPaymentSheet';
import { createSetupIntent } from '../src/lib/payments';
import {
  fetchMembership, subscribeToPrepPlus, manageMembership, membershipActive,
  Membership, PREPPLUS_MONTHLY_CENTS, PREPPLUS_ANNUAL_CENTS,
} from '../src/lib/membership';

type Tone = 'amber' | 'purple' | 'blue' | 'green';

const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';

export default function PrepPlus() {
  const c = useC();
  const router = useRouter();
  const { toast, reconcileAccount } = useStore();

  const [loading, setLoading] = useState(true);
  const [mem, setMem] = useState<Membership | null>(null);
  const [interval, setInterval] = useState<'month' | 'year'>('month');
  const [busy, setBusy] = useState(false);
  const [addCard, setAddCard] = useState<string | null>(null);

  const refresh = async () => {
    try { setMem(await fetchMembership()); } catch { /* keep */ }
  };
  useEffect(() => { (async () => { await refresh(); setLoading(false); })(); }, []);

  const isMember = membershipActive(mem);
  const trialAvailable = !mem?.trialConsumed;
  const priceCents = interval === 'year' ? PREPPLUS_ANNUAL_CENTS : PREPPLUS_MONTHLY_CENTS;

  const benefits: { ico: string; tone: Tone; t: string; s: string }[] = [
    { ico: 'chefhat', tone: 'amber', t: 'Fee-free private chefs & catering', s: 'Book a cook for your home, a dinner or an event — no service fee' },
    { ico: 'repeat', tone: 'purple', t: 'No platform fee on meal plans', s: 'Your weekly plans & build-your-own boxes, minus our cut' },
    { ico: 'shield', tone: 'blue', t: 'Cancel anytime', s: 'Keep your perks through the paid period — no lock-in' },
  ];

  const doSubscribe = async () => {
    if (busy) return;
    if (Platform.OS !== 'web') { toast('Membership is available on the web app for now.', 'info'); return; }
    setBusy(true);
    try {
      const res = await subscribeToPrepPlus(interval);
      await refresh();
      await reconcileAccount();
      toast(res.trial ? '7-day free trial started 🎉' : 'Welcome to PrepPlus 🎉', 'bolt', true);
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
    if (busy) return;
    setBusy(true);
    try {
      await manageMembership(action, iv);
      await refresh();
      await reconcileAccount();
      toast(action === 'cancel' ? 'Membership will end at the period close' : action === 'resume' ? 'Membership resumed' : 'Plan switched', 'check', true);
    } catch (e: any) {
      toast(e?.message || 'Could not update your membership.', 'info');
    } finally { setBusy(false); }
  };

  if (loading) {
    return (
      <Screen>
        <TopBar title="PrepPlus" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.primary} /></View>
      </Screen>
    );
  }

  // --- Member state ---------------------------------------------------------
  if (isMember) {
    const trialing = mem?.status === 'trialing';
    const ending = mem?.cancelAtPeriodEnd;
    return (
      <Screen>
        <TopBar title="PrepPlus" />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          <GradBox grad={['#6B4A93', '#E24A38']} style={{ margin: 16, borderRadius: radius.xl, padding: 22, overflow: 'hidden', ...shadow.hero }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,.18)', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="bolt" size={22} color="#fff" />
              </View>
              <Text style={[type(22, 900), { color: '#fff', letterSpacing: -0.6 }]}>You're a member</Text>
            </View>
            <Text style={[type(14, 600), { color: 'rgba(255,255,255,.92)', marginTop: 12, lineHeight: 21 }]}>
              {trialing ? `Free trial — renews ${fmtDate(mem?.currentPeriodEnd ?? null)}`
                : ending ? `Ends ${fmtDate(mem?.currentPeriodEnd ?? null)}`
                : `Renews ${fmtDate(mem?.currentPeriodEnd ?? null)} · ${mem?.planInterval === 'year' ? 'Annual' : 'Monthly'}`}
            </Text>
          </GradBox>

          <View style={{ backgroundColor: c.surface, borderRadius: radius.card, marginHorizontal: 16, padding: 16, borderWidth: 1, borderColor: c.border2 }}>
            <Text style={[type(12, 900), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }]}>Your perks</Text>
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
      <TopBar title="PrepPlus" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
        <GradBox grad={['#6B4A93', '#E24A38']} style={{ margin: 16, borderRadius: radius.xl, padding: 22, overflow: 'hidden', ...shadow.hero }}>
          <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: 'rgba(255,255,255,.18)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="bolt" size={28} color="#fff" />
          </View>
          <Text style={[type(28, 900), { color: '#fff', letterSpacing: -0.8, marginTop: 16 }]}>PrepPlus</Text>
          <Text style={[type(14.5, 600), { color: 'rgba(255,255,255,.9)', marginTop: 6, lineHeight: 21 }]}>Fee-free private chefs, catering & meal plans.</Text>
        </GradBox>

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

        {/* interval toggle */}
        <View style={{ flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 14 }}>
          <IntervalPill on={interval === 'month'} onPress={() => setInterval('month')} title="Monthly" price={money(PREPPLUS_MONTHLY_CENTS)} unit="/mo" />
          <IntervalPill on={interval === 'year'} onPress={() => setInterval('year')} title="Annual" price={money(PREPPLUS_ANNUAL_CENTS)} unit="/yr" badge="Save 26%" />
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
