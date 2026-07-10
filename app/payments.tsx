import React, { useState } from 'react';
import { View, Text, ScrollView, Platform, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useC } from '../src/theme/ThemeContext';
import { type, radius } from '../src/theme/theme';
import { useStore } from '../src/store/store';
import { Icon, Press, Btn } from '../src/ui';
import { Screen, TopBar, MiniTag, Empty } from '../src/ui/layout';
import { CardPaymentSheet } from '../src/components/CardPaymentSheet';
import { useSavedCards } from '../src/lib/useSavedCards';
import { createSetupIntent, detachPaymentMethod, setDefaultPaymentMethod, SavedCard } from '../src/lib/payments';

const brandName = (b: string) => (b ? b.charAt(0).toUpperCase() + b.slice(1) : 'Card');
const expLabel = (m: number | null, y: number | null) =>
  m && y ? `${String(m).padStart(2, '0')}/${String(y).slice(-2)}` : '—';

export default function Payments() {
  const c = useC();
  const router = useRouter();
  const { select } = useLocalSearchParams<{ select?: string }>();
  const selecting = select === '1';
  const { toast } = useStore();
  const { methods, defaultId, loading, error, refetch } = useSavedCards();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const startAdd = async () => {
    if (starting) return;
    setStarting(true);
    try {
      const { clientSecret } = await createSetupIntent();
      setSetupSecret(clientSecret);
      setAddOpen(true);
    } catch {
      toast('Couldn’t start adding a card. Please try again.', 'info');
    } finally {
      setStarting(false);
    }
  };

  const makeDefault = async (card: SavedCard) => {
    if (busyId) return;
    setBusyId(card.id);
    try {
      await setDefaultPaymentMethod(card.id);
      await refetch();
      if (selecting) {
        toast('Payment method updated', 'card', true);
        router.back();
        return;
      }
      toast(`${brandName(card.brand)} •••• ${card.last4} is now your default`, 'card', true);
    } catch {
      toast('Couldn’t update your default card. Please try again.', 'info');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (card: SavedCard) => {
    if (busyId) return;
    setBusyId(card.id);
    try {
      await detachPaymentMethod(card.id);
      await refetch();
      toast('Card removed', 'x');
    } catch {
      toast('Couldn’t remove the card. Please try again.', 'info');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Screen>
      <TopBar title="Payment methods" sub={selecting ? 'Pick one' : undefined} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        {Platform.OS !== 'web' ? (
          <Empty icon="card" title="Manage cards on the web" body="Adding and managing saved cards is available in the Preppa web app for now." />
        ) : loading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator color={c.primary} />
          </View>
        ) : error ? (
          <View style={{ padding: 18, borderRadius: radius.card, borderWidth: 1, borderColor: c.border2, backgroundColor: c.surface, alignItems: 'center', gap: 12 }}>
            <Text style={[type(14, 600), { color: c.soft, textAlign: 'center' }]}>We couldn’t load your saved cards.</Text>
            <Btn label="Try again" icon="repeat" variant="dark" onPress={refetch} />
          </View>
        ) : (
          <>
            {methods.length === 0 ? (
              <Empty icon="card" title="No saved cards" body="Add a card to check out faster next time — or pay cash on delivery." />
            ) : (
              methods.map((card) => {
                const on = card.id === defaultId;
                const rowBusy = busyId === card.id;
                return (
                  <View key={card.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 14, borderWidth: 1.5, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primaryL : c.surface, borderRadius: radius.card, opacity: rowBusy ? 0.6 : 1 }}>
                    <Press scale={0.99} onPress={() => makeDefault(card)} label={`Make ${brandName(card.brand)} ending ${card.last4} the default`} disabled={rowBusy} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: on ? c.surface : c.bg2, alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name="card" size={20} color={on ? c.primary : c.ink} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                          <Text numberOfLines={1} style={[type(14.5, 800), { color: c.ink }]}>{brandName(card.brand)} •••• {card.last4}</Text>
                          {on ? <MiniTag label="Default" tone="green" /> : null}
                        </View>
                        <Text style={[type(12.5, 500), { color: c.soft, marginTop: 3 }]}>Expires {expLabel(card.expMonth, card.expYear)}</Text>
                      </View>
                      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? c.primary : c.border, alignItems: 'center', justifyContent: 'center' }}>
                        {on ? <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: c.primary }} /> : null}
                      </View>
                    </Press>
                    <Press scale={0.9} onPress={() => remove(card)} label={`Remove ${brandName(card.brand)} ending ${card.last4}`} hitSlop={8} disabled={rowBusy}>
                      <View style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name="x" size={16} color={c.muted} />
                      </View>
                    </Press>
                  </View>
                );
              })
            )}

            {/* cash on delivery — always available */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1, borderColor: c.border2, backgroundColor: c.surface, borderRadius: radius.card }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.purpleL, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="wallet" size={20} color={c.purpleOn} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <Text style={[type(14.5, 800), { color: c.ink }]}>Cash on delivery</Text>
                  <MiniTag label="Always on" tone="purple" />
                </View>
                <Text style={[type(12.5, 500), { color: c.soft, marginTop: 3 }]}>Pay in cash with QR handoff at the door</Text>
              </View>
            </View>

            <View style={{ height: 4 }} />
            <Btn label="Add a card" icon="plus" variant="ghost" block loading={starting} onPress={startAdd} />

            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 6, paddingHorizontal: 4 }}>
              <Icon name="lock" size={14} color={c.muted} />
              <Text style={[type(12, 500), { color: c.muted, flex: 1, lineHeight: 18 }]}>Cards are stored securely by Stripe — Preppa never sees or stores your full card number.</Text>
            </View>
          </>
        )}
      </ScrollView>

      <CardPaymentSheet
        visible={addOpen}
        mode="save"
        clientSecret={setupSecret}
        amountLabel=""
        onPaid={() => {
          setAddOpen(false);
          setSetupSecret(null);
          toast('Card added', 'card', true);
          refetch();
        }}
        onClose={() => {
          setAddOpen(false);
          setSetupSecret(null);
        }}
      />
    </Screen>
  );
}
