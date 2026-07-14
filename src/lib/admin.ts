/**
 * Admin data access (Phase 1). Thin sibling of `payments.ts`: web-only, calls the
 * server-enforced admin RPCs with the *current* (admin's) session — never
 * `ensureAuth()`, which would sign in the non-admin seeded test customer.
 *
 * SECURITY: none of this is a trust boundary. Every function below hits an RPC
 * that re-checks `is_admin()` server-side; a non-admin session gets empty reads
 * and rejected writes regardless of what this client does.
 */
import { Platform } from 'react-native';
import { supabase } from './supabase';

export interface AdminOverview {
  pending_applications: number;
  verified_kitchens: number;
  total_kitchens: number;
  preppers: number;
  orders_count: number;
  gmv_cents: number;
}

export interface AdminApplication {
  kitchen_id: string;
  kitchen_name: string;
  cuisine: string | null;
  approx_area: string | null;
  applicant_id: string;
  applicant_name: string | null;
  status: string;
  applied_at: string;
}

export interface AdminApplicationDetail {
  kitchen_id: string;
  kitchen_name: string;
  cuisine: string | null;
  bio: string | null;
  approx_area: string | null;
  availability: string;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  applicant_id: string;
  applicant_name: string | null;
  applicant_first: string | null;
  // private application detail (owner + admin only)
  phone: string | null;
  address: string | null;
  food_safety: {
    refrigeration?: boolean; foodPrep?: boolean; allergens?: boolean; note?: string;
    docs?: { govId?: string[]; selfie?: string[]; fridge?: string[]; kitchen?: string[] };
  } | null;
  food_handler_cert: string | null;
  agreement_version: string | null;
  agreement_accepted_at: string | null;
  service_types: string[] | null;
  service_area: string | null;
  experience: string | null;
}

function ensureWeb() {
  if (Platform.OS !== 'web') throw new Error('The admin dashboard is web-only.');
}

export async function overview(): Promise<AdminOverview> {
  ensureWeb();
  const { data, error } = await supabase.rpc('admin_overview');
  if (error) throw error;
  return (
    (data?.[0] as AdminOverview) ?? {
      pending_applications: 0,
      verified_kitchens: 0,
      total_kitchens: 0,
      preppers: 0,
      orders_count: 0,
      gmv_cents: 0,
    }
  );
}

export async function listApplications(): Promise<AdminApplication[]> {
  ensureWeb();
  const { data, error } = await supabase.rpc('admin_list_applications');
  if (error) throw error;
  return (data as AdminApplication[]) ?? [];
}

export async function applicationDetail(kitchenId: string): Promise<AdminApplicationDetail | null> {
  ensureWeb();
  const { data, error } = await supabase.rpc('admin_application_detail', { p_kitchen: kitchenId });
  if (error) throw error;
  return (data?.[0] as AdminApplicationDetail) ?? null;
}

export async function approveApplication(kitchenId: string): Promise<void> {
  ensureWeb();
  const { error } = await supabase.rpc('approve_kitchen', { p_kitchen: kitchenId });
  if (error) throw error;
}

export async function rejectApplication(kitchenId: string, reason: string): Promise<void> {
  ensureWeb();
  const { error } = await supabase.rpc('reject_kitchen', { p_kitchen: kitchenId, p_reason: reason });
  if (error) throw error;
}

// --- Order-linked support tickets (Phase 2) ---
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface AdminTicket {
  ticket_id: string;
  subject: string;
  category: string;
  status: TicketStatus;
  reporter_name: string | null;
  order_id: string;
  kitchen_name: string | null;
  cook_visible: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminTicketMessage {
  id: string;
  body: string;
  is_internal: boolean;
  from_admin: boolean;
  created_at: string;
}

export interface AdminTicketDetail {
  ticket_id: string;
  subject: string;
  body: string;
  category: string;
  status: TicketStatus;
  reporter_name: string | null;
  order_id: string;
  kitchen_name: string | null;
  cook_visible: boolean;
  created_at: string;
  messages: AdminTicketMessage[];
}

export async function listTickets(): Promise<AdminTicket[]> {
  ensureWeb();
  const { data, error } = await supabase.rpc('admin_list_tickets');
  if (error) throw error;
  return (data as AdminTicket[]) ?? [];
}

export async function ticketDetail(ticketId: string): Promise<AdminTicketDetail | null> {
  ensureWeb();
  const { data, error } = await supabase.rpc('admin_ticket_detail', { p_ticket: ticketId });
  if (error) throw error;
  const row = data?.[0] as AdminTicketDetail | undefined;
  if (!row) return null;
  // `messages` arrives as jsonb; normalize to an array.
  return { ...row, messages: Array.isArray(row.messages) ? row.messages : [] };
}

export async function setTicketStatus(ticketId: string, status: TicketStatus): Promise<void> {
  ensureWeb();
  const { error } = await supabase.rpc('set_ticket_status', { p_ticket: ticketId, p_status: status });
  if (error) throw error;
}

export async function replyToTicket(ticketId: string, body: string, internal = false): Promise<void> {
  ensureWeb();
  const { error } = await supabase.rpc('add_ticket_message', { p_ticket: ticketId, p_body: body, p_internal: internal });
  if (error) throw error;
}

/** Share a ticket with the cook (kitchen owner) so they can see the thread and reply. */
export async function shareTicketWithCook(ticketId: string): Promise<void> {
  ensureWeb();
  const { error } = await supabase.rpc('share_ticket_with_cook', { p_ticket: ticketId });
  if (error) throw error;
}

// --- Orders & payments (read-only) ---
export interface AdminOrder {
  order_id: string;
  kitchen_name: string | null;
  buyer_name: string | null;
  total_cents: number;
  status: string;
  pay_status: string;
  method: string;
  pi_status: string | null;
  item_count: number;
  created_at: string;
}

export interface AdminOrderItem {
  name: string;
  qty: number;
  unit_price_cents: number;
}

export interface AdminOrderDetail {
  order_id: string;
  kitchen_name: string | null;
  buyer_name: string | null;
  status: string;
  pay_status: string;
  method: string;
  fulfillment: string;
  subtotal_cents: number;
  service_fee_cents: number;
  tip_cents: number;
  total_cents: number;
  created_at: string;
  pi_status: string | null;
  pi_stripe_id: string | null;
  handoff_status: string | null;
  items: AdminOrderItem[];
}

export async function listOrders(): Promise<AdminOrder[]> {
  ensureWeb();
  const { data, error } = await supabase.rpc('admin_list_orders');
  if (error) throw error;
  return (data as AdminOrder[]) ?? [];
}

export async function orderDetail(orderId: string): Promise<AdminOrderDetail | null> {
  ensureWeb();
  const { data, error } = await supabase.rpc('admin_order_detail', { p_order: orderId });
  if (error) throw error;
  const row = data?.[0] as AdminOrderDetail | undefined;
  if (!row) return null;
  // `items` arrives as jsonb; normalize to an array.
  return { ...row, items: Array.isArray(row.items) ? row.items : [] };
}

// --- Users / profiles (read-only; display_name + role only, no PII) ---
export interface AdminUser {
  user_id: string;
  display_name: string | null;
  role: string;
  verification_status: string | null;
  kitchen_id: string | null;
  kitchen_name: string | null;
  created_at: string;
}

export async function listUsers(): Promise<AdminUser[]> {
  ensureWeb();
  const { data, error } = await supabase.rpc('admin_list_users');
  if (error) throw error;
  return (data as AdminUser[]) ?? [];
}

/** Suspend an already-verified kitchen (audit Critical: no such capability existed at all,
 * despite the Cook Agreement promising Preppa can pause/suspend/remove a kitchen). */
export async function suspendKitchen(kitchenId: string, reason: string): Promise<void> {
  ensureWeb();
  const { error } = await supabase.rpc('admin_suspend_kitchen', { p_kitchen: kitchenId, p_reason: reason });
  if (error) throw error;
}

export async function reinstateKitchen(kitchenId: string): Promise<void> {
  ensureWeb();
  const { error } = await supabase.rpc('admin_reinstate_kitchen', { p_kitchen: kitchenId });
  if (error) throw error;
}

/** Change a user's role (audit High finding: role changes previously bypassed audit_log
 * entirely, done only via raw DB access). */
export async function setUserRole(userId: string, role: 'customer' | 'prepper' | 'admin'): Promise<void> {
  ensureWeb();
  const { error } = await supabase.rpc('admin_set_user_role', { p_user: userId, p_role: role });
  if (error) throw error;
}

// --- Audit log (read-only, keyset-paginated) ---
export interface AdminAuditEntry {
  id: string;
  actor_name: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export async function listAudit(opts: { limit?: number; before?: string | null } = {}): Promise<AdminAuditEntry[]> {
  ensureWeb();
  const { data, error } = await supabase.rpc('admin_list_audit', {
    p_limit: opts.limit ?? 100,
    p_before: opts.before ?? null,
  });
  if (error) throw error;
  return (data as AdminAuditEntry[]) ?? [];
}

// --- Waitlist (read-only, keyset-paginated) — captured by the marketing landing page ---
export interface AdminWaitlistEntry {
  id: string;
  email: string;
  zip: string | null;
  source: string | null;
  created_at: string;
}

export async function listWaitlist(opts: { limit?: number; before?: string | null } = {}): Promise<AdminWaitlistEntry[]> {
  ensureWeb();
  const { data, error } = await supabase.rpc('admin_list_waitlist', {
    p_limit: opts.limit ?? 100,
    p_before: opts.before ?? null,
  });
  if (error) throw error;
  return (data as AdminWaitlistEntry[]) ?? [];
}

export async function deleteWaitlistEntry(id: string): Promise<void> {
  ensureWeb();
  const { error } = await supabase.rpc('admin_delete_waitlist_entry', { p_id: id });
  if (error) throw error;
}

// --- Meal plans & subscriptions (read-only) ---
export interface AdminPlan {
  plan_id: string;
  kitchen_id: string;
  kitchen_name: string | null;
  name: string;
  status: string;
  price_cents: number;
  selection_model: string;
  fulfillment: string;
  subscriber_count: number;
  created_at: string;
}

export interface AdminPlanItem {
  meal_name: string;
  qty: number;
  price_cents: number;
}

export interface AdminPlanSubscriber {
  subscription_id: string;
  customer_name: string | null;
  lifecycle: string;
  created_at: string;
}

export interface AdminPlanDetail {
  plan_id: string;
  kitchen_name: string | null;
  name: string;
  description: string | null;
  status: string;
  price_cents: number;
  fulfillment: string;
  selection_model: string;
  per_meal_cents: number | null;
  per_delivery_cents: number | null;
  meals_per_delivery: number | null;
  servings: number | null;
  min_commitment: number;
  trial_price_cents: number | null;
  trial_cycles: number;
  created_at: string;
  items: AdminPlanItem[];
  subscribers: AdminPlanSubscriber[];
}

export async function listPlans(): Promise<AdminPlan[]> {
  ensureWeb();
  const { data, error } = await supabase.rpc('admin_list_plans');
  if (error) throw error;
  return (data as AdminPlan[]) ?? [];
}

export async function planDetail(planId: string): Promise<AdminPlanDetail | null> {
  ensureWeb();
  const { data, error } = await supabase.rpc('admin_plan_detail', { p_plan: planId });
  if (error) throw error;
  const row = data?.[0] as AdminPlanDetail | undefined;
  if (!row) return null;
  return {
    ...row,
    items: Array.isArray(row.items) ? row.items : [],
    subscribers: Array.isArray(row.subscribers) ? row.subscribers : [],
  };
}

export interface AdminSubscription {
  subscription_id: string;
  kitchen_name: string | null;
  customer_name: string | null;
  plan_name: string | null;
  kind: string;
  lifecycle: string;
  fulfillment: string | null;
  preferred_day: string | null;
  next_cycle_date: string | null;
  created_at: string;
}

export interface AdminSubscriptionCycle {
  cycle_id: string;
  status: string;
  payment_status: string;
  cycle_start: string;
  cycle_end: string;
  delivery_date: string;
  billing_date: string;
  total_cents: number;
  skipped: boolean;
}

export interface AdminSubscriptionDetail {
  subscription_id: string;
  kitchen_name: string | null;
  customer_name: string | null;
  plan_name: string | null;
  kind: string;
  lifecycle: string;
  fulfillment: string | null;
  preferred_day: string | null;
  billing_anchor: string | null;
  next_cycle_date: string | null;
  pause_until: string | null;
  cancel_at_cycle_end: boolean;
  failed_charge_count: number;
  trial_cycles_remaining: number;
  created_at: string;
  cycles: AdminSubscriptionCycle[];
}

export async function listSubscriptions(): Promise<AdminSubscription[]> {
  ensureWeb();
  const { data, error } = await supabase.rpc('admin_list_subscriptions');
  if (error) throw error;
  return (data as AdminSubscription[]) ?? [];
}

export async function subscriptionDetail(subscriptionId: string): Promise<AdminSubscriptionDetail | null> {
  ensureWeb();
  const { data, error } = await supabase.rpc('admin_subscription_detail', { p_subscription: subscriptionId });
  if (error) throw error;
  const row = data?.[0] as AdminSubscriptionDetail | undefined;
  if (!row) return null;
  return { ...row, cycles: Array.isArray(row.cycles) ? row.cycles : [] };
}

// --- Service requests, quotes & bookings (read-only) ---
export interface AdminServiceRequest {
  request_id: string;
  customer_name: string | null;
  category: string;
  status: string;
  event_date: string;
  budget_cents: number | null;
  quote_count: number;
  created_at: string;
}

export interface AdminServiceRequestQuote {
  quote_id: string;
  kitchen_name: string | null;
  amount_cents: number;
  deposit_cents: number;
  status: string;
  note: string | null;
  created_at: string;
}

export interface AdminServiceRequestBooking {
  booking_id: string;
  status: string;
  amount_cents: number;
  deposit_cents: number;
  balance_cents: number | null;
  created_at: string;
}

export interface AdminServiceRequestDetail {
  request_id: string;
  customer_name: string | null;
  category: string;
  status: string;
  event_date: string;
  event_time: string | null;
  approx_area: string | null;
  address_text: string | null;
  guests: number | null;
  budget_cents: number | null;
  details: string | null;
  answers: Record<string, unknown> | null;
  created_at: string;
  quotes: AdminServiceRequestQuote[];
  booking: AdminServiceRequestBooking | null;
}

export async function listServiceRequests(): Promise<AdminServiceRequest[]> {
  ensureWeb();
  const { data, error } = await supabase.rpc('admin_list_service_requests');
  if (error) throw error;
  return (data as AdminServiceRequest[]) ?? [];
}

export async function serviceRequestDetail(requestId: string): Promise<AdminServiceRequestDetail | null> {
  ensureWeb();
  const { data, error } = await supabase.rpc('admin_service_request_detail', { p_request: requestId });
  if (error) throw error;
  const row = data?.[0] as AdminServiceRequestDetail | undefined;
  if (!row) return null;
  return { ...row, quotes: Array.isArray(row.quotes) ? row.quotes : [] };
}

export interface AdminBooking {
  booking_id: string;
  booking_kind: string;
  kitchen_name: string | null;
  customer_name: string | null;
  status: string;
  amount_cents: number;
  deposit_cents: number;
  balance_cents: number | null;
  event_date: string;
  created_at: string;
}

export interface AdminBookingDetail {
  booking_id: string;
  booking_kind: string;
  kitchen_name: string | null;
  customer_name: string | null;
  status: string;
  amount_cents: number;
  deposit_cents: number;
  service_fee_cents: number;
  balance_cents: number | null;
  event_date: string;
  address_text: string | null;
  guests: number | null;
  created_at: string;
  confirmed_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  request: { request_id: string; category: string; details: string | null; answers: Record<string, unknown> } | null;
  quote: { quote_id: string; amount_cents: number; deposit_cents: number; note: string | null } | null;
}

export async function listBookings(): Promise<AdminBooking[]> {
  ensureWeb();
  const { data, error } = await supabase.rpc('admin_list_bookings');
  if (error) throw error;
  return (data as AdminBooking[]) ?? [];
}

export async function bookingDetail(bookingId: string): Promise<AdminBookingDetail | null> {
  ensureWeb();
  const { data, error } = await supabase.rpc('admin_booking_detail', { p_booking: bookingId });
  if (error) throw error;
  return (data?.[0] as AdminBookingDetail) ?? null;
}
