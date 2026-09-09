import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Platform } from 'react-native';
import type { Stripe, StripeCardElement, StripePaymentRequestButtonElement, PaymentRequest } from '@stripe/stripe-js';
import { useC } from '../theme/ThemeContext';
import { type, radius } from '../theme/theme';
import { Btn, Sheet } from '../ui';
import { getStripe } from '../lib/payments';
import { STRIPE_PK } from '../lib/supabase';

/** amountLabel is always a `money()`-formatted "$X.XX" string (see call sites) — parsed back
 *  to integer cents here rather than threading a second numeric prop through all 9 call sites
 *  for a feature (Payment Request Button) that only needs it internally. */
function labelToCents(label: string): number {
  const n = Math.round(parseFloat(label.replace(/[^0-9.]/g, '')) * 100);
  return Number.isFinite(n) ? n : 0;
}

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
  const prMountRef = useRef<View | null>(null);
  const stripeRef = useRef<Stripe | null>(null);
  const cardRef = useRef<StripeCardElement | null>(null);
  const prButtonRef = useRef<StripePaymentRequestButtonElement | null>(null);
  const prRef = useRef<PaymentRequest | null>(null);
  const [ready, setReady] = useState(false);
  const [walletReady, setWalletReady] = useState(false);
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

        // Apple Pay / Google Pay via Stripe's Payment Request Button — only for an actual
        // charge (mode 'pay'); the 'save card' flows pass amountLabel="" and skip this
        // entirely, since a $0 wallet sheet makes no sense. canMakePayment() resolves null
        // when the browser/device has no usable wallet, so the button silently never
        // appears there — no platform-detection branching needed here.
        if (mode === 'pay' && amountLabel) {
          const amountCents = labelToCents(amountLabel);
          if (amountCents > 0) {
            const pr = stripe.paymentRequest({
              country: 'US',
              currency: 'usd',
              total: { label: 'Preppa order', amount: amountCents },
              requestPayerName: true,
              requestPayerEmail: true,
            });
            const canPay = await pr.canMakePayment();
            if (!cancelled && canPay) {
              const prButtonNode = prMountRef.current as unknown as HTMLElement | null;
              if (prButtonNode) {
                const prButton = elements.create('paymentRequestButton', { paymentRequest: pr });
                prButton.mount(prButtonNode);
                prButtonRef.current = prButton;
                prRef.current = pr;
                pr.on('paymentmethod', async (ev) => {
                  const { paymentIntent, error } = await stripe.confirmCardPayment(
                    clientSecret,
                    { payment_method: ev.paymentMethod.id },
                    { handleActions: false },
                  );
                  if (error) {
                    ev.complete('fail');
                    setErr(error.message || 'Payment failed');
                    return;
                  }
                  ev.complete('success');
                  if (paymentIntent?.status === 'requires_action') {
                    const { error: actionError } = await stripe.confirmCardPayment(clientSecret);
                    if (actionError) { setErr(actionError.message || 'Payment failed'); return; }
                  }
                  onPaid();
                });
                if (!cancelled) setWalletReady(true);
              }
            }
          }
        }
      } catch {
        if (!cancelled) setErr('Couldn’t load the card form.');
      }
    }, 60);
    return () => {
      cancelled = true;
      clearTimeout(t);
      try { cardRef.current?.unmount(); } catch {}
      try { prButtonRef.current?.unmount(); } catch {}
      cardRef.current = null;
      prButtonRef.current = null;
      prRef.current = null;
      setReady(false);
      setWalletReady(false);
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
          {mode === 'pay' ? (
            <View style={{ height: walletReady ? 44 : 0, marginBottom: walletReady ? 14 : 0, overflow: 'hidden' }}>
              <View ref={prMountRef} style={{ minHeight: 44 }} />
            </View>
          ) : null}
          {walletReady ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: c.border2 }} />
              <Text style={[type(11.5, 700), { color: c.muted }]}>Or pay with card</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: c.border2 }} />
            </View>
          ) : null}
          <View
            ref={mountRef}
            style={{ minHeight: 46, borderWidth: 1.5, borderColor: c.border, borderRadius: radius.md, backgroundColor: c.bg2, paddingHorizontal: 14, justifyContent: 'center' }}
          />
          <Text style={[type(11.5, 600), { color: c.muted, marginTop: 8 }]}>
            {STRIPE_PK.startsWith('pk_live_') ? 'Your card is charged securely via Stripe.' : 'Test mode — use 4242 4242 4242 4242, any future date, any CVC.'}
          </Text>
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
