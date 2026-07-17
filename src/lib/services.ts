import { supabase } from './supabase';

/**
 * Food-Services marketplace client: request → quote → book → deposit. Preppa is the hub —
 * the deposit is charged on Preppa; the cook is credited (net of the Stripe fee) via the
 * reconcile trigger; the balance is auto-charged to the customer's saved card when the booking
 * is marked complete (see completeBooking()). Web-first (Stripe.js for the deposit).
 */

export type ServiceCategory = 'cook_at_home' | 'private_dinner' | 'catering' | 'consultation' | 'class' | 'meal_plan';
export const SERVICE_LABELS: Record<ServiceCategory, string> = {
  cook_at_home: 'Cook at my home',
  private_dinner: 'Private dinner',
  catering: 'Catering',
  consultation: 'Meal-prep consultation',
  class: 'Cooking class',
  meal_plan: 'Weekly meal plan',
};

export interface QuoteView { id: string; kitchenId: string; kitchenName: string; amountCents: number; depositCents: number; note: string | null; status: string }
export interface RequestView {
  id: string; category: ServiceCategory; eventDate: string; eventTime?: string | null; approxArea: string | null;
  addressText?: string | null; guests: number | null; budgetCents: number | null; details: string | null;
  answers?: Record<string, any>; status: string; fulfilledPlanId?: string | null; quotes: QuoteView[];
}
export interface BookingView {
  id: string; kitchenName: string; status: string; amountCents: number; depositCents: number; balanceCents: number; eventDate: string;
  kind: string; title: string | null;   // kind='experience' → title is the experience name
  reviewed: boolean;                     // experience booking already rated
  experienceId: string | null; locationType: string | null;  // for the online join-link surface
}
export interface IncomingRequest {
  requestId: string; kitchenId: string; category: ServiceCategory; eventDate: string; approxArea: string | null;
  guests: number | null; budgetCents: number | null; details: string | null; myQuoteId: string | null; myAmountCents: number | null;
}
export interface KitchenBookingView {
  id: string; customerName: string; status: string; amountCents: number; depositCents: number; balanceCents: number; eventDate: string;
}

const num = (v: any) => Number(v) || 0;

/** The customer's own requests + the quotes on them (customer view). */
export async function listMyRequests(): Promise<RequestView[]> {
  const { data: sess } = await supabase.auth.getSession();
  if (!sess.session?.user) return [];
  const { data, error } = await supabase
    .from('service_requests')
    .select('id, category, event_date, event_time, approx_area, address_text, guests, budget_cents, details, answers, status, fulfilled_plan_id, quotes(id, kitchen_id, amount_cents, deposit_cents, note, status, kitchens(name))')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return (data as any[]).map(rowToRequest);
}

function rowToRequest(r: any): RequestView {
  return {
    id: r.id, category: r.category, eventDate: r.event_date, eventTime: r.event_time, approxArea: r.approx_area,
    addressText: r.address_text, guests: r.guests, budgetCents: r.budget_cents, details: r.details,
    answers: r.answers ?? {}, status: r.status, fulfilledPlanId: r.fulfilled_plan_id ?? null,
    quotes: (r.quotes ?? []).map((q: any) => ({ id: q.id, kitchenId: q.kitchen_id, kitchenName: q.kitchens?.name ?? 'A prepper', amountCents: num(q.amount_cents), depositCents: num(q.deposit_cents), note: q.note, status: q.status })),
  };
}

/** A cook links a published plan to a customer's meal-plan brief (notifies the customer). */
export async function fulfillPlanRequest(requestId: string, planId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('fulfill-plan-request', { body: { requestId, planId } });
  if (error || data?.error) throw new Error(data?.error || error?.message || 'Could not link the plan.');
}

/** A single request (owner-scoped by RLS), with its quotes. */
export async function fetchServiceRequest(id: string): Promise<RequestView | null> {
  const { data, error } = await supabase
    .from('service_requests')
    .select('id, category, event_date, event_time, approx_area, address_text, guests, budget_cents, details, answers, status, fulfilled_plan_id, quotes(id, kitchen_id, amount_cents, deposit_cents, note, status, kitchens(name))')
    .eq('id', id).maybeSingle();
  if (error || !data) return null;
  return rowToRequest(data);
}

export interface ServiceRequestBody {
  category: ServiceCategory; eventDate: string; eventTime?: string; address?: string; lat?: number; lng?: number;
  approxArea?: string; guests?: number; budgetCents?: number; details?: string; answers?: Record<string, any>;
}

/** Edit an OPEN request (server enforces status='open' + re-routes on category/location change). */
export async function editServiceRequest(requestId: string, patch: Partial<ServiceRequestBody>): Promise<{ newTargets: number }> {
  const { data, error } = await supabase.functions.invoke('edit-service-request', { body: { requestId, action: 'edit', ...patch } });
  if (error || data?.error) throw new Error(data?.error || error?.message || 'Could not update your request.');
  return { newTargets: data.newTargets ?? 0 };
}

/** Cancel a request that isn't already booked/cancelled. */
export async function cancelServiceRequest(requestId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('edit-service-request', { body: { requestId, action: 'cancel' } });
  if (error || data?.error) throw new Error(data?.error || error?.message || 'Could not cancel your request.');
}

/** The customer's service bookings. */
export async function listMyBookings(): Promise<BookingView[]> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) return [];
  const { data, error } = await supabase
    .from('bookings')
    .select('id, status, amount_cents, deposit_cents, balance_cents, event_date, booking_kind, experience_id, kitchens(name), experiences(title, location_type)')
    .eq('customer_id', uid)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  const rows = data as any[];
  const expIds = rows.filter((b) => b.booking_kind === 'experience').map((b) => b.id);
  let reviewed = new Set<string>();
  if (expIds.length) {
    const { data: rv } = await supabase.from('reviews').select('booking_id').in('booking_id', expIds);
    reviewed = new Set((rv as any[] ?? []).map((r) => r.booking_id));
  }
  return rows.map((b) => ({ id: b.id, kitchenName: b.kitchens?.name ?? 'A prepper', status: b.status, amountCents: num(b.amount_cents), depositCents: num(b.deposit_cents), balanceCents: num(b.balance_cents), eventDate: b.event_date, kind: b.booking_kind ?? 'rfq', title: b.experiences?.title ?? null, reviewed: reviewed.has(b.id), experienceId: b.experience_id ?? null, locationType: b.experiences?.location_type ?? null }));
}

/** A prepper's already-accepted rfq bookings (confirmed/in_progress) — ready to complete or cancel.
 *  Goes through prepper_active_bookings() rather than a direct query: profiles' RLS only lets a
 *  cook read their own profile or another verified cook's, not a customer's, so a plain join
 *  would silently return no name. */
export async function listMyKitchenBookings(): Promise<KitchenBookingView[]> {
  const { data, error } = await supabase.rpc('prepper_active_bookings');
  if (error || !data) return [];
  return (data as any[]).map((b) => ({
    id: b.booking_id, customerName: b.customer_name ?? 'A customer', status: b.status,
    amountCents: num(b.amount_cents), depositCents: num(b.deposit_cents), balanceCents: num(b.balance_cents), eventDate: b.event_date,
  }));
}

/** A prepper's incoming (routed) requests. */
export async function listIncomingRequests(): Promise<IncomingRequest[]> {
  const { data, error } = await supabase.rpc('prepper_incoming_requests');
  if (error || !data) return [];
  return (data as any[]).map((r) => ({
    requestId: r.request_id, kitchenId: r.kitchen_id, category: r.category, eventDate: r.event_date, approxArea: r.approx_area,
    guests: r.guests, budgetCents: r.budget_cents, details: r.details, myQuoteId: r.my_quote_id, myAmountCents: r.my_amount_cents != null ? num(r.my_amount_cents) : null,
  }));
}

export async function createServiceRequest(body: ServiceRequestBody): Promise<{ requestId: string; targets: number }> {
  const { data, error } = await supabase.functions.invoke('create-service-request', { body });
  if (error || data?.error) throw new Error(data?.error || error?.message || 'Could not post your request.');
  return { requestId: data.requestId, targets: data.targets };
}

export async function submitQuote(body: { requestId: string; amountCents: number; depositCents: number; note?: string }): Promise<string> {
  const { data, error } = await supabase.functions.invoke('submit-quote', { body });
  if (error || data?.error) throw new Error(data?.error || error?.message || 'Could not submit your quote.');
  return data.quoteId;
}

export async function acceptQuoteAndDeposit(quoteId: string): Promise<{ bookingId: string; clientSecret: string | null; depositCents?: number }> {
  const { data, error } = await supabase.functions.invoke('accept-quote-and-deposit', { body: { quoteId } });
  if (error || data?.error) throw new Error(data?.error || error?.message || 'Could not start your booking.');
  return { bookingId: data.bookingId, clientSecret: data.clientSecret, depositCents: data.depositCents };
}

export async function completeBooking(bookingId: string): Promise<{ balanceCharged: boolean; balanceChargeError: string | null }> {
  const { data, error } = await supabase.functions.invoke('complete-booking', { body: { bookingId } });
  if (error || data?.error) throw new Error(data?.error || error?.message || 'Could not update the booking.');
  return { balanceCharged: !!data?.balanceCharged, balanceChargeError: data?.balanceChargeError ?? null };
}
export async function cancelBooking(bookingId: string): Promise<{ refunded: boolean }> {
  const { data, error } = await supabase.functions.invoke('cancel-booking', { body: { bookingId } });
  if (error || data?.error) throw new Error(data?.error || error?.message || 'Could not cancel the booking.');
  return { refunded: !!data?.refunded };
}
