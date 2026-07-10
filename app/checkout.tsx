import React, { useState } from 'react';
import { View, Text, ScrollView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { createRealOrder } from '../src/lib/payments';
import { COOKS, CookId, money } from '../src/data/data';
import { useC } from '../src/theme/ThemeContext';
import { type, radius } from '../src/theme/theme';
import { useStore } from '../src/store/store';
import { Icon, Press, Btn } from '../src/ui';
import { Screen, TopBar, Dock, DockTotal, Block, MiniTag, Empty } from '../src/ui/layout';
import { useTotals, Summary } from '../src/components/shared';
import { ModeToggle } from '../src/components/ModeToggle';
import { AddressPickerSheet, CardPickerSheet } from '../src/components/PickerSheets';
import { CardPaymentSheet } from '../src/components/CardPaymentSheet';

const TIPS = [0, 2, 3, 5];

export default function Checkout() {
  const c = useC();
  const router = useRouter();
  const { cook } = useLocalSearchParams<{ cook?: string }>();
  const ck = (cook || undefined) as CookId | undefined;
  const { cart, tip, setTip, mode, placeOrder, address, card, orders } = useStore();
  const lines = ck ? cart.filter((l) => l.cook === ck) : cart;
  const t = useTotals(lines, tip, mode);
  const [pay, setPay] = useState<'online' | 'cod'>('online');
  const [busy, setBusy] = useState(false);
  const [addrSheet, setAddrSheet] = useState(false);
  const [cardSheet, setCardSheet] = useState(false);
  const [cardPayOpen, setCardPayOpen] = useState(false);
  const [cardSecret, setCardSecret] = useState<string | null>(null);
  const [cardOrderId, setCardOrderId] = useState<string | null>(null);
  const theCook = COOKS[ck ?? lines[0]?.cook ?? 'maria'];

  if (lines.length === 0) {
    return (
      <Screen>
        <TopBar title="Checkout" />
        <Empty icon="cart" title="Nothing to check out" body="This kitchen’s items are no longer in your cart." action={<Btn label="Back to cart" onPress={() => router.replace('/cart')} />} />
      </Screen>
    );
  }

  // COD guardrails (council): cook opts in, and a first-order cash ceiling bounds the
  // fake-order tail. No held cards / deposits / KYC — those need a real payments backend.
  const COD_CEILING = 40;
  const overCeiling = orders.length === 0 && t.total > COD_CEILING;
  const codBlockedReason = !theCook.acceptsCod
    ? `${theCook.name} takes card only`
    : overCeiling
      ? `Cash is capped at ${money(COD_CEILING)} on your first order`
      : null;
  const effectivePay: 'online' | 'cod' = pay === 'cod' && !codBlockedReason ? 'cod' : 'online';

  const place = async () => {
    if (busy) return; // guard against double-fire / double-order
    if (effectivePay === 'cod') { setBusy(true); router.push(`/cod?cook=${ck ?? ''}`); return; }
    const cookId = (ck ?? lines[0]?.cook) as string;
    setBusy(true);
    // Web: create the real order, then collect a real card in the sheet and confirm.
    if (Platform.OS === 'web') {
      try {
        const { orderId, clientSecret } = await createRealOrder({ cook: cookId, lines, mode, tipDollars: tip, idempotencyKey: `${cookId}-${Date.now()}` });
        setCardOrderId(orderId);
        setCardSecret(clientSecret);
        setCardPayOpen(true);
        setBusy(false);
        return;
      } catch (e) {
        console.warn('[pay] real order unavailable, mock fallback:', (e as any)?.message);
      }
    }
    // Native, or web create-order failure → mock so the demo never breaks.
    placeOrder('paid', ck);
    router.replace(`/track?flow=paid&cook=${ck ?? ''}`);
  };

  // After a real card charge succeeds, mirror into local history + go to tracking.
  const onCardPaid = () => {
    setCardPayOpen(false);
    placeOrder('paid', ck, cardOrderId ?? undefined);
    router.replace(`/track?flow=paid&cook=${ck ?? ''}`);
  };

  return (
    <Screen>
      <TopBar title="Checkout" sub={`From ${theCook.name}`} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <Block title={mode === 'pickup' ? 'Pick up from' : 'Deliver to'}>
          <View style={{ marginBottom: 14 }}><ModeToggle sm /></View>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.primaryL, alignItems: 'center', justifyContent: 'center' }}><Icon name="pin" size={20} color={c.primary} /></View>
            <View style={{ flex: 1 }}>
              {mode === 'pickup' ? (
                <><Text style={[type(14.5, 800), { color: c.ink }]}>{theCook.kitchen}</Text><Text style={[type(13, 500), { color: c.soft, marginTop: 2 }]}>Pick up · {theCook.dist} away · ready ~25 min</Text></>
              ) : address ? (
                <><Text numberOfLines={1} style={[type(14.5, 800), { color: c.ink }]}>{address.label} · {address.line1}</Text>{address.line2 ? <Text numberOfLines={1} style={[type(13, 500), { color: c.soft, marginTop: 2 }]}>{address.line2}</Text> : null}</>
              ) : (
                <Text style={[type(14, 700), { color: c.primary }]}>Add a delivery address</Text>
              )}
            </View>
            {mode === 'pickup' ? null : (
              <Press scale={0.9} onPress={() => setAddrSheet(true)} label="Change delivery address"><View style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}><Icon name="chevRight" size={16} color={c.muted} /></View></Press>
            )}
          </View>
        </Block>

        <Block title="Payment">
          <PayOption on={effectivePay === 'online'} onPress={() => setPay('online')} icon="card" title="Pay online" tag="Stripe" tagTone="green" body={card ? `${card.brand} •••• ${card.last4} · secure checkout` : 'Add a card to pay online'} />
          {effectivePay === 'online' ? (
            <Press scale={0.98} onPress={() => setCardSheet(true)} label="Change payment card">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 8, marginLeft: 2 }}>
                <Text style={[type(13, 800), { color: c.primary }]}>{card ? 'Change card' : 'Add a card'}</Text>
                <Icon name="chevRight" size={14} color={c.primary} />
              </View>
            </Press>
          ) : null}
          <View style={{ height: 10 }} />
          <PayOption on={effectivePay === 'cod'} disabled={!!codBlockedReason} onPress={() => setPay('cod')} icon="cash" title="Cash on delivery" tag={codBlockedReason ? 'Unavailable' : 'In person'} tagTone="purple" body={codBlockedReason ?? 'Confirm the amount together at handoff'} />
        </Block>

        {effectivePay === 'cod' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 14, paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: c.purpleL, borderWidth: 1, borderColor: c.purple }}>
            <Icon name="qr" size={20} color={c.purple} />
            <Text style={[type(12.5, 700), { color: c.purple, flex: 1, lineHeight: 18 }]}>You and your cook confirm the cash amount together at handoff — on both phones. Preppa isn’t holding your money; you pay the cook directly.</Text>
          </View>
        ) : null}

        <Block title="Add a tip · goes 100% to the cook">
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {TIPS.map((v) => {
              const on = tip === v;
              return (
                <Press key={v} scale={0.95} onPress={() => setTip(v)} style={{ flex: 1 }}>
                  <View style={{ height: 44, borderRadius: radius.sm, borderWidth: 1.5, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primaryL : c.surface, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={[type(14, 800), { color: on ? c.primaryD : c.soft }]}>{v === 0 ? 'None' : money(v)}</Text>
                  </View>
                </Press>
              );
            })}
          </View>
        </Block>

        <Summary t={t} mode={mode} />
      </ScrollView>

      <Dock>
        <DockTotal label="Total" value={money(t.total)} />
        <Btn label={effectivePay === 'cod' ? 'Place order' : `Pay ${money(t.total)}`} flex={1} loading={busy && effectivePay !== 'cod'} onPress={place} />
      </Dock>

      <AddressPickerSheet visible={addrSheet} onClose={() => setAddrSheet(false)} />
      <CardPickerSheet visible={cardSheet} onClose={() => setCardSheet(false)} />
      <CardPaymentSheet visible={cardPayOpen} clientSecret={cardSecret} amountLabel={money(t.total)} onPaid={onCardPaid} onClose={() => setCardPayOpen(false)} />
    </Screen>
  );
}

function PayOption({ on, onPress, icon, title, tag, tagTone, body, disabled }: { on: boolean; onPress: () => void; icon: string; title: string; tag: string; tagTone: 'green' | 'purple'; body: string; disabled?: boolean }) {
  const c = useC();
  return (
    <Press scale={disabled ? 1 : 0.99} onPress={disabled ? () => {} : onPress}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1.5, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primaryL : c.surface, borderRadius: radius.md, opacity: disabled ? 0.55 : 1 }}>
        <View style={{ width: 42, height: 42, borderRadius: 11, backgroundColor: on ? c.surface : c.bg2, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={20} color={on ? c.primary : c.ink} /></View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><Text style={[type(14.5, 800), { color: c.ink }]}>{title}</Text><MiniTag label={tag} tone={tagTone} /></View>
          <Text style={[type(12, 500), { color: c.soft, marginTop: 3 }]}>{body}</Text>
        </View>
        {disabled ? (
          <Icon name="lock" size={16} color={c.muted} />
        ) : (
          <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? c.primary : c.border, alignItems: 'center', justifyContent: 'center' }}>{on ? <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: c.primary }} /> : null}</View>
        )}
      </View>
    </Press>
  );
}
