import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon } from '../../src/ui';
import { money } from '../../src/data/data';
import { HubHeader, KBtn } from '../(tabs)/my-hub';
import {
  getMyKitchen, getKitchenBalanceCents, refreshConnectStatus,
  startConnectOnboarding, cashOut, type ConnectStatus,
} from '../../src/lib/connect';

/**
 * Earnings + payouts. Preppa is the hub: the cook's balance (net of Stripe's fee)
 * comes from the ledger; onboarding + cash-out go through Stripe Connect.
 */
export default function MoneyScreen() {
  const c = useC();
  const router = useRouter();
  const { toast } = useStore();
  const [kitchenId, setKitchenId] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const k = await getMyKitchen();
      if (!k) { setLoading(false); return; }
      setKitchenId(k.id);
      const [bal, st] = await Promise.all([
        getKitchenBalanceCents(k.id),
        refreshConnectStatus(k.id).catch(() => null),
      ]);
      setBalance(bal);
      if (st) setStatus(st);
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
    if (balance <= 0) { toast('Nothing to cash out yet', 'info'); return; }
    setBusy(true);
    try {
      const cents = await cashOut(kitchenId);
      toast(`Paid out ${money(cents / 100)} to your account`, 'check', true);
      await load();
    } catch (e: any) {
      toast(e?.message || 'Payout failed — try again.', 'info');
    } finally { setBusy(false); }
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
              <Text style={[type(34, 900), { color: c.ink, letterSpacing: -1, marginTop: 6 }]}>{money(balance / 100)}</Text>
              <Text style={[type(12.5, 600), { color: c.soft, marginTop: 4, lineHeight: 18 }]}>Net of Stripe’s processing fee. Cash out to your bank anytime.</Text>
            </View>

            <View style={{ paddingHorizontal: 20, marginTop: 16, gap: 10 }}>
              {payoutsReady ? (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 }}>
                    <Icon name="shield" size={16} color={c.green} />
                    <Text style={[type(13.5, 800), { color: c.green }]}>Identity verified · payouts enabled</Text>
                  </View>
                  <KBtn label={busy ? 'Paying out…' : `Cash out ${money(balance / 100)}`} variant="pri" block icon="bank" onPress={doCashOut} style={{ opacity: balance > 0 && !busy ? 1 : 0.5 }} />
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
          </>
        )}
      </ScrollView>
    </View>
  );
}
