/**
 * Async data hooks over the repository seam (council #7a). These give screens a
 * ready-made loading/error contract for when the backend lands — adopt incrementally.
 */
import { useEffect, useState } from 'react';
import { getRepositories, MealQuery } from './repository';
import { Meal, Cook, CookId } from './data';
import * as admin from '../lib/admin';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/store';
import { distanceKm, distanceLabel } from '../lib/geo';

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

export function useMeals(query?: MealQuery): AsyncState<Meal[]> {
  const { coords } = useStore(); // re-sort nearest-first when the viewer's location changes
  return useAsync(() => getRepositories().meals.list(query), [query?.cook, query?.kitchenUuid, query?.cat, query?.q, coords?.lat, coords?.lng]);
}
export function useMeal(id: string): AsyncState<Meal | null> {
  return useAsync(() => getRepositories().meals.byId(id), [id]);
}
export function useCook(id: CookId): AsyncState<Cook | null> {
  return useAsync(() => getRepositories().cooks.byId(id), [id]);
}

// --- Real reviews from the DB (empty until buyers review a completed order) ---
export interface KitchenReview { id: string; rating: number; body: string | null; created_at: string }
export interface KitchenReviewSummary { reviews: KitchenReview[]; count: number; avg: number }
export function useKitchenReviews(kitchenId?: string): AsyncState<KitchenReviewSummary> {
  return useAsync(async () => {
    if (!kitchenId) return { reviews: [], count: 0, avg: 0 };
    const { data, error } = await supabase
      .from('reviews')
      .select('id,rating,body,created_at')
      .eq('kitchen_id', kitchenId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const reviews = (data ?? []) as KitchenReview[];
    const count = reviews.length;
    const avg = count ? reviews.reduce((s, r) => s + r.rating, 0) / count : 0;
    return { reviews, count, avg };
  }, [kitchenId]);
}

// --- Real prepper discovery (verified kitchens, from the public read layer) ---
export interface KitchenCard {
  id: string; name: string; slug: string; cuisine: string; area: string;
  avatarUrl: string | null; lat?: number; lng?: number; specialties: string[];
  ratingAvg: number; ratingCount: number; distKm?: number; dist?: string;
}
export interface KitchenProfile extends KitchenCard {
  bio: string | null; coverUrl: string | null; yearsActive: number | null; availability: string;
}

const KP_COLS = 'id,name,slug,cuisine,bio,approx_area,approx_lat,approx_lng,avatar_url,cover_url,specialties,years_active,availability';

/** The directory of verified kitchens — nearest-first when the viewer has coords. */
export function useKitchens(): AsyncState<KitchenCard[]> {
  const { coords } = useStore();
  return useAsync(async () => {
    const [{ data: ks, error }, { data: rs }] = await Promise.all([
      supabase.from('kitchen_public').select('id,name,slug,cuisine,approx_area,approx_lat,approx_lng,avatar_url,specialties'),
      supabase.from('kitchen_rating').select('kitchen_id,rating_avg,rating_count'),
    ]);
    if (error) throw error;
    const rating = new Map((rs ?? []).map((r: any) => [r.kitchen_id, r]));
    const out: KitchenCard[] = (ks ?? []).map((k: any) => {
      const lat = k.approx_lat != null ? Number(k.approx_lat) : NaN;
      const lng = k.approx_lng != null ? Number(k.approx_lng) : NaN;
      const r = rating.get(k.id);
      return {
        id: k.id, name: k.name, slug: k.slug, cuisine: k.cuisine ?? '', area: k.approx_area ?? '',
        avatarUrl: k.avatar_url ?? null, lat: Number.isFinite(lat) ? lat : undefined, lng: Number.isFinite(lng) ? lng : undefined,
        specialties: (k.specialties as string[]) ?? [], ratingAvg: r ? Number(r.rating_avg) : 0, ratingCount: r ? Number(r.rating_count) : 0,
      };
    });
    if (coords) {
      for (const k of out) if (typeof k.lat === 'number' && typeof k.lng === 'number') { k.distKm = distanceKm(coords, { lat: k.lat, lng: k.lng }); k.dist = distanceLabel(k.distKm); }
      out.sort((a, b) => (a.distKm ?? Infinity) - (b.distKm ?? Infinity) || a.name.localeCompare(b.name));
    } else out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [coords?.lat, coords?.lng]);
}

/** One verified kitchen's public profile, by UUID or slug. */
export function useKitchenProfile(idOrSlug?: string): AsyncState<KitchenProfile | null> {
  return useAsync(async () => {
    if (!idOrSlug) return null;
    const col = UUID_RE.test(idOrSlug) ? 'id' : 'slug';
    const { data, error } = await supabase.from('kitchen_public').select(KP_COLS).eq(col, idOrSlug).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const k: any = data;
    const { data: r } = await supabase.from('kitchen_rating').select('rating_avg,rating_count').eq('kitchen_id', k.id).maybeSingle();
    const lat = k.approx_lat != null ? Number(k.approx_lat) : NaN;
    const lng = k.approx_lng != null ? Number(k.approx_lng) : NaN;
    return {
      id: k.id, name: k.name, slug: k.slug, cuisine: k.cuisine ?? '', area: k.approx_area ?? '',
      avatarUrl: k.avatar_url ?? null, lat: Number.isFinite(lat) ? lat : undefined, lng: Number.isFinite(lng) ? lng : undefined,
      specialties: (k.specialties as string[]) ?? [], ratingAvg: r ? Number((r as any).rating_avg) : 0, ratingCount: r ? Number((r as any).rating_count) : 0,
      bio: k.bio ?? null, coverUrl: k.cover_url ?? null, yearsActive: k.years_active ?? null, availability: k.availability ?? 'open',
    };
  }, [idOrSlug]);
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
