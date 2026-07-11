import { supabase } from './supabase';

/**
 * Real weekly meal-plan subscriptions. Preppa is the payment hub: the customer's saved
 * card is charged on Preppa every week; the cook is credited (net of the Stripe fee) via
 * the reconcile_invoice path and cashes out through Connect. Web-first (Stripe.js).
 *
 * Plans live in the `plans` table (backed by real meals via `plan_items`) so each weekly
 * invoice generates a real order. Subscriptions in `subscriptions` (status synced from Stripe).
 */

export interface PlanItem { name: string; qty: number }
export interface Plan {
  id: string;
  kitchenId: string;
  kitchenName: string;
  name: string;
  description: string | null;
  priceCents: number;      // cook's weekly price (customer pays this + 10% service fee)
  fulfillment: 'pickup' | 'delivery';
  goal: string | null;
  items: PlanItem[];
}
export interface MySubscription {
  id: string;
  status: 'active' | 'paused' | 'canceled' | 'past_due' | 'incomplete';
  preferredDay: string | null;
  planName: string;
  kitchenName: string;
  priceCents: number;
  fulfillment: 'pickup' | 'delivery';
  items: PlanItem[];
}

function rowToItems(planItems: any[] | null | undefined): PlanItem[] {
  return (planItems ?? [])
    .map((pi) => ({ name: pi?.meals?.name ?? 'Meal', qty: Number(pi?.qty) || 1 }))
    .filter((i) => i.name);
}

/** All live plans customers can subscribe to, newest first. */
export async function fetchActivePlans(): Promise<Plan[]> {
  const { data, error } = await supabase
    .from('plans')
    .select('id, kitchen_id, name, description, price_cents, fulfillment, goal, kitchens(name), plan_items(qty, meals(name))')
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return (data as any[]).map((p) => ({
    id: p.id,
    kitchenId: p.kitchen_id,
    kitchenName: p.kitchens?.name ?? 'A local cook',
    name: p.name,
    description: p.description,
    priceCents: Number(p.price_cents) || 0,
    fulfillment: p.fulfillment,
    goal: p.goal,
    items: rowToItems(p.plan_items),
  }));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A single plan by id (or null if not a real plan — e.g. a seed/demo string id). */
export async function fetchPlan(id: string): Promise<Plan | null> {
  if (!UUID_RE.test(id)) return null; // seed ids aren't uuids — skip the doomed query
  const { data, error } = await supabase
    .from('plans')
    .select('id, kitchen_id, name, description, price_cents, fulfillment, goal, kitchens(name), plan_items(qty, meals(name))')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  const p = data as any;
  return {
    id: p.id,
    kitchenId: p.kitchen_id,
    kitchenName: p.kitchens?.name ?? 'A local cook',
    name: p.name,
    description: p.description,
    priceCents: Number(p.price_cents) || 0,
    fulfillment: p.fulfillment,
    goal: p.goal,
    items: rowToItems(p.plan_items),
  };
}

/** The signed-in customer's own subscriptions (excludes canceled). */
export async function listMySubscriptions(): Promise<MySubscription[]> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) return [];
  const { data, error } = await supabase
    .from('subscriptions')
    .select('id, status, preferred_day, plans(name, price_cents, fulfillment, kitchens(name), plan_items(qty, meals(name)))')
    .eq('customer_id', uid)
    .neq('status', 'canceled')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return (data as any[]).map((s) => ({
    id: s.id,
    status: s.status,
    preferredDay: s.preferred_day,
    planName: s.plans?.name ?? 'Weekly plan',
    kitchenName: s.plans?.kitchens?.name ?? 'A local cook',
    priceCents: Number(s.plans?.price_cents) || 0,
    fulfillment: s.plans?.fulfillment ?? 'delivery',
    items: rowToItems(s.plans?.plan_items),
  }));
}

/** Subscribe to a plan. Charges the customer's saved card (server picks it if pmId omitted). */
export async function createSubscription(planId: string, pmId?: string, preferredDay?: string): Promise<{ subscriptionId: string; status: string }> {
  const { data, error } = await supabase.functions.invoke('create-subscription', {
    body: { planId, paymentMethodId: pmId, preferredDay },
  });
  if (error || data?.error) {
    const e: any = new Error(data?.error || error?.message || 'Could not start your plan.');
    e.code = data?.code;
    throw e;
  }
  return { subscriptionId: data.subscriptionId, status: data.status };
}

async function manage(subscriptionId: string, action: 'pause' | 'resume' | 'cancel'): Promise<string> {
  const { data, error } = await supabase.functions.invoke('manage-subscription', { body: { subscriptionId, action } });
  if (error || data?.error) throw new Error(data?.error || error?.message || 'Could not update your plan.');
  return data.status as string;
}
export const pauseSubscription = (id: string) => manage(id, 'pause');
export const resumeSubscription = (id: string) => manage(id, 'resume');
export const cancelSubscription = (id: string) => manage(id, 'cancel');

// ---- Cook side ----

export interface CookMeal { id: string; name: string; priceCents: number }
/** The signed-in cook's meals, to compose a plan from. */
export async function fetchMyKitchenMeals(): Promise<{ kitchenId: string | null; meals: CookMeal[] }> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) return { kitchenId: null, meals: [] };
  const { data: k } = await supabase.from('kitchens').select('id').eq('owner_id', uid).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!k) return { kitchenId: null, meals: [] };
  const { data } = await supabase.from('meals').select('id, name, price_cents').eq('kitchen_id', (k as any).id).order('created_at', { ascending: false });
  const meals = (data as any[] ?? []).map((m) => ({ id: m.id, name: m.name, priceCents: Number(m.price_cents) || 0 }));
  return { kitchenId: (k as any).id, meals };
}

/** The signed-in cook's own plans. */
export async function fetchMyPlans(): Promise<Plan[]> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) return [];
  const { data: k } = await supabase.from('kitchens').select('id').eq('owner_id', uid).limit(1).maybeSingle();
  if (!k) return [];
  const { data } = await supabase
    .from('plans')
    .select('id, kitchen_id, name, description, price_cents, fulfillment, goal, kitchens(name), plan_items(qty, meals(name))')
    .eq('kitchen_id', (k as any).id)
    .order('created_at', { ascending: false });
  return (data as any[] ?? []).map((p) => ({
    id: p.id, kitchenId: p.kitchen_id, kitchenName: p.kitchens?.name ?? '', name: p.name,
    description: p.description, priceCents: Number(p.price_cents) || 0, fulfillment: p.fulfillment,
    goal: p.goal, items: rowToItems(p.plan_items),
  }));
}

/** Create or update a plan (cook). Creates the Stripe recurring price server-side. */
export async function upsertPlan(input: {
  planId?: string; name: string; description?: string; priceCents: number;
  fulfillment: 'pickup' | 'delivery'; goal?: string; items: { mealId: string; qty: number }[];
}): Promise<string> {
  const { data, error } = await supabase.functions.invoke('plan-upsert', { body: input });
  if (error || data?.error) throw new Error(data?.error || error?.message || 'Could not save the plan.');
  return data.planId as string;
}
