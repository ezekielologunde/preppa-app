/**
 * Real order fulfillment status — cook-side RPCs + a customer-side status read.
 * SECURITY: none of this is a trust boundary. `kitchen_list_orders`/`kitchen_order_detail`/
 * `update_order_status` all re-check `is_kitchen_owner()` server-side; a non-owner session
 * gets empty reads and a rejected write regardless of what this client does.
 */
import { supabase, assertLiveMoneyAllowed, assertFunctionSuccess } from './supabase';

export type KitchenOrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled';

export interface KitchenOrderRow {
  order_id: string;
  buyer_name: string | null;
  status: string;
  fulfillment: string;
  total_cents: number;
  created_at: string;
  first_item_name: string | null;
  first_item_qty: number | null;
  item_count: number;
}

export interface KitchenDashboardSummary {
  available_cents: number;
  today_cents: number;
  today_orders: number;
  week_cents: number;
  pending_orders: number;
}

/** Real My Hub dashboard numbers (audit Critical: this used to read permanently-empty
 * mock fixtures — $0/0 regardless of actual activity). */
export async function fetchDashboardSummary(): Promise<KitchenDashboardSummary> {
  const { data, error } = await supabase.rpc('kitchen_dashboard_summary').single();
  if (error) throw error;
  return data as KitchenDashboardSummary;
}

export interface CookAnalyticsSummary {
  weeklyRevenueCents: number[]; // 8 entries, oldest → most recent week
  ordersThisMonth: number;
  avgOrderCents: number;
  repeatCustomerPct: number;
  newCustomers30d: number;
  topMeals: { name: string; sold: number; pct: number }[];
}

/** Real /hub/analytics numbers (same audit-critical pattern as fetchDashboardSummary above —
 * this screen used to read ANALYTICS/MY_PLANS, static empty constants in src/data/cook.ts,
 * so every cook saw a permanently blank dashboard). Deliberately excludes profile views /
 * view→order conversion: nothing in this schema tracks page views yet. */
export async function fetchCookAnalyticsSummary(kitchenId: string): Promise<CookAnalyticsSummary> {
  const { data, error } = await supabase.rpc('cook_analytics_summary', { p_kitchen_id: kitchenId }).single();
  if (error) throw error;
  const d = data as any;
  return {
    weeklyRevenueCents: (d.weekly_revenue_cents as number[] | null) ?? [0, 0, 0, 0, 0, 0, 0, 0],
    ordersThisMonth: Number(d.orders_this_month ?? 0),
    avgOrderCents: Number(d.avg_order_cents ?? 0),
    repeatCustomerPct: Number(d.repeat_customer_pct ?? 0),
    newCustomers30d: Number(d.new_customers_30d ?? 0),
    topMeals: (d.top_meals as { name: string; sold: number; pct: number }[] | null) ?? [],
  };
}

export async function fetchKitchenOrders(): Promise<KitchenOrderRow[]> {
  const { data, error } = await supabase.rpc('kitchen_list_orders');
  if (error) throw error;
  return (data as KitchenOrderRow[]) ?? [];
}

export interface KitchenOrderItem { name: string; qty: number; unit_price_cents: number }

export interface KitchenOrderDetail {
  order_id: string;
  buyer_id: string;
  buyer_name: string | null;
  status: string;
  pay_status: string;
  fulfillment: string;
  delivery_address_text: string | null;
  delivery_instructions: string | null;
  method: string;
  subtotal_cents: number;
  service_fee_cents: number;
  tip_cents: number;
  total_cents: number;
  created_at: string;
  items: KitchenOrderItem[];
}

export async function fetchKitchenOrderDetail(orderId: string): Promise<KitchenOrderDetail | null> {
  const { data, error } = await supabase.rpc('kitchen_order_detail', { p_order: orderId });
  if (error) throw error;
  return (data?.[0] as KitchenOrderDetail) ?? null;
}

/** Advance an order one step forward (confirmed→preparing→ready→completed). Notifies the customer server-side. */
export async function updateOrderStatus(orderId: string, status: KitchenOrderStatus): Promise<void> {
  const { error } = await supabase.rpc('update_order_status', { p_order: orderId, p_status: status });
  if (error) throw error;
}

/** Cook cancels a paid order (confirmed/preparing/ready). Refunds via Stripe + reverses the
 * ledger sale credit server-side when the order was paid — see supabase/functions/decline-order. */
export async function declineOrder(orderId: string, reason?: string): Promise<{ refunded: boolean }> {
  assertLiveMoneyAllowed();
  const { data, error } = await supabase.functions.invoke('decline-order', { body: { orderId, reason } });
  await assertFunctionSuccess(data, error, 'Could not cancel the order.');
  return { refunded: !!data.refunded };
}

/** Customer-side: read the live status of one's own order (RLS: customer_id = auth.uid()). */
export async function fetchOrderStatus(orderId: string): Promise<{ status: string; fulfillment: string; payStatus: string } | null> {
  const { data, error } = await supabase.from('orders').select('status,fulfillment,pay_status').eq('id', orderId).maybeSingle();
  if (error) throw error;
  return data ? { status: data.status, fulfillment: data.fulfillment, payStatus: data.pay_status } : null;
}

export interface CustomerOrderRecord {
  id: string;
  status: string;
  fulfillment: string;
  method: string;
  subtotalCents: number;
  serviceFeeCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
  createdAt: string;
  kitchenId: string;
  kitchenName: string;
  reviewed: boolean;
  items: { mealId: string; name: string; unitPriceCents: number; qty: number }[];
}

/** RLS-scoped paid/refunded order history for the signed-in customer. */
export async function fetchCustomerOrders(): Promise<CustomerOrderRecord[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('id,status,fulfillment,method,subtotal_cents,service_fee_cents,tax_cents,tip_cents,total_cents,created_at,kitchen_id,kitchens(name),order_items(meal_id,name_snapshot,unit_price_cents,qty)')
    .in('pay_status', ['paid', 'refunded'])
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as any[];
  const orderIds = rows.map((r) => r.id as string);
  let reviewed = new Set<string>();
  if (orderIds.length) {
    const { data: reviewRows, error: reviewError } = await supabase.from('reviews').select('order_id').in('order_id', orderIds);
    if (reviewError) throw reviewError;
    reviewed = new Set((reviewRows ?? []).map((r: any) => r.order_id).filter(Boolean));
  }
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    fulfillment: r.fulfillment,
    method: r.method,
    subtotalCents: Number(r.subtotal_cents ?? 0),
    serviceFeeCents: Number(r.service_fee_cents ?? 0),
    taxCents: Number(r.tax_cents ?? 0),
    tipCents: Number(r.tip_cents ?? 0),
    totalCents: Number(r.total_cents ?? 0),
    createdAt: r.created_at,
    kitchenId: r.kitchen_id,
    kitchenName: r.kitchens?.name ?? 'Kitchen',
    reviewed: reviewed.has(r.id),
    items: (r.order_items ?? []).map((i: any) => ({
      mealId: i.meal_id,
      name: i.name_snapshot,
      unitPriceCents: Number(i.unit_price_cents ?? 0),
      qty: Number(i.qty ?? 0),
    })),
  }));
}

export interface ReorderMealRecord {
  id: string;
  slug: string;
  name: string;
  priceCents: number;
  grad: string;
  imageUrl: string | null;
  kitchenId: string;
  kitchenName: string;
  kitchenOpen: boolean;
  supportsDelivery: boolean;
  supportsPickup: boolean;
}

/** Resolve historical order items against the current, RLS-visible catalog before
 * adding them back to a cart. Archived meals disappear from this result. */
export async function fetchReorderMeals(mealIds: string[], kitchenId: string): Promise<ReorderMealRecord[]> {
  if (mealIds.length === 0) return [];
  const { data, error } = await supabase
    .from('meals')
    .select('id,slug,name,price_cents,grad,image_url,kitchen_id,status,kitchens(name,verification_status,availability,supports_delivery,supports_pickup)')
    .eq('kitchen_id', kitchenId)
    .eq('status', 'live')
    .in('id', [...new Set(mealIds)]);
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    priceCents: Number(r.price_cents ?? 0),
    grad: r.grad ?? 'g1',
    imageUrl: r.image_url ?? null,
    kitchenId: r.kitchen_id,
    kitchenName: r.kitchens?.name ?? 'Kitchen',
    kitchenOpen: r.kitchens?.verification_status === 'verified' && r.kitchens?.availability === 'open',
    supportsDelivery: r.kitchens?.supports_delivery !== false,
    supportsPickup: r.kitchens?.supports_pickup !== false,
  }));
}

/** Customer-side: leave a review on a completed order. RLS (reviews_insert_own_completed_order)
 * independently re-checks the order is the caller's own and status='completed' — the `reviews`
 * table also has a UNIQUE(order_id) constraint, so this can never double-insert for one order.
 * (Audit Critical: this used to be a UI-only mock — a fake toast with no DB write at all.) */
export async function submitReview(orderId: string, rating: number, body: string): Promise<void> {
  if (body.trim().length > 2000) throw new Error('Keep the review under 2,000 characters.');
  const { data: order, error: orderErr } = await supabase.from('orders').select('kitchen_id').eq('id', orderId).maybeSingle();
  if (orderErr) throw orderErr;
  if (!order?.kitchen_id) throw new Error('Could not find that order.');
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error('AUTH_REQUIRED');
  const { error } = await supabase.from('reviews').insert({
    order_id: orderId, kitchen_id: order.kitchen_id, author_id: uid, rating, body: body || null,
  });
  if (error) {
    if ((error as any).code === '23505') throw new Error('You already reviewed this order.');
    throw new Error(error.message || 'Could not submit your review.');
  }
}

export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return day === 1 ? 'Yesterday' : `${day}d ago`;
}
