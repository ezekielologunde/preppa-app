import { supabase, ensureAuth } from './supabase';

// PrepPlus membership client. Purchase/manage go through edge functions (Stripe-native
// recurring on Preppa); entitlement + fee waivers are enforced SERVER-SIDE — nothing here
// is a trust boundary. Reads go through the memberships RLS (select-own).

export interface Membership {
  status: string; // active | trialing | past_due | canceled | unpaid | incomplete | paused
  planInterval: 'month' | 'year' | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialConsumed: boolean;
}

/** True when the membership currently grants perks (mirrors is_prepplus_member; cosmetic). */
export function membershipActive(m: Membership | null): boolean {
  if (!m) return false;
  const now = Date.now();
  const periodOk = !m.currentPeriodEnd || new Date(m.currentPeriodEnd).getTime() > now;
  return (m.status === 'active' || m.status === 'trialing') && periodOk;
}

export const PREPPLUS_MONTHLY_CENTS = 999;
export const PREPPLUS_ANNUAL_CENTS = 8900;

/** Invoke a PrepPlus edge fn and surface its `{ error, code }` body reliably (even on non-2xx). */
async function invokePrepplus(fn: string, body: Record<string, unknown>): Promise<any> {
  await ensureAuth();
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (!error && !data?.error) return data;
  let payload: any = data;
  const ctx = (error as any)?.context;
  if (ctx && typeof ctx.json === 'function') {
    try { payload = await ctx.json(); } catch { /* keep data */ }
  }
  const e: any = new Error(payload?.error || (error as any)?.message || 'Something went wrong.');
  e.code = payload?.code; // e.g. 'no_card', 'charge_failed'
  throw e;
}

/**
 * Start a PrepPlus membership. Throws with `err.code === 'no_card'` when the caller has no
 * saved card (the UI should route to add one, then retry). A 7-day trial is applied
 * automatically the first time (server-tracked via trial_consumed).
 */
export async function subscribeToPrepPlus(interval: 'month' | 'year', paymentMethodId?: string): Promise<{ status: string; trial: boolean }> {
  const data = await invokePrepplus('subscribe-prepplus', { interval, paymentMethodId });
  return { status: data.status as string, trial: !!data.trial };
}

/** Cancel (at period end), resume, or switch monthly<->annual. */
export async function manageMembership(action: 'cancel' | 'resume' | 'switch', interval?: 'month' | 'year'): Promise<{ status: string; cancelAtPeriodEnd: boolean }> {
  const data = await invokePrepplus('manage-prepplus', { action, ...(interval ? { interval } : {}) });
  return { status: data.status as string, cancelAtPeriodEnd: !!data.cancelAtPeriodEnd };
}

/** The caller's current membership row (RLS select-own), or null if never subscribed. */
export async function fetchMembership(): Promise<Membership | null> {
  await ensureAuth();
  const { data } = await supabase.from('memberships')
    .select('status, plan_interval, current_period_end, cancel_at_period_end, trial_consumed')
    .maybeSingle();
  if (!data) return null;
  return {
    status: data.status as string,
    planInterval: (data.plan_interval as 'month' | 'year' | null) ?? null,
    currentPeriodEnd: (data.current_period_end as string) ?? null,
    cancelAtPeriodEnd: !!data.cancel_at_period_end,
    trialConsumed: !!data.trial_consumed,
  };
}
