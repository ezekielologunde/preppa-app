import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Platform } from 'react-native';
import type { Stripe, StripeCardElement } from '@stripe/stripe-js';
import { useC } from '../theme/ThemeContext';
import { type, radius } from '../theme/theme';
import { Btn, Sheet } from '../ui';
import { getStripe } from '../lib/payments';

/**
 * Real card entry (web only) — mounts a Stripe Elements Card into the shared
 * Sheet and confirms the PaymentIntent with the card the buyer types. Native
 * falls back to a message (native uses @stripe/stripe-react-native later).
 */
export function CardPaymentSheet({
  visible,
  clientSecret,
  amountLabel,
  onPaid,
  onClose,
  mode = 'pay',
}: {
  visible: boolean;
  clientSecret: string | null;
  amountLabel: string;
  /** Called after a successful confirm (payment succeeded, or card saved in `save` mode). */
  onPaid: () => void;
  onClose: () => void;
  /** `pay` confirms a PaymentIntent; `save` confirms a SetupIntent to store the card. */
  mode?: 'pay' | 'save';
}) {
  const c = useC();
  const mountRef = useRef<View | null>(null);
  const stripeRef = useRef<Stripe | null>(null);
  const cardRef = useRef<StripeCardElement | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || !visible || !clientSecret) return;
    let cancelled = false;
    // small delay so the Modal portal DOM node exists before mounting the Element
    const t = setTimeout(async () => {
      try {
        const stripe = await getStripe();
        if (cancelled || !stripe) return;
        stripeRef.current = stripe;
        const node = mountRef.current as unknown as HTMLElement | null;
        if (!node) return;
        const elements = stripe.elements();
        const card = elements.create('card', {
          style: { base: { fontSize: '16px', color: c.ink, '::placeholder': { color: c.muted } } },
        });
        card.mount(node);
        card.on('change', (e) => setErr(e.error?.message ?? null));
        cardRef.current = card;
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) setErr('Couldn’t load the card form.');
      }
    }, 60);
    return () => {
      cancelled = true;
      clearTimeout(t);
      try { cardRef.current?.unmount(); } catch {}
      cardRef.current = null;
      setReady(false);
      setErr(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, clientSecret]);

  const pay = async () => {
    if (busy || !stripeRef.current || !cardRef.current || !clientSecret) return;
    setBusy(true);
    setErr(null);
    const res =
      mode === 'save'
        ? await stripeRef.current.confirmCardSetup(clientSecret, { payment_method: { card: cardRef.current } })
        : await stripeRef.current.confirmCardPayment(clientSecret, { payment_method: { card: cardRef.current } });
    setBusy(false);
    if (res.error) { setErr(res.error.message || (mode === 'save' ? 'Could not save the card' : 'Payment failed')); return; }
    onPaid();
  };

  return (
    <Sheet visible={visible} onClose={busy ? () => {} : onClose} title={mode === 'save' ? 'Add a card' : 'Pay with card'}>
      {Platform.OS === 'web' ? (
        <>
          <View
            ref={mountRef}
            style={{ minHeight: 46, borderWidth: 1.5, borderColor: c.border, borderRadius: radius.md, backgroundColor: c.bg2, paddingHorizontal: 14, justifyContent: 'center' }}
          />
          <Text style={[type(11.5, 600), { color: c.muted, marginTop: 8 }]}>Test mode — use 4242 4242 4242 4242, any future date, any CVC.</Text>
          {err ? <Text style={[type(13, 700), { color: c.red, marginTop: 8 }]}>{err}</Text> : null}
          <View style={{ marginTop: 14 }}>
            <Btn label={mode === 'save' ? 'Save card' : `Pay ${amountLabel}`} icon="lock" block loading={busy} disabled={!ready} onPress={pay} />
          </View>
        </>
      ) : (
        <Text style={[type(14, 600), { color: c.soft, paddingVertical: 16 }]}>Card payment is available on the web app for now.</Text>
      )}
    </Sheet>
  );
}
