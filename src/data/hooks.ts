/**
 * Async data hooks over the repository seam (council #7a). These give screens a
 * ready-made loading/error contract for when the backend lands — adopt incrementally.
 */
import { useEffect, useState } from 'react';
import { getRepositories, MealQuery } from './repository';
import { Meal, Cook, CookId } from './data';
import * as admin from '../lib/admin';
import { supabase } from '../lib/supabase';

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
  return useAsync(() => getRepositories().meals.list(query), [query?.cook, query?.cat, query?.q]);
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
