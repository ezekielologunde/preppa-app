/**
 * Repository seam (council #7a). Screens should read catalog data through these
 * interfaces instead of importing catalog arrays directly. The customer meal catalog
 * is Supabase-backed; no fixture fallback is allowed on request failure.
 */
import type { Meal } from './data';
import { makeSupabaseRepositories } from './supabaseRepository';

export interface MealQuery {
  cook?: string;
  kitchenUuid?: string; // filter by a real kitchen's DB id (for real-prepper storefronts)
  cat?: string; // matches a tag substring, case-insensitive
  q?: string; // free text over meal name + cook name
  /** Only kitchens that support this fulfillment method (kitchens.supports_delivery /
   *  supports_pickup). Seed kitchens support both, so this only ever narrows real supply. */
  mode?: 'delivery' | 'pickup';
}

export interface MealRepository {
  list(query?: MealQuery): Promise<Meal[]>;
  byId(id: string): Promise<Meal | null>;
}
export interface Repositories {
  meals: MealRepository;
}

let _repos: Repositories | null = null;
/**
 * Composition root for the live customer catalog.
 */
export function getRepositories(): Repositories {
  if (!_repos) _repos = makeSupabaseRepositories();
  return _repos;
}
