import { Platform } from 'react-native';
import type { Stripe } from '@stripe/stripe-js';
import { confirmPayment, initPaymentSheet, presentPaymentSheet } from './nativeStripe';
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
 * Create a real order + PaymentIntent via the `create-order` edge function and
 * return its client secret for confirmation with a real card.
 */
export async function createRealOrder(opts: OrderOpts): Promise<{ orderId: string; clientSecret: string }> {
  // Prefer the real DB UUIDs carried on the cart (Supabase catalog); fall back to
  // the static key->UUID map only for items without them (add-ons, reordered lines).
  const kitchenId = opts.lines.find((l) => l.kitchenUuid)?.kitchenUuid ?? KITCHEN_ID[opts.cook];
  if (!kitchenId) throw new Error(`no kitchen for ${opts.cook}`);
  const items = opts.lines.map((l) => {
    const mealId = l.mealUuid ?? MEAL_ID[l.key];
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

/** Native-only: a short-lived ephemeral key so PaymentSheet can show/reuse this buyer's
 *  saved cards (never expose the raw Stripe Customer id to the client for this purpose). */
export async function createEphemeralKey(): Promise<{ customerId: string; ephemeralKeySecret: string }> {
  return pmAction<{ customerId: string; ephemeralKeySecret: string }>('ephemeral-key');
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

/** Confirm the given order's PaymentIntent with an already-saved card (no retype). */
export async function confirmSavedCardPayment(clientSecret: string, paymentMethodId: string): Promise<void> {
  if (Platform.OS === 'web') {
    const stripe = await getStripe();
    if (!stripe) throw new Error('Stripe.js failed to load');
    const res = await stripe.confirmCardPayment(clientSecret, { payment_method: paymentMethodId });
    if (res.error) throw new Error(res.error.message || 'card payment failed');
    return;
  }
  const { error } = await confirmPayment(clientSecret, {
    paymentMethodType: 'Card',
    paymentMethodData: { paymentMethodId },
  });
  if (error) throw new Error(error.message || 'card payment failed');
}

/**
 * Real card charge for one cook's cart, native only.
 * Web checkout collects the card itself (CardPaymentSheet / saved-card picker in
 * checkout.tsx) rather than calling this — there is no legitimate web caller. Native:
 * create-order edge function (real PaymentIntent) -> Stripe's native PaymentSheet, a real
 * card-entry UI. Returns the Supabase order id on success.
 */
export async function payWithCard(opts: OrderOpts): Promise<{ orderId: string }> {
  if (Platform.OS === 'web') throw new Error('payWithCard is native-only — web checkout collects the card itself');
  const { orderId, clientSecret } = await createRealOrder(opts);
  // Fetch a fresh ephemeral key per checkout (Stripe's own recommendation — they're
  // short-lived and single-purpose) so PaymentSheet shows this buyer's saved cards.
  // Best-effort: a failure here still lets the sheet collect a brand-new card.
  const cust = await createEphemeralKey().catch(() => null);
  const init = await initPaymentSheet({
    paymentIntentClientSecret: clientSecret,
    merchantDisplayName: 'Preppa',
    customerId: cust?.customerId,
    customerEphemeralKeySecret: cust?.ephemeralKeySecret,
  });
  if (init.error) throw new Error(init.error.message || 'could not open payment sheet');
  const present = await presentPaymentSheet();
  if (present.error) {
    if (present.error.code === 'Canceled') throw new Error('Payment canceled');
    throw new Error(present.error.message || 'card payment failed');
  }
  return { orderId };
}
