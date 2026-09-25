import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Platform, ActivityIndicator, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { createRealOrder, confirmSavedCardPayment, payWithCard } from '../src/lib/payments';
import { useSavedCards } from '../src/lib/useSavedCards';
import { cookOfLine, lineKey, money } from '../src/data/data';
import { useC } from '../src/theme/ThemeContext';
import { type, radius } from '../src/theme/theme';
import { useStore } from '../src/store/store';
import { Icon, Press, Btn } from '../src/ui';
import { Screen, TopBar, Dock, DockTotal, Block, MiniTag, Empty } from '../src/ui/layout';
import { useTotals, Summary, OrderLineRow } from '../src/components/shared';
import { ModeToggle } from '../src/components/ModeToggle';
import { AddressPickerSheet, CardPickerSheet } from '../src/components/PickerSheets';
import { CardPaymentSheet } from '../src/components/CardPaymentSheet';
import { Dialog } from '../src/ui/overlay';
import { addressLocality, isCompleteDeliveryAddress } from '../src/lib/addresses';

const brandName = (b: string) => (b ? b.charAt(0).toUpperCase() + b.slice(1) : 'Card');

const TIPS = [0, 2, 3, 5];

export default function Checkout() {
  const c = useC();
  const router = useRouter();
  const { cook } = useLocalSearchParams<{ cook?: string }>();
  const ck = cook || undefined;
  const { cart, tip, setTip, mode, placeOrder, address, orders, toast, resetOnboarding } = useStore();
  const lines = ck ? cart.filter((l) => lineKey(l) === ck) : cart;
  const t = useTotals(lines, tip, mode);
  const { methods, defaultId, loading: cardsLoading, error: cardsError, refetch: refetchCards } = useSavedCards();
  const [busy, setBusy] = useState(false);
  const [addrSheet, setAddrSheet] = useState(false);
  const [cardSheet, setCardSheet] = useState(false);
  const [cardPayOpen, setCardPayOpen] = useState(false);
  const [cardSecret, setCardSecret] = useState<string | null>(null);
  const [cardOrderId, setCardOrderId] = useState<string | null>(null);
  const [cardTaxCents, setCardTaxCents] = useState(0);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [deliveryInstructions, setDeliveryInstructions] = useState('');
  const [savedCardConfirmOpen, setSavedCardConfirmOpen] = useState(false);
  // Which saved card to charge; `null` = enter a new card. Initialized to the default.
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [saveNewCard, setSaveNewCard] = useState(true);
  const [pickedCard, setPickedCard] = useState(false); // has the user chosen explicitly?
  // One nonce per checkout visit. The final idempotency key also includes every input that
  // defines the order, so an unchanged retry deduplicates while edits after a closed payment
  // sheet cannot accidentally resume an older amount, fulfillment method, address, or tip.
  const [checkoutNonce] = useState(() => `${Date.now().toString(36)}-${Math.round(Math.random() * 1e9).toString(36)}`);
  useEffect(() => {
    if (pickedCard || Platform.OS !== 'web') return;
    if (methods.length > 0) setSelectedCardId(defaultId ?? methods[0].id);
    else setSelectedCardId(null);
  }, [methods, defaultId, pickedCard]);
  const selectedCard = methods.find((mm) => mm.id === selectedCardId) ?? null;
  const checkoutSignature = JSON.stringify({
    kitchen: ck ?? lineKey(lines[0] ?? { cook: '' }),
    items: lines.map((line) => [line.mealUuid, line.qty]),
    mode,
    tip,
    addressId: mode === 'delivery' ? address?.id ?? null : null,
    instructions: mode === 'delivery' ? deliveryInstructions.trim() : '',
    payment: selectedCard?.id ?? `new:${saveNewCard}`,
  });
  const idemKey = useMemo(
    () => `${ck ?? 'cart'}-${checkoutNonce}-${hashCheckoutSignature(checkoutSignature)}`,
    [ck, checkoutNonce, checkoutSignature],
  );
  const theCook = cookOfLine(lines[0] ?? { cook: '', grad: 'g1' });
  const deliveryAddressMissing = mode === 'delivery' && !isCompleteDeliveryAddress(address);
  const finalTotal = t.total + cardTaxCents / 100;

  if (lines.length === 0) {
    return (
      <Screen>
        <TopBar title="Checkout" />
        <Empty icon="cart" title="Nothing to check out" body="This kitchen’s items are no longer in your cart." action={<Btn label="Back to cart" onPress={() => router.replace('/cart')} />} />
      </Screen>
    );
  }

  const place = async () => {
    if (busy) return; // guard against double-fire / double-order
    if (deliveryAddressMissing) {
      setPaymentError(address ? 'Update your delivery address with city, state, postal code, and country before payment.' : 'Add a delivery address before continuing to payment.');
      setAddrSheet(true);
      return;
    }
    const cookId = ck ?? lineKey(lines[0]);
    setPaymentError(null);
    setBusy(true);
    const onError = (e: unknown) => {
      setBusy(false);
      const msg = (e as any)?.message ?? '';
      let customerMessage: string;
      if (msg === 'AUTH_REQUIRED') {
        customerMessage = 'Please sign in again to place your order.';
        toast('Please sign in again to place your order.', 'info');
        resetOnboarding(); // re-show the sign-in gate
      } else if (/no longer available|are unavailable|taking orders|payouts are set up|own kitchen|delivery address|pickup address|valid area|tax|too many attempts|already been paid|could not be recovered|could not be resumed|no longer payable|different kitchen|cart is out of date/i.test(msg)) {
        // Server rejected on live availability (item sold out / kitchen paused / not payout-ready).
        // These messages are already customer-friendly — surface them instead of a generic error
        // so a paused kitchen or sold-out item doesn't read as a payment bug.
        customerMessage = msg;
        toast(msg, 'info');
      } else if (msg === 'Payment canceled') {
        // user backed out of the native sheet — no error toast needed
        customerMessage = '';
      } else {
        customerMessage = msg.includes('card') ? 'Your card couldn’t be charged. Check the details or try another card.' : 'Couldn’t start your payment. Please try again.';
        toast(customerMessage, 'info');
      }
      setPaymentError(customerMessage || null);
    };
    // Web: real order + Stripe.js charge (saved card direct, or a new card via the sheet).
    if (Platform.OS === 'web') {
      try {
        const useSaved = !!selectedCard;
        const { orderId, clientSecret, taxCents } = await createRealOrder({
          cook: cookId, lines, mode, tipDollars: tip,
          idempotencyKey: idemKey,
          savePaymentMethod: useSaved ? false : saveNewCard,
          addressId: mode === 'delivery' ? address?.id : undefined,
          deliveryInstructions: mode === 'delivery' ? deliveryInstructions.trim() || undefined : undefined,
        });
        if (useSaved) {
          // Show the server-calculated tax and final total before directly charging a saved
          // card. New-card and native flows disclose this amount inside Stripe's own sheet.
          setCardOrderId(orderId);
          setCardTaxCents(taxCents);
          setCardSecret(clientSecret);
          setBusy(false);
          setSavedCardConfirmOpen(true);
          return;
        }
        // New card → collect it in the sheet and confirm there.
        setCardOrderId(orderId);
        setCardTaxCents(taxCents);
        setCardSecret(clientSecret);
        setCardPayOpen(true);
        setBusy(false);
        return;
      } catch (e) {
        onError(e);
        return;
      }
    }
    // Native: real order + Stripe's native PaymentSheet (real card entry, real charge).
    try {
      const { orderId, taxCents } = await payWithCard({
        cook: cookId, lines, mode, tipDollars: tip, idempotencyKey: idemKey, savePaymentMethod: false,
        addressId: mode === 'delivery' ? address?.id : undefined,
        deliveryInstructions: mode === 'delivery' ? deliveryInstructions.trim() || undefined : undefined,
      });
      setBusy(false);
      placeOrder(ck, orderId, taxCents);
      router.replace(`/track?cook=${ck ?? ''}&orderId=${orderId}`);
    } catch (e) {
      onError(e);
    }
  };

  const confirmSavedCard = async () => {
    if (busy || !selectedCard || !cardSecret || !cardOrderId) return;
    setBusy(true);
    setPaymentError(null);
    try {
      await confirmSavedCardPayment(cardSecret, selectedCard.id);
      setSavedCardConfirmOpen(false);
      setBusy(false);
      placeOrder(ck, cardOrderId, cardTaxCents);
      router.replace(`/track?cook=${ck ?? ''}&orderId=${cardOrderId}`);
    } catch (e) {
      setSavedCardConfirmOpen(false);
      const msg = (e as any)?.message ?? '';
      const customerMessage = msg.includes('card') ? 'Your card couldn’t be charged. Try another card or check with your bank.' : 'Couldn’t complete your payment. Please try again.';
      setPaymentError(customerMessage);
      toast(customerMessage, 'info');
      setBusy(false);
    }
  };

  // After a real card charge succeeds, mirror into local history + go to tracking.
  const onCardPaid = () => {
    setCardPayOpen(false);
    placeOrder(ck, cardOrderId ?? undefined, cardTaxCents);
    router.replace(`/track?cook=${ck ?? ''}${cardOrderId ? `&orderId=${cardOrderId}` : ''}`);
  };

  return (
    <Screen>
      <TopBar title="Checkout" sub={`From ${theCook.name}`} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <Block title="Your order">
          {lines.map((l, i) => <OrderLineRow key={l.key} line={l} first={i === 0} />)}
        </Block>

        <Block title={mode === 'pickup' ? 'Pick up from' : 'Deliver to'}>
          <View style={{ marginBottom: 14 }}><ModeToggle sm /></View>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.primaryL, alignItems: 'center', justifyContent: 'center' }}><Icon name="pin" size={20} color={c.primary} /></View>
            <View style={{ flex: 1 }}>
              {mode === 'pickup' ? (
                <><Text style={[type(14.5, 800), { color: c.ink }]}>{theCook.kitchen}</Text><Text style={[type(13, 500), { color: c.soft, marginTop: 2 }]}>The kitchen will update your order when it is ready for pickup.</Text></>
              ) : address ? (
                <><Text numberOfLines={1} style={[type(14.5, 800), { color: c.ink }]}>{address.label} · {address.line1}</Text><Text numberOfLines={1} style={[type(13, 500), { color: isCompleteDeliveryAddress(address) ? c.soft : c.red, marginTop: 2 }]}>{[address.line2, addressLocality(address)].filter(Boolean).join(' · ') || 'Complete this address before payment'}</Text></>
              ) : (
                <Text accessibilityRole="alert" style={[type(14, 700), { color: c.red }]}>Delivery address required</Text>
              )}
            </View>
            {mode === 'pickup' ? null : (
              <Press scale={0.9} onPress={() => setAddrSheet(true)} label="Change delivery address"><View style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}><Icon name="chevRight" size={16} color={c.muted} /></View></Press>
            )}
          </View>
        </Block>

        {mode === 'delivery' ? (
          <Block title="Delivery instructions · optional">
            <TextInput
              value={deliveryInstructions}
              onChangeText={(value) => setDeliveryInstructions(value.slice(0, 500))}
              placeholder="Gate code, parking, drop-off details, or how to find your door"
              placeholderTextColor={c.muted}
              multiline
              maxLength={500}
              accessibilityLabel="Delivery instructions"
              style={[type(14, 600), { color: c.ink, minHeight: 88, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, backgroundColor: c.surface, padding: 12, textAlignVertical: 'top' }]}
            />
            <Text style={[type(11.5, 600), { color: c.muted, textAlign: 'right', marginTop: 6 }]}>{deliveryInstructions.length}/500</Text>
          </Block>
        ) : null}

        <Block title="Payment">
          {Platform.OS === 'web' && cardsLoading ? (
            <View style={{ minHeight: 74, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.primary} /></View>
          ) : (
            <PayOption
              icon="card"
              title="Pay online"
              tag="Stripe"
              tagTone="green"
              body={Platform.OS === 'web' && selectedCard ? `${brandName(selectedCard.brand)} •••• ${selectedCard.last4} · secure checkout` : 'Enter a card securely at payment'}
            />
          )}
          {Platform.OS === 'web' && cardsError ? (
            <View accessibilityRole="alert" style={{ marginTop: 10, padding: 12, borderRadius: radius.md, backgroundColor: c.redL, borderWidth: 1, borderColor: c.red }}>
              <Text style={[type(12.5, 700), { color: c.red, lineHeight: 18 }]}>Saved cards could not be loaded. You can retry or continue with a new card.</Text>
              <View style={{ marginTop: 8, alignSelf: 'flex-start' }}><Btn label="Retry saved cards" icon="repeat" variant="ghost" onPress={refetchCards} /></View>
            </View>
          ) : null}
          {Platform.OS === 'web' ? (
            <>
              <Press scale={0.98} onPress={() => setCardSheet(true)} label="Change payment card" disabled={cardsLoading}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 8, marginLeft: 2 }}>
                  <Text style={[type(13, 800), { color: c.accentText }]}>{methods.length > 0 ? 'Change card' : 'Add a card'}</Text>
                  <Icon name="chevRight" size={14} color={c.primary} />
                </View>
              </Press>
              {selectedCard === null ? (
                <Press scale={0.99} onPress={() => setSaveNewCard((v) => !v)} label="Save this card for next time" style={{ marginTop: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: saveNewCard ? c.primary : c.border, backgroundColor: saveNewCard ? c.primaryD : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {saveNewCard ? <Icon name="check" size={13} color="#fff" /> : null}
                    </View>
                    <Text style={[type(13, 700), { color: c.soft }]}>Save this card for next time</Text>
                  </View>
                </Press>
              ) : null}
            </>
          ) : null}
        </Block>

        <Block title="Add a tip · goes 100% to the cook">
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {TIPS.map((v) => {
              const on = tip === v;
              return (
                <Press key={v} scale={0.95} onPress={() => setTip(v)} style={{ flex: 1 }} label={`${v === 0 ? 'No tip' : `${money(v)} tip`}${on ? ', selected' : ''}`} selected={on}>
                  <View style={{ height: 44, borderRadius: radius.sm, borderWidth: 1.5, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primaryL : c.surface, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={[type(14, 800), { color: on ? c.primaryD : c.soft }]}>{v === 0 ? 'None' : money(v)}</Text>
                  </View>
                </Press>
              );
            })}
          </View>
        </Block>

        <Summary t={t} mode={mode} />
        {paymentError ? (
          <View accessibilityRole="alert" style={{ marginHorizontal: 16, marginTop: 2, padding: 14, borderRadius: radius.md, backgroundColor: c.redL, borderWidth: 1, borderColor: c.red }}>
            <Text style={[type(13.5, 700), { color: c.redD, lineHeight: 20 }]}>{paymentError}</Text>
          </View>
        ) : null}
      </ScrollView>

      <Dock>
        <DockTotal label="Before tax" value={money(t.total)} />
        <Btn
          label={cardsLoading && Platform.OS === 'web' ? 'Loading payment methods…' : deliveryAddressMissing ? 'Add delivery address' : selectedCard ? 'Review and pay' : 'Continue to secure payment'}
          flex={1}
          loading={busy}
          disabled={cardsLoading && Platform.OS === 'web'}
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
      <CardPaymentSheet visible={cardPayOpen} clientSecret={cardSecret} amountLabel={money(finalTotal)} onPaid={onCardPaid} onClose={() => setCardPayOpen(false)} />
      <Dialog visible={savedCardConfirmOpen} onClose={busy ? () => {} : () => setSavedCardConfirmOpen(false)} title="Confirm your total">
        <Text style={[type(14, 600), { color: c.soft, lineHeight: 21 }]}>Sales tax is calculated for your location before payment. Review the final amount before we charge your saved card.</Text>
        <View style={{ gap: 8, paddingVertical: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={[type(14, 600), { color: c.soft }]}>Sales tax</Text><Text style={[type(14, 800), { color: c.ink }]}>{money(cardTaxCents / 100)}</Text></View>
          <View style={{ height: 1, backgroundColor: c.border }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={[type(16, 800), { color: c.ink }]}>Final total</Text><Text style={[type(18, 900), { color: c.ink }]}>{money(finalTotal)}</Text></View>
        </View>
        <Btn label={`Pay ${money(finalTotal)}`} icon="lock" block loading={busy} onPress={confirmSavedCard} />
        <Btn label="Choose another card" variant="ghost" block disabled={busy} onPress={() => { setSavedCardConfirmOpen(false); setCardSheet(true); }} />
      </Dialog>
    </Screen>
  );
}

/** Compact, deterministic client fingerprint. The server remains authoritative for all values. */
function hashCheckoutSignature(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/** Informational payment-method row — Stripe is the only method (COD was retired), so this
 *  is a confirmation summary, not a selector; no radio affordance for a choice that doesn't exist. */
function PayOption({ icon, title, tag, tagTone, body }: { icon: string; title: string; tag: string; tagTone: 'green' | 'purple'; body: string }) {
  const c = useC();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1.5, borderColor: c.primary, backgroundColor: c.primaryL, borderRadius: radius.md }}>
      <View style={{ width: 42, height: 42, borderRadius: 11, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={20} color={c.primary} /></View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><Text style={[type(14.5, 800), { color: c.ink }]}>{title}</Text><MiniTag label={tag} tone={tagTone} /></View>
        <Text style={[type(12, 500), { color: c.soft, marginTop: 3 }]}>{body}</Text>
      </View>
      <Icon name="check" size={18} color={c.primaryD} />
    </View>
  );
}
