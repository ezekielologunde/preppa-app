import { supabase } from './supabase';

/**
 * Prepper-published Experience listings (cooking classes / supper clubs / private dinners) with
 * instant booking. Cook authoring goes through the `experience-upsert` edge fn (mirrors plan-upsert);
 * reads use RLS (owner sees own + published, public sees published-from-verified). Booking (E2) reuses
 * the bookings→reconcile→ledger→Connect payout money path. See src/lib/subscriptions.ts for the pattern.
 */

export type ExperienceType = 'class' | 'supper_club' | 'tasting' | 'workshop';
export type ExperienceStatus = 'draft' | 'pending' | 'published' | 'paused' | 'archived';

export interface ExperienceSession {
  id: string;
  startsAt: string;          // ISO
  capacity: number;
  status: 'open' | 'closed' | 'cancelled';
  seatsTaken: number;        // active held/booked seats
}
export interface Experience {
  id: string;
  kitchenId: string;
  kitchenName: string;
  title: string;
  description: string | null;
  experienceType: ExperienceType;
  category: string;
  coverUrl: string | null;
  photoUrls: string[];
  locationType: string;
  addressText: string | null;
  durationMin: number;
  minGuests: number;
  maxGuests: number;
  priceModel: 'per_person' | 'flat';
  perPersonCents: number | null;
  priceCents: number | null;
  whatsIncluded: string[];
  requirements: string | null;
  dietaryTags: string[];
  allergens: string[];
  cancellationPolicy: string;
  status: ExperienceStatus;
  meetingUrl: string | null;   // virtual join link — owner-readable only (null for public viewers)
  sessions: ExperienceSession[];
}

const SELECT =
  'id, kitchen_id, title, description, experience_type, category, cover_url, photo_urls, location_type, address_text, duration_min, min_guests, max_guests, price_model, per_person_cents, price_cents, whats_included, requirements, dietary_tags, allergens, cancellation_policy, status, kitchens(name)';

function rowToExperience(r: any, sessions: ExperienceSession[] = [], meetingUrl: string | null = null): Experience {
  return {
    meetingUrl,
    id: r.id, kitchenId: r.kitchen_id, kitchenName: r.kitchens?.name ?? 'A local cook',
    title: r.title, description: r.description ?? null,
    experienceType: (r.experience_type ?? 'class') as ExperienceType, category: r.category,
    coverUrl: r.cover_url ?? null, photoUrls: r.photo_urls ?? [],
    locationType: r.location_type ?? 'prepper_place', addressText: r.address_text ?? null,
    durationMin: r.duration_min ?? 120, minGuests: r.min_guests ?? 1, maxGuests: r.max_guests ?? 8,
    priceModel: (r.price_model ?? 'per_person'), perPersonCents: r.per_person_cents ?? null, priceCents: r.price_cents ?? null,
    whatsIncluded: r.whats_included ?? [], requirements: r.requirements ?? null,
    dietaryTags: r.dietary_tags ?? [], allergens: r.allergens ?? [],
    cancellationPolicy: r.cancellation_policy ?? 'strict', status: (r.status ?? 'draft') as ExperienceStatus,
    sessions,
  };
}

/** Active (unreleased) held/booked seats per session, for a set of session ids. */
async function seatsBySession(sessionIds: string[]): Promise<Record<string, number>> {
  if (!sessionIds.length) return {};
  const { data } = await supabase
    .from('experience_seat_reservations')
    .select('session_id, guests')
    .in('session_id', sessionIds)
    .is('released_at', null);
  const m: Record<string, number> = {};
  for (const r of (data as any[] ?? [])) m[r.session_id] = (m[r.session_id] ?? 0) + (r.guests ?? 0);
  return m;
}

async function sessionsFor(experienceId: string): Promise<ExperienceSession[]> {
  const { data } = await supabase
    .from('experience_sessions')
    .select('id, starts_at, capacity, status')
    .eq('experience_id', experienceId)
    .order('starts_at', { ascending: true });
  const rows = (data as any[]) ?? [];
  const taken = await seatsBySession(rows.map((s) => s.id));
  return rows.map((s) => ({ id: s.id, startsAt: s.starts_at, capacity: s.capacity, status: s.status, seatsTaken: taken[s.id] ?? 0 }));
}

/** The signed-in cook's experiences (all statuses), each with its sessions. */
export async function fetchMyExperiences(): Promise<Experience[]> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) return [];
  const { data: k } = await supabase.from('kitchens').select('id').eq('owner_id', uid).limit(1).maybeSingle();
  if (!k) return [];
  const { data, error } = await supabase.from('experiences').select(SELECT).eq('kitchen_id', (k as any).id).order('created_at', { ascending: false });
  if (error || !data) return [];
  const rows = data as any[];
  return Promise.all(rows.map(async (r) => rowToExperience(r, await sessionsFor(r.id))));
}

/** A single experience by id (+ sessions). Null if not visible (RLS) or not a real id. */
export async function fetchExperience(id: string): Promise<Experience | null> {
  const { data, error } = await supabase.from('experiences').select(SELECT).eq('id', id).maybeSingle();
  if (error || !data) return null;
  // meeting_url is owner-readable only (RLS) → null for public viewers; used for wizard edit prefill
  const { data: priv } = await supabase.from('experience_private').select('meeting_url').eq('experience_id', id).maybeSingle();
  return rowToExperience(data, await sessionsFor(id), (priv as any)?.meeting_url ?? null);
}

/** The join link for a virtual experience — only returned to a customer WITH a confirmed booking. */
export async function fetchExperienceMeetingUrl(experienceId: string): Promise<string | null> {
  const { data } = await supabase.rpc('experience_private_details', { p_experience: experienceId });
  return (data as any[])?.[0]?.meeting_url ?? null;
}

/** Published experiences for the customer browse (E2 surface). */
export async function fetchExperiences(): Promise<Experience[]> {
  const { data, error } = await supabase.from('experiences').select(SELECT).eq('status', 'published').order('created_at', { ascending: false });
  if (error || !data) return [];
  return Promise.all((data as any[]).map(async (r) => rowToExperience(r, await sessionsFor(r.id))));
}

/** A kitchen's published experiences — for its storefront. */
export async function fetchExperiencesForKitchen(kitchenId: string): Promise<Experience[]> {
  const { data, error } = await supabase.from('experiences').select(SELECT).eq('status', 'published').eq('kitchen_id', kitchenId).order('created_at', { ascending: false });
  if (error || !data) return [];
  return Promise.all((data as any[]).map(async (r) => rowToExperience(r, await sessionsFor(r.id))));
}

export interface UpsertExperienceInput {
  experienceId?: string;
  title: string;
  description?: string;
  experienceType?: ExperienceType;
  coverUrl?: string;
  photoUrls?: string[];
  locationType?: string;
  addressText?: string;
  meetingUrl?: string;
  durationMin?: number;
  minGuests?: number;
  maxGuests?: number;
  priceModel?: 'per_person' | 'flat';
  perPersonCents?: number;
  priceCents?: number;
  whatsIncluded?: string[];
  requirements?: string;
  dietaryTags?: string[];
  allergens?: string[];
  cancellationPolicy?: 'flexible' | 'standard' | 'strict';
  submit?: boolean;
  sessions?: { id?: string; startsAt: string; capacity: number; status?: 'open' | 'closed' | 'cancelled' }[];
}
export async function upsertExperience(input: UpsertExperienceInput): Promise<{ experienceId: string; status: string }> {
  const { data, error } = await supabase.functions.invoke('experience-upsert', { body: input });
  if (error || data?.error) throw new Error(data?.error || error?.message || 'Could not save the experience.');
  return { experienceId: data.experienceId, status: data.status };
}

// ---- Booking (E2) ----------------------------------------------------------------------
export interface Availability { sessionId: string; startsAt: string; capacity: number; seatsLeft: number; status: string }
/** Public seats-left per session for a published experience (SECURITY DEFINER RPC; anon-safe). */
export async function fetchAvailability(experienceId: string): Promise<Availability[]> {
  const { data } = await supabase.rpc('experience_availability', { p_experience: experienceId });
  return (data as any[] ?? []).map((r) => ({ sessionId: r.session_id, startsAt: r.starts_at, capacity: r.capacity, seatsLeft: r.seats_left, status: r.status }));
}
/** Instant-book a session: atomic seat claim + full-payment PaymentIntent. Confirm the clientSecret in CardPaymentSheet. */
export async function bookExperience(experienceId: string, sessionId: string, guests: number): Promise<{ bookingId: string; clientSecret: string | null; amountCents: number }> {
  const { data, error } = await supabase.functions.invoke('book-experience', { body: { experienceId, sessionId, guests } });
  if (error || data?.error) throw new Error(data?.error || error?.message || 'Could not start your booking.');
  return { bookingId: data.bookingId, clientSecret: data.clientSecret, amountCents: data.amountCents };
}

// ---- Reviews (E4) ----------------------------------------------------------------------
/** Rate an attended experience (feeds the kitchen's rating + storefront reviews). One per booking. */
export async function reviewExperience(bookingId: string, rating: number, body: string): Promise<void> {
  const { error } = await supabase.rpc('review_experience', { p_booking: bookingId, p_rating: rating, p_body: body });
  if (error) throw error;
}

export interface ExperienceRating { avg: number; count: number }
export interface ExperienceReview { rating: number; body: string | null; author: string; createdAt: string }
/** An experience's aggregate rating (public). */
export async function fetchExperienceRating(experienceId: string): Promise<ExperienceRating> {
  const { data } = await supabase.rpc('experience_rating', { p_experience: experienceId });
  const r = (data as any[])?.[0];
  return { avg: Number(r?.rating_avg) || 0, count: Number(r?.rating_count) || 0 };
}
/** An experience's reviews (public). */
export async function fetchExperienceReviews(experienceId: string): Promise<ExperienceReview[]> {
  const { data } = await supabase.rpc('experience_reviews', { p_experience: experienceId, p_limit: 20 });
  return (data as any[] ?? []).map((r) => ({ rating: r.rating, body: r.body ?? null, author: r.author, createdAt: r.created_at }));
}

// ---- Waitlist (E4) ---------------------------------------------------------------------
/** Which of the given sessions the signed-in customer is already waitlisted for (RLS-scoped to self). */
export async function fetchMyWaitlistSessions(sessionIds: string[]): Promise<string[]> {
  if (!sessionIds.length) return [];
  const { data } = await supabase.from('experience_waitlist').select('session_id').in('session_id', sessionIds);
  return (data as any[] ?? []).map((r) => r.session_id);
}
export async function joinWaitlist(sessionId: string, guests: number): Promise<void> {
  const { error } = await supabase.rpc('join_experience_waitlist', { p_session: sessionId, p_guests: guests });
  if (error) throw error;
}
export async function leaveWaitlist(sessionId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_experience_waitlist', { p_session: sessionId });
  if (error) throw error;
}

// ---- Cancellation (E3) -----------------------------------------------------------------
/** Customer cancels their experience booking. Refund per the experience's cancellation policy. */
export async function cancelExperienceBooking(bookingId: string): Promise<{ refundedCents: number; status: string }> {
  const { data, error } = await supabase.functions.invoke('cancel-experience-booking', { body: { bookingId } });
  if (error || data?.error) throw new Error(data?.error || error?.message || 'Could not cancel this booking.');
  return { refundedCents: data.refundedCents ?? 0, status: data.status };
}
/** Cook cancels one of their sessions — every live booking is fully refunded + customers notified. */
export async function cancelExperienceSession(sessionId: string): Promise<{ cancelledBookings: number; refunded: number }> {
  const { data, error } = await supabase.functions.invoke('cancel-experience-session', { body: { sessionId } });
  if (error || data?.error) throw new Error(data?.error || error?.message || 'Could not cancel the session.');
  return { cancelledBookings: data.cancelledBookings ?? 0, refunded: data.refunded ?? 0 };
}

// ---- Admin review ----------------------------------------------------------------------
/** Pending experiences awaiting review (admin-readable via RLS). */
export async function fetchPendingExperiences(): Promise<Experience[]> {
  const { data, error } = await supabase.from('experiences').select(SELECT).eq('status', 'pending').order('created_at', { ascending: true });
  if (error || !data) return [];
  return Promise.all((data as any[]).map(async (r) => rowToExperience(r, await sessionsFor(r.id))));
}
export async function adminSetExperienceStatus(experienceId: string, status: 'published' | 'archived' | 'paused'): Promise<void> {
  const { error } = await supabase.rpc('admin_set_experience_status', { p_experience: experienceId, p_status: status });
  if (error) throw error;
}
