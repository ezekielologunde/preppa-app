/**
 * Real order fulfillment status — cook-side RPCs + a customer-side status read.
 * SECURITY: none of this is a trust boundary. `kitchen_list_orders`/`kitchen_order_detail`/
 * `update_order_status` all re-check `is_kitchen_owner()` server-side; a non-owner session
 * gets empty reads and a rejected write regardless of what this client does.
 */
import { supabase } from './supabase';

export type KitchenOrderStatus = 'confirmed' | 'preparing' | 'ready' | 'completed';

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

export async function fetchKitchenOrders(): Promise<KitchenOrderRow[]> {
  const { data, error } = await supabase.rpc('kitchen_list_orders');
  if (error) throw error;
  return (data as KitchenOrderRow[]) ?? [];
}

export interface KitchenOrderItem { name: string; qty: number; unit_price_cents: number }

export interface KitchenOrderDetail {
  order_id: string;
  buyer_name: string | null;
  status: string;
  fulfillment: string;
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

/** Customer-side: read the live status of one's own order (RLS: customer_id = auth.uid()). */
export async function fetchOrderStatus(orderId: string): Promise<{ status: string; fulfillment: string } | null> {
  const { data, error } = await supabase.from('orders').select('status,fulfillment').eq('id', orderId).maybeSingle();
  if (error) throw error;
  return data ?? null;
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
