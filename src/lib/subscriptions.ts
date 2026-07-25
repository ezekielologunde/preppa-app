import { supabase } from './supabase';

/**
 * Meal-plan subscriptions — the recurring relationship layer.
 *
 * Model: Meal Plan (what) → Subscription (how often) → Cycle (the concrete weekly
 * fulfillment) → Order. Preppa is the payment hub: each CYCLE is charged off-session on
 * the customer's saved card at its billing date (app-controlled, not Stripe recurring),
 * the cook is credited net of the Stripe fee via reconcile_paid_pi, and cashes out through
 * Connect. Money is always in cents. Web-first (Stripe.js) for adding a card.
 */

export interface PlanItem { mealId?: string; name: string; qty: number; priceCents?: number }

export type SelectionModel = 'fixed' | 'customer_choice';

export interface Plan {
  id: string;
  kitchenId: string;
  kitchenName: string;
  name: string;
  description: string | null;
  priceCents: number;       // cook's weekly price (fixed plans); customer pays this + service fee
  fulfillment: 'pickup' | 'delivery';
  goal: string | null;
  items: PlanItem[];        // the box (fixed) / the offered menu (customer_choice)
  // extended config (optional so existing callers keep compiling)
  selectionModel?: SelectionModel;
  mealsPerDelivery?: number | null;
  servings?: number | null;
  perMealCents?: number | null;
  perDeliveryCents?: number;
  serviceFeeBps?: number;
  deliveryDays?: string[];
  cutoffHours?: number;
  leadTimeHours?: number;
  minCommitment?: number;
  trialPriceCents?: number | null;
  trialCycles?: number;
  coverUrl?: string | null;
  dietaryTags?: string[];
  allergens?: string[];
  cadenceWeeks?: number;        // NEW: 1=weekly, 2=biweekly (cook-chosen)
  rotating?: boolean;           // NEW: meals rotate weekly (not fixed)
}

export type Lifecycle =
  | 'draft' | 'pending_confirmation' | 'active' | 'paused' | 'payment_failed'
  | 'cancellation_scheduled' | 'cancelled' | 'completed' | 'suspended';

export interface CycleSummary {
  id: string;
  status: string;             // cycle_status
  paymentStatus: string;      // cycle_payment_status
  deliveryDate: string;       // ISO date
  billingDate: string;
  selectionDeadline: string;  // ISO timestamptz
  skipped: boolean;
  totalCents: number;
  items: PlanItem[];
  canEdit: boolean;           // selection_open && before the cutoff
}

export interface MySubscription {
  id: string;
  lifecycle: Lifecycle;
  status: 'active' | 'paused' | 'canceled' | 'past_due' | 'incomplete'; // legacy-compat
  kind: string;
  preferredDay: string | null;
  planId: string | null;
  planName: string;
  kitchenId: string | null;   // null for a cross-kitchen box (no single cook to message)
  kitchenName: string;
  priceCents: number;
  fulfillment: 'pickup' | 'delivery';
  selectionModel: SelectionModel;
  isBox: boolean;             // customer-built cross-kitchen box (plan_id null)
  items: PlanItem[];          // the plan box/menu (for compact display)
  nextCycle: CycleSummary | null;
}

const SERVICE_FEE_BPS_DEFAULT = 1000;

/** Customer weekly price = cook price + service fee. */
export function customerWeeklyCents(cookCents: number, serviceFeeBps = SERVICE_FEE_BPS_DEFAULT): number {
  return cookCents + Math.round((cookCents * serviceFeeBps) / 10000);
}

/**
 * Estimate one cycle's price the SAME way advance_cycles() snapshots it at closeout:
 * fixed → the cook's bundle price; customer_choice → per_meal_cents × qty (or meal sum).
 */
export function estimateCycle(
  plan: Pick<Plan, 'priceCents' | 'selectionModel' | 'perMealCents' | 'perDeliveryCents' | 'serviceFeeBps' | 'items'>,
  selection?: { qty: number; priceCents?: number }[],
): { subtotalCents: number; feeCents: number; totalCents: number } {
  const bps = plan.serviceFeeBps ?? SERVICE_FEE_BPS_DEFAULT;
  const perDelivery = plan.perDeliveryCents ?? 0;
  let subtotal: number;
  if ((plan.selectionModel ?? 'fixed') === 'fixed') {
    subtotal = plan.priceCents;
  } else {
    const items = selection ?? plan.items;
    const qty = items.reduce((n, i) => n + i.qty, 0);
    subtotal = plan.perMealCents != null
      ? plan.perMealCents * qty
      : items.reduce((n, i) => n + (i.priceCents ?? 0) * i.qty, 0);
  }
  subtotal += perDelivery;
  const fee = Math.round((subtotal * bps) / 10000);
  return { subtotalCents: subtotal, feeCents: fee, totalCents: subtotal + fee };
}

function planItems(rows: any[] | null | undefined): PlanItem[] {
  return (rows ?? [])
    .map((pi) => ({ mealId: pi?.meal_id ?? pi?.meals?.id, name: pi?.meals?.name ?? 'Meal', qty: Number(pi?.qty) || 1, priceCents: Number(pi?.meals?.price_cents) || undefined }))
    .filter((i) => i.name);
}

const PLAN_SELECT =
  'id, kitchen_id, name, description, price_cents, fulfillment, goal, selection_model, meals_per_delivery, servings, per_meal_cents, per_delivery_cents, service_fee_bps, delivery_days, cutoff_hours, lead_time_hours, min_commitment, trial_price_cents, trial_cycles, cadence_weeks, rotating, cover_url, dietary_tags, allergens, kitchens(name), plan_items(qty, meal_id, meals(id, name, price_cents))';

function rowToPlan(p: any): Plan {
  return {
    id: p.id,
    kitchenId: p.kitchen_id,
    kitchenName: p.kitchens?.name ?? 'A local cook',
    name: p.name,
    description: p.description,
    priceCents: Number(p.price_cents) || 0,
    fulfillment: p.fulfillment,
    goal: p.goal,
    items: planItems(p.plan_items),
    selectionModel: p.selection_model ?? 'fixed',
    mealsPerDelivery: p.meals_per_delivery ?? null,
    servings: p.servings ?? null,
    perMealCents: p.per_meal_cents ?? null,
    perDeliveryCents: Number(p.per_delivery_cents) || 0,
    serviceFeeBps: Number(p.service_fee_bps) || SERVICE_FEE_BPS_DEFAULT,
    deliveryDays: p.delivery_days ?? [],
    cutoffHours: p.cutoff_hours ?? 48,
    leadTimeHours: p.lead_time_hours ?? 48,
    minCommitment: p.min_commitment ?? 1,
    trialPriceCents: p.trial_price_cents ?? null,
    trialCycles: p.trial_cycles ?? 0,
    coverUrl: p.cover_url ?? null,
    dietaryTags: p.dietary_tags ?? [],
    allergens: p.allergens ?? [],
    cadenceWeeks: p.cadence_weeks ?? 1,    // NEW: default to weekly
    rotating: p.rotating ?? false,         // NEW: default to fixed menu
  };
}

/** All live plans customers can subscribe to, newest first. */
export async function fetchActivePlans(): Promise<Plan[]> {
  const { data, error } = await supabase
    .from('plans').select(PLAN_SELECT).eq('status', 'active').order('created_at', { ascending: false });
  if (error || !data) return [];
  return (data as any[]).map(rowToPlan);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A single plan by id (or null if not a real plan — e.g. a seed/demo string id). */
export async function fetchPlan(id: string): Promise<Plan | null> {
  if (!UUID_RE.test(id)) return null;
  const { data, error } = await supabase.from('plans').select(PLAN_SELECT).eq('id', id).maybeSingle();
  if (error || !data) return null;
  return rowToPlan(data);
}

function lifecycleToStatus(l: Lifecycle): MySubscription['status'] {
  switch (l) {
    case 'active': return 'active';
    case 'paused': return 'paused';
    case 'payment_failed':
    case 'suspended': return 'past_due';
    case 'cancelled':
    case 'cancellation_scheduled':
    case 'completed': return 'canceled';
    default: return 'incomplete';
  }
}

function cycleRowToSummary(cy: any): CycleSummary {
  const deadline = cy.selection_deadline;
  const canEdit = cy.status === 'selection_open' && (!deadline || new Date(deadline).getTime() > Date.now());
  return {
    id: cy.id,
    status: cy.status,
    paymentStatus: cy.payment_status,
    deliveryDate: cy.delivery_date,
    billingDate: cy.billing_date,
    selectionDeadline: deadline,
    skipped: !!cy.skipped,
    totalCents: Number(cy.total_cents) || 0,
    items: (cy.subscription_cycle_items ?? []).map((ci: any) => ({
      mealId: ci.meal_id, name: ci?.meals?.name ?? 'Meal', qty: Number(ci.qty) || 1, priceCents: Number(ci?.meals?.price_cents) || undefined,
    })),
    canEdit,
  };
}

export interface BoxKitchen { kitchenId: string; name: string }
/** The distinct kitchens in a customer's cross-kitchen box — for the messaging cook-picker. */
export async function fetchBoxKitchens(subscriptionId: string): Promise<BoxKitchen[]> {
  const { data, error } = await supabase.rpc('box_kitchens', { p_subscription: subscriptionId });
  if (error || !data) return [];
  return (data as any[]).map((r) => ({ kitchenId: r.kitchen_id, name: r.name }));
}

/** The signed-in customer's subscriptions (excludes cancelled/completed), each with its current cycle. */
export async function listMySubscriptions(): Promise<MySubscription[]> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) return [];
  const { data, error } = await supabase
    .from('subscriptions')
    .select('id, lifecycle, kind, preferred_day, plan_id, fulfillment, plans(name, price_cents, fulfillment, selection_model, service_fee_bps, kitchen_id, kitchens(name), plan_items(qty, meal_id, meals(id, name, price_cents)))')
    .eq('customer_id', uid)
    .not('lifecycle', 'in', '(cancelled,completed)')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  const subs = data as any[];

  // one query for the current cycle of each sub
  const ids = subs.map((s) => s.id);
  const cyclesBySub = new Map<string, any>();
  if (ids.length) {
    const { data: cy } = await supabase
      .from('subscription_cycles')
      .select('id, subscription_id, status, payment_status, delivery_date, billing_date, selection_deadline, skipped, total_cents, cycle_start, subscription_cycle_items(qty, meal_id, meals(name, price_cents))')
      .in('subscription_id', ids)
      .in('status', ['scheduled', 'selection_open', 'selection_closed', 'charged', 'order_created'])
      .order('cycle_start', { ascending: true });
    for (const row of (cy as any[] ?? [])) {
      if (!cyclesBySub.has(row.subscription_id)) cyclesBySub.set(row.subscription_id, row); // earliest wins
    }
  }

  return subs.map((s) => {
    const lifecycle = s.lifecycle as Lifecycle;
    const isBox = s.kind === 'box';
    const cyc = cyclesBySub.get(s.id) ? cycleRowToSummary(cyclesBySub.get(s.id)) : null;
    return {
      id: s.id,
      lifecycle,
      status: lifecycleToStatus(lifecycle),
      kind: s.kind ?? 'weekly',
      preferredDay: s.preferred_day,
      planId: s.plan_id,
      planName: isBox ? 'My weekly box' : (s.plans?.name ?? 'Weekly plan'),
      kitchenId: isBox ? null : (s.plans?.kitchen_id ?? null),
      kitchenName: isBox ? 'Built by you' : (s.plans?.kitchens?.name ?? 'A local cook'),
      priceCents: isBox ? 0 : (Number(s.plans?.price_cents) || 0),
      fulfillment: (s.fulfillment ?? s.plans?.fulfillment ?? 'delivery'),
      selectionModel: isBox ? 'fixed' : (s.plans?.selection_model ?? 'fixed'),
      isBox,
      items: isBox ? (cyc?.items ?? []) : planItems(s.plans?.plan_items),
      nextCycle: cyc,
    };
  });
}

/** A subscription's cycle history (billing history), newest first. */
export async function fetchCycleHistory(subscriptionId: string): Promise<CycleSummary[]> {
  const { data } = await supabase
    .from('subscription_cycles')
    .select('id, status, payment_status, delivery_date, billing_date, selection_deadline, skipped, total_cents, subscription_cycle_items(qty, meal_id, meals(name, price_cents))')
    .eq('subscription_id', subscriptionId)
    .order('cycle_start', { ascending: false });
  return (data as any[] ?? []).map(cycleRowToSummary);
}

// ---- subscribe -----------------------------------------------------------

export interface SubscribePrefs {
  dietary?: string[]; allergies?: string[]; dislikes?: string[];
  servingSize?: number; spiceLevel?: number; householdSize?: number; notes?: string;
}
export interface SubscribeOptions {
  planId: string;
  paymentMethodId?: string;
  kind?: 'weekly' | 'biweekly' | 'trial';
  fulfillment?: 'pickup' | 'delivery';
  startDate?: string;         // YYYY-MM-DD
  preferredDay?: string;
  selection?: { mealId: string; qty: number }[];  // first cycle (customer_choice)
  preferences?: SubscribePrefs;
}
export interface SubscribeResult {
  subscriptionId: string; status: string; cycleId: string | null;
  firstDeliveryDate: string | null; firstBillingDate: string | null; selectionDeadline: string | null;
}

/** Subscribe to a plan (app-controlled; no charge now — each cycle bills at its billing date). */
export async function subscribeToPlan(opts: SubscribeOptions): Promise<SubscribeResult> {
  const { data, error } = await supabase.functions.invoke('subscribe-plan', { body: opts });
  if (error || data?.error) {
    const e: any = new Error(data?.error || error?.message || 'Could not start your plan.');
    e.code = data?.code;
    throw e;
  }
  return data as SubscribeResult;
}

// ---- build-your-own (cross-kitchen box) ---------------------------------

const BOX_DISCOUNT_BPS = 1000;   // 10% bundle discount (Preppa-funded)
const BOX_FEE_BPS = 1500;        // box service fee (vs 10% for a single-cook plan)

export interface BuildBoxOptions {
  items: { mealId: string; qty: number }[];
  paymentMethodId?: string;
  kind?: 'weekly' | 'biweekly';
  fulfillment?: 'pickup' | 'delivery';
  startDate?: string;
  preferredDay?: string;
}

/** Estimate a box's weekly price the SAME way advance_cycles prices it: S − 10% + 15%. */
export function estimateBox(items: { qty: number; priceCents: number }[]): {
  subtotalCents: number; discountCents: number; feeCents: number; totalCents: number;
} {
  const subtotal = items.reduce((n, i) => n + i.priceCents * i.qty, 0);
  const discount = Math.round((subtotal * BOX_DISCOUNT_BPS) / 10000);
  const fee = Math.round((subtotal * BOX_FEE_BPS) / 10000);
  return { subtotalCents: subtotal, discountCents: discount, feeCents: fee, totalCents: subtotal - discount + fee };
}

/** Build a cross-kitchen box and subscribe (one charge per cycle, split across cooks). */
export async function buildBox(opts: BuildBoxOptions): Promise<SubscribeResult> {
  const { data, error } = await supabase.functions.invoke('subscribe-box', { body: opts });
  if (error || data?.error) {
    const e: any = new Error(data?.error || error?.message || 'Could not create your box.');
    e.code = data?.code;
    throw e;
  }
  return data as SubscribeResult;
}

// ---- cycle & subscription controls (SECURITY DEFINER RPCs; self-authorized) ----

export async function selectCycleMeals(cycleId: string, items: { mealId: string; qty: number }[]): Promise<void> {
  const { error } = await supabase.rpc('select_meals', {
    p_cycle_id: cycleId, p_items: items.map((i) => ({ meal_id: i.mealId, qty: i.qty })),
  });
  if (error) throw new Error(error.message);
}
export async function swapCycleMeal(cycleId: string, fromMealId: string, toMealId: string): Promise<void> {
  const { error } = await supabase.rpc('swap_meal', { p_cycle_id: cycleId, p_from_meal: fromMealId, p_to_meal: toMealId });
  if (error) throw new Error(error.message);
}
export async function skipCycle(cycleId: string): Promise<void> {
  const { error } = await supabase.rpc('skip_cycle', { p_cycle_id: cycleId });
  if (error) throw new Error(error.message);
}
export async function pauseSubscription(subscriptionId: string, cycles?: number): Promise<void> {
  const { error } = await supabase.rpc('pause_subscription', { p_sub_id: subscriptionId, p_cycles: cycles ?? null, p_until: null });
  if (error) throw new Error(error.message);
}
export async function resumeSubscription(subscriptionId: string): Promise<void> {
  const { error } = await supabase.rpc('resume_subscription', { p_sub_id: subscriptionId });
  if (error) throw new Error(error.message);
}
export async function cancelSubscription(subscriptionId: string, immediate = false): Promise<void> {
  const { error } = await supabase.rpc('cancel_subscription', { p_sub_id: subscriptionId, p_immediate: immediate });
  if (error) throw new Error(error.message);
}
export async function updatePreferences(subscriptionId: string, p: SubscribePrefs): Promise<void> {
  const { error } = await supabase.rpc('update_preferences', {
    p_sub_id: subscriptionId, p_dietary: p.dietary ?? [], p_allergies: p.allergies ?? [], p_dislikes: p.dislikes ?? [],
    p_serving: p.servingSize ?? null, p_spice: p.spiceLevel ?? null, p_preferred_day: null,
    p_household: p.householdSize ?? null, p_notes: p.notes ?? null,
  });
  if (error) throw new Error(error.message);
}

// ---- Cook side (unchanged; extended in Phase D) ----

export interface CookMeal { id: string; name: string; priceCents: number }
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

// ---- cook dashboard: "what must I cook this week" + subscribers ----

export interface PrepMeal { mealId: string; name: string; portions: number; subscriberCount: number }
export interface PrepDay { deliveryDate: string; meals: PrepMeal[]; allergens: string[] }

/** The signed-in cook's upcoming prep, grouped by delivery date (incl. their box portions). */
export async function fetchPrepRollup(): Promise<PrepDay[]> {
  const [rollup, allergens] = await Promise.all([
    supabase.rpc('cook_prep_rollup'),
    supabase.rpc('cook_prep_allergens'),
  ]);
  const algByDay = new Map<string, string[]>();
  for (const a of (allergens.data as any[] ?? [])) algByDay.set(a.delivery_date, a.allergens ?? []);
  const byDay = new Map<string, PrepDay>();
  for (const r of (rollup.data as any[] ?? [])) {
    let d = byDay.get(r.delivery_date);
    if (!d) { d = { deliveryDate: r.delivery_date, meals: [], allergens: algByDay.get(r.delivery_date) ?? [] }; byDay.set(r.delivery_date, d); }
    d.meals.push({ mealId: r.meal_id, name: r.meal_name, portions: Number(r.total_portions) || 0, subscriberCount: Number(r.subscriber_count) || 0 });
  }
  return [...byDay.values()];
}

export interface CookSubscriber { subscriptionId: string; customerName: string; planName: string; lifecycle: Lifecycle; priceCents: number; preferredDay: string | null; createdAt: string }

/** The signed-in cook's plan subscribers (roster). */
export async function fetchCookSubscribers(): Promise<CookSubscriber[]> {
  const { data } = await supabase.rpc('cook_subscribers');
  return (data as any[] ?? []).map((s) => ({
    subscriptionId: s.subscription_id, customerName: s.customer_name, planName: s.plan_name,
    lifecycle: s.lifecycle, priceCents: Number(s.price_cents) || 0, preferredDay: s.preferred_day, createdAt: s.created_at,
  }));
}

export async function fetchMyPlans(): Promise<Plan[]> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) return [];
  const { data: k } = await supabase.from('kitchens').select('id').eq('owner_id', uid).limit(1).maybeSingle();
  if (!k) return [];
  const { data } = await supabase.from('plans').select(PLAN_SELECT).eq('kitchen_id', (k as any).id).order('created_at', { ascending: false });
  return (data as any[] ?? []).map(rowToPlan);
}

export interface UpsertPlanInput {
  planId?: string; name: string; description?: string; priceCents?: number;
  fulfillment: 'pickup' | 'delivery'; goal?: string; items: { mealId: string; qty: number }[];
  selectionModel?: SelectionModel; perMealCents?: number; perDeliveryCents?: number;
  mealsPerDelivery?: number; servings?: number; mealsPerWeek?: number;
  deliveryDays?: string[]; cutoffHours?: number; leadTimeHours?: number; minCommitment?: number;
  trialPriceCents?: number; trialCycles?: number; cadenceWeeks?: 1 | 2; rotating?: boolean;
  coverUrl?: string; photoUrls?: string[]; dietaryTags?: string[]; allergens?: string[];
}
export async function upsertPlan(input: UpsertPlanInput): Promise<string> {
  const { data, error } = await supabase.functions.invoke('plan-upsert', { body: input });
  if (error || data?.error) throw new Error(data?.error || error?.message || 'Could not save the plan.');
  return data.planId as string;
}

/** Set the signed-in cook's weekly capacity (max meal portions per delivery day; null = unlimited). */
export async function setKitchenCapacity(maxPortions: number | null): Promise<void> {
  const { error } = await supabase.rpc('set_kitchen_capacity', { p_max: maxPortions, p_day: '' });
  if (error) throw new Error(error.message);
}

/** The signed-in cook's current all-days capacity cap (null = unlimited). */
export async function fetchKitchenCapacity(kitchenId: string): Promise<number | null> {
  const { data } = await supabase.from('kitchen_capacity').select('max_portions_per_day').eq('kitchen_id', kitchenId).eq('delivery_day', '').maybeSingle();
  return data ? (Number((data as any).max_portions_per_day) ?? null) : null;
}
