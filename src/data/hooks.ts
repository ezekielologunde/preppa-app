/**
 * Async data hooks over the repository seam (council #7a). These give screens a
 * ready-made loading/error contract for when the backend lands — adopt incrementally.
 */
import { useEffect, useState, useMemo } from 'react';
import { getRepositories, MealQuery } from './repository';
import { filterMeals, sortByProximity } from './supabaseRepository';
import { Meal, Cook, CookId } from './data';
import * as admin from '../lib/admin';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/store';
import { distanceKm, distanceLabel, type LatLng } from '../lib/geo';
import { useCachedAsync } from './cache';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

export function useAsync<T>(run: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });
  useEffect(() => {
    let alive = true;
    setState({ data: null, loading: true, error: null });
    run()
      .then((data) => alive && setState({ data, loading: false, error: null }))
      .catch((error) => alive && setState({ data: null, loading: false, error }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

// One cached catalog fetch ('catalog:live') serves Home, Discover, and every storefront.
// Filtering (cook/kitchen/cat/q) and proximity sort are pure client-side transforms, so a
// coords change re-sorts in memory with no refetch, and no spinner on remount.
export function useMeals(query?: MealQuery): AsyncState<Meal[]> {
  const { coords } = useStore();
  const { data, loading, error } = useCachedAsync<Meal[]>('catalog:live', () => getRepositories().meals.list());
  const meals = useMemo(
    () => (data ? sortByProximity(filterMeals(data, query), coords ?? null) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, query?.cook, query?.kitchenUuid, query?.cat, query?.q, query?.mode, coords?.lat, coords?.lng],
  );
  return { data: data ? meals : null, loading, error };
}
export function useMeal(id: string): AsyncState<Meal | null> {
  return useCachedAsync<Meal | null>('meal:' + id, () => getRepositories().meals.byId(id));
}
export function useCook(id: CookId): AsyncState<Cook | null> {
  return useAsync(() => getRepositories().cooks.byId(id), [id]);
}

// --- Real reviews from the DB (empty until buyers review a completed order) ---
export interface KitchenReview { id: string; rating: number; body: string | null; created_at: string }
export interface KitchenReviewSummary { reviews: KitchenReview[]; count: number; avg: number }
const EMPTY_REVIEWS: KitchenReviewSummary = { reviews: [], count: 0, avg: 0 };
async function fetchReviews(kitchenId: string): Promise<KitchenReviewSummary> {
  const { data, error } = await supabase
    .from('reviews').select('id,rating,body,created_at').eq('kitchen_id', kitchenId).order('created_at', { ascending: false });
  if (error) throw error;
  const reviews = (data ?? []) as KitchenReview[];
  const count = reviews.length;
  return { reviews, count, avg: count ? reviews.reduce((s, r) => s + r.rating, 0) / count : 0 };
}
// Cached by kitchen — the screen and its <ReviewsBlock> share one fetch (previously fired 2×).
export function useKitchenReviews(kitchenId?: string): AsyncState<KitchenReviewSummary> {
  const { data, loading, error } = useCachedAsync<KitchenReviewSummary>(kitchenId ? 'reviews:' + kitchenId : null, () => fetchReviews(kitchenId!));
  return { data: data ?? EMPTY_REVIEWS, loading, error };
}

// --- Real prepper discovery (verified kitchens, from the public read layer) ---
export interface KitchenCard {
  id: string; name: string; slug: string; cuisine: string; area: string;
  avatarUrl: string | null; lat?: number; lng?: number; specialties: string[];
  ratingAvg: number; ratingCount: number; distKm?: number; dist?: string; isPro?: boolean;
}
export interface KitchenProfile extends KitchenCard {
  bio: string | null; coverUrl: string | null; yearsActive: number | null; availability: string;
}

const KP_COLS = 'id,name,slug,cuisine,bio,approx_area,approx_lat,approx_lng,avatar_url,cover_url,specialties,years_active,availability,is_pro';

async function fetchKitchensRaw(): Promise<KitchenCard[]> {
  const [{ data: ks, error }, { data: rs }] = await Promise.all([
    supabase.from('kitchen_public').select('id,name,slug,cuisine,approx_area,approx_lat,approx_lng,avatar_url,specialties,is_pro'),
    supabase.from('kitchen_rating').select('kitchen_id,rating_avg,rating_count'),
  ]);
  if (error) throw error;
  const rating = new Map((rs ?? []).map((r: any) => [r.kitchen_id, r]));
  return (ks ?? []).map((k: any) => {
    const lat = k.approx_lat != null ? Number(k.approx_lat) : NaN;
    const lng = k.approx_lng != null ? Number(k.approx_lng) : NaN;
    const r = rating.get(k.id);
    return {
      id: k.id, name: k.name, slug: k.slug, cuisine: k.cuisine ?? '', area: k.approx_area ?? '',
      avatarUrl: k.avatar_url ?? null, lat: Number.isFinite(lat) ? lat : undefined, lng: Number.isFinite(lng) ? lng : undefined,
      specialties: (k.specialties as string[]) ?? [], ratingAvg: r ? Number(r.rating_avg) : 0, ratingCount: r ? Number(r.rating_count) : 0,
      isPro: !!k.is_pro,
    } as KitchenCard;
  });
}
// Preppa Pro kitchens sort ahead of non-members at the same tier first (the "priority
// placement" membership perk), distance/name only breaking ties within the same pro/non-pro
// group — mirrors applyProximity's identical treatment of the meals catalog.
function sortKitchens(list: KitchenCard[], coords: LatLng | null): KitchenCard[] {
  const out = [...list];
  const proRank = (k: KitchenCard) => (k.isPro ? 0 : 1);
  if (coords) {
    for (const k of out) if (typeof k.lat === 'number' && typeof k.lng === 'number') { k.distKm = distanceKm(coords, { lat: k.lat, lng: k.lng }); k.dist = distanceLabel(k.distKm); }
    return out.sort((a, b) => proRank(a) - proRank(b) || (a.distKm ?? Infinity) - (b.distKm ?? Infinity) || a.name.localeCompare(b.name));
  }
  return out.sort((a, b) => proRank(a) - proRank(b) || a.name.localeCompare(b.name));
}
/** The directory of verified kitchens — cached once; nearest-first re-sort is client-side. */
export function useKitchens(): AsyncState<KitchenCard[]> {
  const { coords } = useStore();
  const { data, loading, error } = useCachedAsync<KitchenCard[]>('kitchens:public', fetchKitchensRaw);
  const list = useMemo(() => (data ? sortKitchens(data, coords ?? null) : []), [data, coords?.lat, coords?.lng]);
  return { data: data ? list : null, loading, error };
}

function buildProfile(k: any, r: any): KitchenProfile {
  const lat = k.approx_lat != null ? Number(k.approx_lat) : NaN;
  const lng = k.approx_lng != null ? Number(k.approx_lng) : NaN;
  return {
    id: k.id, name: k.name, slug: k.slug, cuisine: k.cuisine ?? '', area: k.approx_area ?? '',
    avatarUrl: k.avatar_url ?? null, lat: Number.isFinite(lat) ? lat : undefined, lng: Number.isFinite(lng) ? lng : undefined,
    specialties: (k.specialties as string[]) ?? [], ratingAvg: r ? Number(r.rating_avg) : 0, ratingCount: r ? Number(r.rating_count) : 0,
    bio: k.bio ?? null, coverUrl: k.cover_url ?? null, yearsActive: k.years_active ?? null, availability: k.availability ?? 'open',
    isPro: !!k.is_pro,
  };
}
async function fetchKitchenProfile(idOrSlug: string): Promise<KitchenProfile | null> {
  if (UUID_RE.test(idOrSlug)) {
    // uuid → profile + rating in parallel (rating keys off the same id)
    const [{ data, error }, { data: r }] = await Promise.all([
      supabase.from('kitchen_public').select(KP_COLS).eq('id', idOrSlug).maybeSingle(),
      supabase.from('kitchen_rating').select('rating_avg,rating_count').eq('kitchen_id', idOrSlug).maybeSingle(),
    ]);
    if (error) throw error;
    return data ? buildProfile(data, r) : null;
  }
  const { data, error } = await supabase.from('kitchen_public').select(KP_COLS).eq('slug', idOrSlug).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: r } = await supabase.from('kitchen_rating').select('rating_avg,rating_count').eq('kitchen_id', (data as any).id).maybeSingle();
  return buildProfile(data, r);
}
/** One verified kitchen's public profile, by UUID or slug (cached). */
export function useKitchenProfile(idOrSlug?: string): AsyncState<KitchenProfile | null> {
  return useCachedAsync<KitchenProfile | null>(idOrSlug ? 'kitchen:' + idOrSlug : null, () => fetchKitchenProfile(idOrSlug!));
}

// --- Admin dashboard hooks (Phase 1). `nonce` lets a screen force a refetch. ---
export function useAdminOverview(nonce = 0): AsyncState<admin.AdminOverview> {
  return useAsync(() => admin.overview(), [nonce]);
}
export function useAdminApplications(nonce = 0): AsyncState<admin.AdminApplication[]> {
  return useAsync(() => admin.listApplications(), [nonce]);
}
export function useAdminTickets(nonce = 0): AsyncState<admin.AdminTicket[]> {
  return useAsync(() => admin.listTickets(), [nonce]);
}
export function useAdminOrders(nonce = 0): AsyncState<admin.AdminOrder[]> {
  return useAsync(() => admin.listOrders(), [nonce]);
}
export function useAdminUsers(nonce = 0): AsyncState<admin.AdminUser[]> {
  return useAsync(() => admin.listUsers(), [nonce]);
}
export function useAdminAudit(nonce = 0): AsyncState<admin.AdminAuditEntry[]> {
  return useAsync(() => admin.listAudit(), [nonce]);
}
export function useAdminPlans(nonce = 0): AsyncState<admin.AdminPlan[]> {
  return useAsync(() => admin.listPlans(), [nonce]);
}
export function useAdminSubscriptions(nonce = 0): AsyncState<admin.AdminSubscription[]> {
  return useAsync(() => admin.listSubscriptions(), [nonce]);
}
export function useAdminServiceRequests(nonce = 0): AsyncState<admin.AdminServiceRequest[]> {
  return useAsync(() => admin.listServiceRequests(), [nonce]);
}
export function useAdminBookings(nonce = 0): AsyncState<admin.AdminBooking[]> {
  return useAsync(() => admin.listBookings(), [nonce]);
}
