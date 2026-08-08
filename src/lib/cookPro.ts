import { supabase, ensureAuth } from './supabase';

// Preppa Pro (cook membership) client. Mirrors src/lib/membership.ts (customer PrepPlus)
// exactly, kitchen-scoped instead of user-scoped — see cook_memberships / is_cook_pro_member
// (migration high_add_cook_pro_membership) for why. Purchase/manage go through edge
// functions (Stripe-native recurring on Preppa); entitlement + fee discount + priority
// placement are enforced SERVER-SIDE — nothing here is a trust boundary.

export interface CookMembership {
  status: string; // active | trialing | past_due | canceled | unpaid | incomplete | paused
  planInterval: 'month' | 'year' | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialConsumed: boolean;
}

export function cookMembershipActive(m: CookMembership | null): boolean {
  if (!m) return false;
  const now = Date.now();
  const periodOk = !m.currentPeriodEnd || new Date(m.currentPeriodEnd).getTime() > now;
  return (m.status === 'active' || m.status === 'trialing') && periodOk;
}

export const COOK_PRO_MONTHLY_CENTS = 999;
export const COOK_PRO_ANNUAL_CENTS = 8900;

async function invokeCookPro(fn: string, body: Record<string, unknown>): Promise<any> {
  await ensureAuth();
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (!error && !data?.error) return data;
  let payload: any = data;
  const ctx = (error as any)?.context;
  if (ctx && typeof ctx.json === 'function') {
    try { payload = await ctx.json(); } catch { /* keep data */ }
  }
  const e: any = new Error(payload?.error || (error as any)?.message || 'Something went wrong.');
  e.code = payload?.code;
  throw e;
}

/**
 * Start a Preppa Pro membership for a kitchen the caller owns. Throws with
 * `err.code === 'no_card'` when there's no saved card yet (route to add one, then retry).
 * A 7-day trial applies automatically the first time per kitchen (server-tracked).
 */
export async function subscribeToCookPro(kitchenId: string, interval: 'month' | 'year', paymentMethodId?: string): Promise<{ status: string; trial: boolean }> {
  const data = await invokeCookPro('subscribe-cook-pro', { kitchenId, interval, paymentMethodId });
  return { status: data.status as string, trial: !!data.trial };
}

/** Cancel (at period end), resume, or switch monthly<->annual for a kitchen's membership. */
export async function manageCookPro(kitchenId: string, action: 'cancel' | 'resume' | 'switch', interval?: 'month' | 'year'): Promise<{ status: string; cancelAtPeriodEnd: boolean }> {
  const data = await invokeCookPro('manage-cook-pro', { kitchenId, action, ...(interval ? { interval } : {}) });
  return { status: data.status as string, cancelAtPeriodEnd: !!data.cancelAtPeriodEnd };
}

/** The kitchen's current membership row (RLS select-own via is_kitchen_owner), or null. */
export async function fetchCookMembership(kitchenId: string): Promise<CookMembership | null> {
  await ensureAuth();
  const { data } = await supabase.from('cook_memberships')
    .select('status, plan_interval, current_period_end, cancel_at_period_end, trial_consumed')
    .eq('kitchen_id', kitchenId)
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

export interface CookProSalesSummary {
  revenueCents: number;
  orderCount: number;
  avgOrderCents: number;
  topMealName: string | null;
  topMealQty: number | null;
}

/** Members-only. Throws (server-enforced) if the kitchen isn't currently a Pro member. */
export async function fetchCookProSalesSummary(kitchenId: string): Promise<CookProSalesSummary> {
  await ensureAuth();
  const { data, error } = await supabase.rpc('cook_pro_sales_summary', { p_kitchen_id: kitchenId }).single();
  if (error) throw error;
  const d = data as any;
  return {
    revenueCents: Number(d.revenue_cents ?? 0),
    orderCount: Number(d.order_count ?? 0),
    avgOrderCents: Number(d.avg_order_cents ?? 0),
    topMealName: d.top_meal_name ?? null,
    topMealQty: d.top_meal_qty != null ? Number(d.top_meal_qty) : null,
  };
}
