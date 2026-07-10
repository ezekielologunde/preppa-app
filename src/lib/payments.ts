import { Platform } from 'react-native';
import type { Stripe } from '@stripe/stripe-js';
import { supabase, ensureAuth, KITCHEN_ID, MEAL_ID, STRIPE_PK } from './supabase';
import type { CartLine } from '../store/store';

export interface OrderOpts {
  cook: string;
  lines: CartLine[];
  mode: 'delivery' | 'pickup';
  tipDollars: number;
  idempotencyKey: string;
  /** Save the card used for this order to the buyer's Stripe Customer (new-card path). */
  savePaymentMethod?: boolean;
}

/** A tokenized saved card (Stripe PaymentMethod) — no PAN, only display fields. */
export interface SavedCard {
  id: string;
  brand: string;
  last4: string;
  expMonth: number | null;
  expYear: number | null;
}

/** Load Stripe.js once (web-only; @stripe/stripe-js is a browser SDK). */
let _stripe: Promise<Stripe | null> | null = null;
export function getStripe(): Promise<Stripe | null> {
  if (Platform.OS !== 'web') throw new Error('Stripe.js is web-only');
  if (!_stripe) _stripe = import('@stripe/stripe-js').then((m) => m.loadStripe(STRIPE_PK));
  return _stripe;
}

/**
 * Create a real (test-mode) order + PaymentIntent via the `create-order` edge
 * function and return its client secret for confirmation with a real card.
 */
export async function createRealOrder(opts: OrderOpts): Promise<{ orderId: string; clientSecret: string }> {
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
      savePaymentMethod: opts.savePaymentMethod ?? false,
    },
  });
  if (error) throw error;
  if (!data?.clientSecret) throw new Error(data?.error || 'no client secret from create-order');
  return { orderId: data.orderId as string, clientSecret: data.clientSecret as string };
}

// ---- Saved cards (Stripe Customer + SetupIntent; web-only, like the rest of the
// real payment path). Each call re-auths as the current user; the `payment-methods`
// edge function scopes every action to that user's own Stripe Customer. ----

async function pmAction<T>(action: string, extra: Record<string, unknown> = {}): Promise<T> {
  await ensureAuth();
  const { data, error } = await supabase.functions.invoke('payment-methods', { body: { action, ...extra } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as T;
}

/** Create a SetupIntent to save a new card; returns the client secret to confirm with Stripe.js. */
export async function createSetupIntent(): Promise<{ clientSecret: string }> {
  return pmAction<{ clientSecret: string }>('setup-intent');
}

/** List the buyer's saved cards + which is the default. */
export async function listPaymentMethods(): Promise<{ methods: SavedCard[]; defaultId: string | null }> {
  const data = await pmAction<{ methods: SavedCard[]; defaultId: string | null }>('list');
  return { methods: data.methods ?? [], defaultId: data.defaultId ?? null };
}

/** Remove a saved card. */
export async function detachPaymentMethod(paymentMethodId: string): Promise<void> {
  await pmAction('detach', { paymentMethodId });
}

/** Make a saved card the buyer's default. */
export async function setDefaultPaymentMethod(paymentMethodId: string): Promise<void> {
  await pmAction('default', { paymentMethodId });
}

/** Confirm the given order's PaymentIntent with an already-saved card (no retype). Web-only. */
export async function confirmSavedCardPayment(clientSecret: string, paymentMethodId: string): Promise<void> {
  if (Platform.OS !== 'web') throw new Error('card payment is web-only for now');
  const stripe = await getStripe();
  if (!stripe) throw new Error('Stripe.js failed to load');
  const res = await stripe.confirmCardPayment(clientSecret, { payment_method: paymentMethodId });
  if (res.error) throw new Error(res.error.message || 'card payment failed');
}

/**
 * Real (test-mode) card charge for one cook's cart.
 * Flow: sign in -> create-order edge function (real PaymentIntent) -> confirm with
 * Stripe.js using a test payment method. Web-only for now (@stripe/stripe-js is a
 * browser SDK); native throws and the caller falls back to the mock.
 * Returns the Supabase order id on success.
 */
export async function payWithCard(opts: OrderOpts): Promise<{ orderId: string }> {
  if (Platform.OS !== 'web') throw new Error('card payment is web-only for now');
  const { orderId, clientSecret } = await createRealOrder(opts);
  const stripe = await getStripe();
  if (!stripe) throw new Error('Stripe.js failed to load');
  const res = await stripe.confirmCardPayment(clientSecret, { payment_method: 'pm_card_visa' });
  if (res.error) throw new Error(res.error.message || 'card payment failed');
  return { orderId };
}
