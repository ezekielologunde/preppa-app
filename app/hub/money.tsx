import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon } from '../../src/ui';
import { money } from '../../src/data/data';
import { HubHeader, KBtn } from '../(tabs)/my-hub';
import {
  getMyKitchen, getPayoutSummary, getPayoutHistory, refreshConnectStatus,
  startConnectOnboarding, cashOut, openPayoutDashboard, setPayoutPreferences, getPayoutPreferences,
  type ConnectStatus, type PayoutSummary, type PayoutHistoryEntry,
} from '../../src/lib/connect';

/**
 * Earnings + payouts. Preppa is the hub: the cook's balance (net of Stripe's fee)
 * comes from the ledger; onboarding + cash-out go through Stripe Connect. Cooks can
 * also opt into a weekly automatic sweep, and manage their bank/card via Stripe's
 * own Express Dashboard.
 */
export default function MoneyScreen() {
  const c = useC();
  const router = useRouter();
  const { toast } = useStore();
  const [kitchenId, setKitchenId] = useState<string | null>(null);
  const [summary, setSummary] = useState<PayoutSummary>({ availableCents: 0, pendingCents: 0, paidTotalCents: 0 });
  const [history, setHistory] = useState<PayoutHistoryEntry[]>([]);
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const k = await getMyKitchen();
      if (!k) { setLoading(false); return; }
      setKitchenId(k.id);
      const [sum, hist, st, prefs] = await Promise.all([
        getPayoutSummary(k.id).catch(() => ({ availableCents: 0, pendingCents: 0, paidTotalCents: 0 })),
        getPayoutHistory(k.id, 20).catch(() => []),
        refreshConnectStatus(k.id).catch(() => null),
        getPayoutPreferences(k.id).catch(() => ({ autoEnabled: true, minCents: 2000 })),
      ]);
      setSummary(sum);
      setHistory(hist);
      if (st) setStatus(st);
      setAutoEnabled(prefs.autoEnabled);
    } catch { /* keep defaults */ }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const onboard = async () => {
    if (!kitchenId) return;
    try { await startConnectOnboarding(kitchenId); }
    catch (e: any) { toast(e?.message || 'Couldn’t start payout setup — try again.', 'info'); }
  };
  const doCashOut = async () => {
    if (!kitchenId || busy) return;
    if (summary.availableCents <= 0) { toast('Nothing to cash out yet', 'info'); return; }
    setBusy(true);
    try {
      const result = await cashOut(kitchenId);
      if (result.pending) {
        toast('We’re confirming your payout — check back shortly, no need to try again.', 'info');
      } else {
        toast(`Paid out ${money(result.amountCents / 100)} to your account`, 'check', true);
      }
      await load();
    } catch (e: any) {
      toast(e?.message || 'Payout failed — try again.', 'info');
    } finally { setBusy(false); }
  };
  const manageBank = async () => {
    if (!kitchenId) return;
    try {
      const opened = await openPayoutDashboard(kitchenId);
      if (!opened) await startConnectOnboarding(kitchenId);
    } catch (e: any) {
      toast(e?.message || 'Couldn’t open your payout dashboard — try again.', 'info');
    }
  };
  const toggleAuto = async (next: boolean) => {
    if (!kitchenId) return;
    setAutoEnabled(next);
    try { await setPayoutPreferences(kitchenId, next, 2000); }
    catch (e: any) {
      setAutoEnabled(!next);
      toast(e?.message || 'Couldn’t update automatic payouts.', 'info');
    }
  };

  const payoutsReady = !!status?.payoutsEnabled;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <HubHeader eyebrow="My Hub" name="Earnings" onBack={() => router.back()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 8, paddingBottom: 40, maxWidth: 720, alignSelf: 'center', width: '100%' }}>
        {loading ? (
          <View style={{ paddingVertical: 48, alignItems: 'center' }}><ActivityIndicator color={c.primary} /></View>
        ) : (
          <>
            <View style={{ marginHorizontal: 20, marginTop: 6, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 20, padding: 20 }}>
              <Text style={[type(12, 800), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5 }]}>Available to cash out</Text>
              <Text style={[type(34, 900), { color: c.ink, letterSpacing: -1, marginTop: 6 }]}>{money(summary.availableCents / 100)}</Text>
              <Text style={[type(12.5, 600), { color: c.soft, marginTop: 4, lineHeight: 18 }]}>Net of Stripe’s processing fee. Cash out to your bank anytime.</Text>
              {summary.pendingCents > 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
                  <Icon name="clock" size={13} color={c.muted} />
                  <Text style={[type(12, 700), { color: c.muted }]}>{money(summary.pendingCents / 100)} confirming with Stripe</Text>
                </View>
              ) : null}
            </View>

            <View style={{ paddingHorizontal: 20, marginTop: 16, gap: 10 }}>
              {payoutsReady ? (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 }}>
                    <Icon name="shield" size={16} color={c.green} />
                    <Text style={[type(13.5, 800), { color: c.green }]}>Identity verified · payouts enabled</Text>
                  </View>
                  <KBtn label={busy ? 'Paying out…' : `Cash out ${money(summary.availableCents / 100)}`} variant="pri" block icon="bank" onPress={doCashOut} style={{ opacity: summary.availableCents > 0 && !busy ? 1 : 0.5 }} />
                  <KBtn label="Manage bank account" variant="ghost" block icon="card" onPress={manageBank} />

                  <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 18, padding: 16, marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[type(14, 800), { color: c.ink }]}>Automatic weekly payouts</Text>
                      <Text style={[type(12, 600), { color: c.soft, marginTop: 2, lineHeight: 16 }]}>We’ll send balances of $20+ to your bank every week. You can still cash out manually anytime.</Text>
                    </View>
                    <Switch value={autoEnabled} onValueChange={toggleAuto} trackColor={{ true: c.primary }} />
                  </View>
                </>
              ) : (
                <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 18, padding: 16, gap: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: c.primaryL, alignItems: 'center', justifyContent: 'center' }}><Icon name="card" size={20} color={c.primary} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={[type(15, 900), { color: c.ink }]}>{status?.detailsSubmitted ? 'Finishing verification' : 'Set up payouts & verify identity'}</Text>
                      <Text style={[type(12.5, 600), { color: c.soft, marginTop: 2, lineHeight: 17 }]}>Secure Stripe setup — you don’t need your own Stripe account.</Text>
                    </View>
                  </View>
                  <KBtn label={status?.detailsSubmitted ? 'Continue setup' : 'Set up payouts'} variant="pri" block icon="card" onPress={onboard} />
                  {status?.detailsSubmitted ? <KBtn label="Refresh status" variant="ghost" sm onPress={load} /> : null}
                </View>
              )}
            </View>

            {history.length > 0 ? (
              <View style={{ paddingHorizontal: 20, marginTop: 22 }}>
                <Text style={[type(13, 800), { color: c.ink, marginBottom: 10 }]}>Payout history</Text>
                <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 18, overflow: 'hidden' }}>
                  {history.map((h, i) => (
                    <PayoutRow key={h.id} c={c} entry={h} isLast={i === history.length - 1} />
                  ))}
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function statusLabel(entry: PayoutHistoryEntry): { text: string; fg: (c: any) => string; bg: (c: any) => string } {
  switch (entry.status) {
    case 'paid': return { text: 'Paid', fg: (c) => c.green, bg: (c) => c.greenL };
    case 'pending': return { text: 'Confirming', fg: (c) => c.primary, bg: (c) => c.primaryL };
    case 'needs_review': return { text: 'Needs attention', fg: (c) => c.red, bg: (c) => c.redL };
    case 'failed': return { text: 'Failed', fg: (c) => c.red, bg: (c) => c.redL };
    default: return { text: entry.status, fg: (c) => c.soft, bg: (c) => c.bg2 };
  }
}

function PayoutRow({ c, entry, isLast }: { c: any; entry: PayoutHistoryEntry; isLast: boolean }) {
  const label = statusLabel(entry);
  const date = new Date(entry.createdAt);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: isLast ? 0 : 1, borderBottomColor: c.border2 }}>
      <View style={{ flex: 1 }}>
        <Text style={[type(14, 800), { color: c.ink }]}>{money(entry.amountCents / 100)}</Text>
        <Text style={[type(11.5, 600), { color: c.muted, marginTop: 2 }]}>
          {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {entry.source === 'auto' ? 'Automatic' : 'Manual'}
        </Text>
      </View>
      <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: label.bg(c) }}>
        <Text style={[type(11.5, 800), { color: label.fg(c) }]}>{label.text}</Text>
      </View>
    </View>
  );
}
