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
export async function getMyKitchen(): Promise<{ id: string; verification_status: string } | null> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) return null;
  const { data } = await supabase
    .from('kitchens')
    .select('id, verification_status')
    .eq('owner_id', uid)
    .order('created_at', { ascending: false })
    .limit(1);
  return (data?.[0] as any) ?? null;
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

/** Cash out the kitchen's available ledger balance to the cook's account. Returns cents paid. */
export async function cashOut(kitchenId: string): Promise<number> {
  const { data, error } = await supabase.functions.invoke('connect-payout', { body: { kitchenId } });
  if (error || data?.error) throw new Error(data?.error || error?.message || 'Payout failed.');
  return Number(data?.amountCents ?? 0);
}

/** The kitchen's available (unpaid-out) balance in cents, from the ledger. */
export async function getKitchenBalanceCents(kitchenId: string): Promise<number> {
  const { data, error } = await supabase.rpc('kitchen_balance_cents', { kid: kitchenId });
  if (error) return 0;
  return Number(data) || 0;
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
