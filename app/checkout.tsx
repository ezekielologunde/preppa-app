import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { createRealOrder, confirmSavedCardPayment } from '../src/lib/payments';
import { useSavedCards } from '../src/lib/useSavedCards';
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

const brandName = (b: string) => (b ? b.charAt(0).toUpperCase() + b.slice(1) : 'Card');

const TIPS = [0, 2, 3, 5];

export default function Checkout() {
  const c = useC();
  const router = useRouter();
  const { cook } = useLocalSearchParams<{ cook?: string }>();
  const ck = (cook || undefined) as CookId | undefined;
  const { cart, tip, setTip, mode, placeOrder, address, orders, toast, resetOnboarding } = useStore();
  const lines = ck ? cart.filter((l) => l.cook === ck) : cart;
  const t = useTotals(lines, tip, mode);
  const { methods, defaultId } = useSavedCards();
  const [pay, setPay] = useState<'online' | 'cod'>('online');
  const [busy, setBusy] = useState(false);
  const [addrSheet, setAddrSheet] = useState(false);
  const [cardSheet, setCardSheet] = useState(false);
  const [cardPayOpen, setCardPayOpen] = useState(false);
  const [cardSecret, setCardSecret] = useState<string | null>(null);
  const [cardOrderId, setCardOrderId] = useState<string | null>(null);
  // Which saved card to charge; `null` = enter a new card. Initialized to the default.
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [saveNewCard, setSaveNewCard] = useState(true);
  const [pickedCard, setPickedCard] = useState(false); // has the user chosen explicitly?
  useEffect(() => {
    if (pickedCard || Platform.OS !== 'web') return;
    if (methods.length > 0) setSelectedCardId(defaultId ?? methods[0].id);
    else setSelectedCardId(null);
  }, [methods, defaultId, pickedCard]);
  const selectedCard = methods.find((mm) => mm.id === selectedCardId) ?? null;
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
  // Card checkout only has a real charge path on web (@stripe/stripe-js). Rather than fake a
  // "paid" order on native with no charge and no order row (audit Critical), online pay is
  // blocked on native until a real native PaymentSheet integration ships.
  const onlineUnavailableOnNative = Platform.OS !== 'web';
  const effectivePay: 'online' | 'cod' = pay === 'cod' && !codBlockedReason ? 'cod' : 'online';
  const payBlockedReason = effectivePay === 'online' && onlineUnavailableOnNative
    ? 'Card checkout is web-only right now — open preppa in a browser to pay online, or choose cash on delivery if your cook offers it.'
    : null;

  const place = async () => {
    if (busy) return; // guard against double-fire / double-order
    if (payBlockedReason) { toast(payBlockedReason, 'info'); return; }
    if (effectivePay === 'cod') { setBusy(true); router.push(`/cod?cook=${ck ?? ''}`); return; }
    const cookId = (ck ?? lines[0]?.cook) as string;
    setBusy(true);
    // Web: real order + real Stripe charge.
    if (Platform.OS === 'web') {
      try {
        const useSaved = !!selectedCard;
        const { orderId, clientSecret } = await createRealOrder({
          cook: cookId, lines, mode, tipDollars: tip,
          idempotencyKey: `${cookId}-${Date.now()}`,
          savePaymentMethod: useSaved ? false : saveNewCard,
        });
        if (useSaved) {
          // Charge the saved card directly — no retype.
          await confirmSavedCardPayment(clientSecret, selectedCard!.id);
          setBusy(false);
          placeOrder('paid', ck, orderId);
          router.replace(`/track?flow=paid&cook=${ck ?? ''}&orderId=${orderId}`);
          return;
        }
        // New card → collect it in the sheet and confirm there.
        setCardOrderId(orderId);
        setCardSecret(clientSecret);
        setCardPayOpen(true);
        setBusy(false);
        return;
      } catch (e) {
        setBusy(false);
        const msg = (e as any)?.message ?? '';
        if (msg === 'AUTH_REQUIRED') {
          toast('Please sign in again to place your order.', 'info');
          resetOnboarding(); // re-show the sign-in gate
        } else {
          toast(msg.includes('card') ? 'Your card couldn’t be charged. Check the details or try another card.' : 'Couldn’t start your payment. Please try again.', 'info');
        }
        return;
      }
    }
    // Unreachable in normal use (payBlockedReason above catches native+online, and cod/web
    // both return above) — defensive fallback only, never silently fakes a paid order.
    setBusy(false);
    toast('Couldn’t start your payment. Please try again.', 'info');
  };

  // After a real card charge succeeds, mirror into local history + go to tracking.
  const onCardPaid = () => {
    setCardPayOpen(false);
    placeOrder('paid', ck, cardOrderId ?? undefined);
    router.replace(`/track?flow=paid&cook=${ck ?? ''}${cardOrderId ? `&orderId=${cardOrderId}` : ''}`);
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
          <PayOption
            on={effectivePay === 'online'}
            disabled={onlineUnavailableOnNative}
            onPress={() => setPay('online')}
            icon="card"
            title="Pay online"
            tag={onlineUnavailableOnNative ? 'Web only' : 'Stripe'}
            tagTone="green"
            body={onlineUnavailableOnNative ? 'Open preppa in a browser to pay online' : (selectedCard ? `${brandName(selectedCard.brand)} •••• ${selectedCard.last4} · secure checkout` : 'Enter a card securely at payment')}
          />
          {effectivePay === 'online' && Platform.OS === 'web' ? (
            <>
              <Press scale={0.98} onPress={() => setCardSheet(true)} label="Change payment card">
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 8, marginLeft: 2 }}>
                  <Text style={[type(13, 800), { color: c.primary }]}>{methods.length > 0 ? 'Change card' : 'Add a card'}</Text>
                  <Icon name="chevRight" size={14} color={c.primary} />
                </View>
              </Press>
              {selectedCard === null ? (
                <Press scale={0.99} onPress={() => setSaveNewCard((v) => !v)} label="Save this card for next time" style={{ marginTop: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: saveNewCard ? c.primary : c.border, backgroundColor: saveNewCard ? c.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {saveNewCard ? <Icon name="check" size={13} color="#fff" /> : null}
                    </View>
                    <Text style={[type(13, 700), { color: c.soft }]}>Save this card for next time</Text>
                  </View>
                </Press>
              ) : null}
            </>
          ) : null}
          <View style={{ height: 10 }} />
          <PayOption on={effectivePay === 'cod'} disabled={!!codBlockedReason} onPress={() => setPay('cod')} icon="cash" title="Cash on delivery" tag={codBlockedReason ? 'Unavailable' : 'In person'} tagTone="purple" body={codBlockedReason ?? 'Confirm the amount together at handoff'} />
        </Block>

        {effectivePay === 'cod' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 14, paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: c.purpleL, borderWidth: 1, borderColor: c.purple }}>
            <Icon name="qr" size={20} color={c.purpleOn} />
            <Text style={[type(12.5, 700), { color: c.purpleOn, flex: 1, lineHeight: 18 }]}>You and your cook confirm the cash amount together at handoff — on both phones. Preppa isn’t holding your money; you pay the cook directly.</Text>
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
        <Btn
          label={payBlockedReason ? 'Choose cash on delivery' : effectivePay === 'cod' ? 'Place order' : `Pay ${money(t.total)}`}
          flex={1}
          disabled={!!payBlockedReason && !theCook.acceptsCod}
          loading={busy && effectivePay !== 'cod'}
          onPress={place}
        />
      </Dock>

      <AddressPickerSheet visible={addrSheet} onClose={() => setAddrSheet(false)} />
      <CardPickerSheet
        visible={cardSheet}
        onClose={() => setCardSheet(false)}
        methods={methods}
        selectedId={selectedCardId}
        onSelect={(id) => { setSelectedCardId(id); setPickedCard(true); }}
      />
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
