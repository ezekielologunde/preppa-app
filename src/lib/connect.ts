import { Platform } from 'react-native';
import { supabase } from './supabase';

/**
 * Stripe Connect (Express) — Preppa is the payment hub. Cooks don't set up their own
 * Stripe; a Stripe-hosted onboarding verifies their identity (KYC) and sets up payouts.
 * Earnings accrue in the ledger (net of the Stripe fee) and the cook cashes out anytime.
 */

export interface ConnectStatus {
  onboarded: boolean; // details submitted to Stripe
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}

/** The signed-in cook's most recent kitchen (for onboarding / status / payout). */
export async function getMyKitchen(): Promise<{ id: string; verification_status: string; supports_delivery: boolean; supports_pickup: boolean } | null> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) return null;
  const { data } = await supabase
    .from('kitchens')
    .select('id, verification_status, supports_delivery, supports_pickup')
    .eq('owner_id', uid)
    .order('created_at', { ascending: false })
    .limit(1);
  return (data?.[0] as any) ?? null;
}

/** Persist which fulfillment methods this kitchen supports — feeds the customer-facing
 *  Home delivery/pickup toggle's real filter (kitchens.supports_delivery/supports_pickup). */
export async function setKitchenFulfillment(kitchenId: string, delivery: boolean, pickup: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_kitchen_fulfillment', { p_kitchen_id: kitchenId, p_delivery: delivery, p_pickup: pickup });
  if (error) throw new Error(error.message || 'Could not update fulfillment settings.');
}

/** Create/reuse the cook's Express account and open the Stripe onboarding flow. */
export async function startConnectOnboarding(kitchenId: string): Promise<void> {
  const web = Platform.OS === 'web' && typeof window !== 'undefined';
  const returnUrl = web ? `${window.location.origin}/my-hub?connect=return` : undefined;
  const refreshUrl = web ? `${window.location.origin}/my-hub?connect=refresh` : undefined;
  const { data, error } = await supabase.functions.invoke('connect-onboard', { body: { kitchenId, returnUrl, refreshUrl } });
  if (error || !data?.url) throw new Error(data?.error || error?.message || 'Could not start payout setup.');
  const url = data.url as string;
  if (web) {
    window.location.href = url; // returns to /my-hub?connect=return
  } else {
    const { Linking } = await import('react-native');
    await Linking.openURL(url);
  }
}

/** Sync + return the cook's Connect onboarding status from Stripe. */
export async function refreshConnectStatus(kitchenId: string): Promise<ConnectStatus> {
  const { data, error } = await supabase.functions.invoke('connect-status', { body: { kitchenId } });
  if (error) throw new Error(error.message);
  return {
    onboarded: !!data?.onboarded,
    chargesEnabled: !!data?.chargesEnabled,
    payoutsEnabled: !!data?.payoutsEnabled,
    detailsSubmitted: !!data?.detailsSubmitted,
  };
}

export interface CashOutResult {
  /** Cents actually transferred. 0 when `pending` is true — the amount is still reserved. */
  amountCents: number;
  /** True when Stripe's response was ambiguous — the reconcile-payouts worker resolves it
   *  automatically within a few minutes; the cook should not retry. */
  pending: boolean;
}

/** Cash out the kitchen's available ledger balance to the cook's account. */
export async function cashOut(kitchenId: string): Promise<CashOutResult> {
  const { data, error } = await supabase.functions.invoke('connect-payout', { body: { kitchenId } });
  if (data?.pending) return { amountCents: 0, pending: true };
  if (error || data?.error) throw new Error(data?.error || error?.message || 'Payout failed.');
  return { amountCents: Number(data?.amountCents ?? 0), pending: false };
}

/** The kitchen's available (unpaid-out) balance in cents, from the ledger. */
export async function getKitchenBalanceCents(kitchenId: string): Promise<number> {
  const { data, error } = await supabase.rpc('kitchen_balance_cents', { kid: kitchenId });
  if (error) throw new Error(error.message || 'Could not load your balance.');
  return Number(data) || 0;
}

export interface PayoutSummary {
  availableCents: number;
  pendingCents: number;
  paidTotalCents: number;
}

/** Available / pending / lifetime-paid totals for the money screen's summary row. */
export async function getPayoutSummary(kitchenId: string): Promise<PayoutSummary> {
  const { data, error } = await supabase.rpc('my_payout_summary', { p_kitchen_id: kitchenId }).maybeSingle();
  if (error) throw new Error(error.message || 'Could not load your payout summary.');
  return {
    availableCents: Number((data as any)?.available_cents ?? 0),
    pendingCents: Number((data as any)?.pending_cents ?? 0),
    paidTotalCents: Number((data as any)?.paid_total_cents ?? 0),
  };
}

export type PayoutStatus = 'pending' | 'paid' | 'failed' | 'needs_review';

export interface PayoutHistoryEntry {
  id: string;
  amountCents: number;
  status: PayoutStatus;
  source: 'manual' | 'auto';
  createdAt: string;
  reconciledAt: string | null;
  failureReason: string | null;
}

/** Recent payouts for this kitchen, newest first. */
export async function getPayoutHistory(kitchenId: string, limit = 50): Promise<PayoutHistoryEntry[]> {
  const { data, error } = await supabase.rpc('my_payouts', { p_kitchen_id: kitchenId, p_limit: limit });
  if (error) throw new Error(error.message || 'Could not load your payout history.');
  return (data ?? []).map((r: any) => ({
    id: r.id,
    amountCents: Number(r.amount_cents) || 0,
    status: r.status,
    source: r.source,
    createdAt: r.created_at,
    reconciledAt: r.reconciled_at,
    failureReason: r.failure_reason,
  }));
}

/** The cook's current automatic-payout preferences. */
export async function getPayoutPreferences(kitchenId: string): Promise<{ autoEnabled: boolean; minCents: number }> {
  const { data } = await supabase
    .from('stripe_accounts')
    .select('auto_payout_enabled, auto_payout_min_cents')
    .eq('kitchen_id', kitchenId)
    .maybeSingle();
  return { autoEnabled: data?.auto_payout_enabled ?? true, minCents: data?.auto_payout_min_cents ?? 2000 };
}

/** Save the cook's automatic-payout preferences (opt in/out, minimum amount). */
export async function setPayoutPreferences(kitchenId: string, autoEnabled: boolean, minCents: number): Promise<void> {
  const { error } = await supabase.rpc('set_payout_preferences', { p_kitchen_id: kitchenId, p_auto_enabled: autoEnabled, p_min_cents: minCents });
  if (error) throw new Error(error.message || 'Could not update your payout preferences.');
}

/** How often Stripe deposits this kitchen's connected-account balance to their bank. */
export async function setStripePayoutSchedule(kitchenId: string, interval: 'daily' | 'weekly' | 'manual'): Promise<void> {
  const { data, error } = await supabase.functions.invoke('connect-payout-settings', { body: { kitchenId, interval } });
  if (error || data?.error) throw new Error(data?.error || error?.message || 'Could not update payout schedule.');
}

/** Open the cook's Stripe Express Dashboard to manage their bank account/debit card. Returns
 *  true if a dashboard link was opened, false if they still need to finish onboarding first
 *  (caller should fall back to startConnectOnboarding). */
export async function openPayoutDashboard(kitchenId: string): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke('connect-dashboard-link', { body: { kitchenId } });
  if (error || data?.error) throw new Error(data?.error || error?.message || 'Could not open your payout dashboard.');
  if (data?.needsOnboarding) return false;
  const url = data?.url as string;
  if (!url) throw new Error('Could not open your payout dashboard.');
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(url, '_blank');
  } else {
    const { Linking } = await import('react-native');
    await Linking.openURL(url);
  }
  return true;
}

/** The kitchen's real, server-side availability ('open' means orderable). */
export async function getKitchenAvailability(kitchenId: string): Promise<boolean> {
  const { data, error } = await supabase.from('kitchens').select('availability').eq('id', kitchenId).maybeSingle();
  if (error || !data) return false;
  return data.availability === 'open';
}

/** Persist the vacation-mode toggle to the database (was previously local-device-only state). */
export async function setKitchenAvailability(kitchenId: string, open: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_kitchen_availability', { p_kitchen_id: kitchenId, p_open: open });
  if (error) throw new Error(error.message || 'Could not update availability.');
}
