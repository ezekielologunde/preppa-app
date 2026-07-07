import { Platform } from 'react-native';
import { supabase, ensureAuth, KITCHEN_ID, MEAL_ID, STRIPE_PK } from './supabase';
import type { CartLine } from '../store/store';

/**
 * Real (test-mode) card charge for one cook's cart.
 * Flow: sign in -> create-order edge function (real PaymentIntent) -> confirm with
 * Stripe.js using a test payment method. Web-only for now (@stripe/stripe-js is a
 * browser SDK); native throws and the caller falls back to the mock.
 * Returns the Supabase order id on success.
 */
export async function payWithCard(opts: {
  cook: string;
  lines: CartLine[];
  mode: 'delivery' | 'pickup';
  tipDollars: number;
  idempotencyKey: string;
}): Promise<{ orderId: string }> {
  if (Platform.OS !== 'web') throw new Error('card payment is web-only for now');

  const kitchenId = KITCHEN_ID[opts.cook];
  if (!kitchenId) throw new Error(`no kitchen mapping for ${opts.cook}`);

  const items = opts.lines.map((l) => {
    const mealId = MEAL_ID[l.key];
    if (!mealId) throw new Error(`no meal mapping for ${l.key}`);
    return { mealId, qty: l.qty };
  });

  await ensureAuth();

  const { data, error } = await supabase.functions.invoke('create-order', {
    body: {
      kitchenId,
      items,
      fulfillment: opts.mode,
      method: 'card',
      tipCents: Math.round(opts.tipDollars * 100),
      idempotencyKey: opts.idempotencyKey,
    },
  });
  if (error) throw error;
  if (!data?.clientSecret) throw new Error(data?.error || 'no client secret from create-order');

  const { loadStripe } = await import('@stripe/stripe-js');
  const stripe = await loadStripe(STRIPE_PK);
  if (!stripe) throw new Error('Stripe.js failed to load');

  const res = await stripe.confirmCardPayment(data.clientSecret, { payment_method: 'pm_card_visa' });
  if (res.error) throw new Error(res.error.message || 'card payment failed');

  return { orderId: data.orderId as string };
}
