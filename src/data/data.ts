/* PREPPA — mock data, ported from the design prototype (app-core / exp-suite / plans-suite). */

import type { GradKey } from '../theme/theme';
export type { GradKey } from '../theme/theme';

export type Grad = readonly [string, string];

export type CookId = 'maria' | 'david' | 'amara' | 'denise' | 'lucia' | 'sana';
export interface Cook {
  name: string;
  kitchen: string;
  initial: string;
  grad: GradKey;
  cuisine: string;
  rating: number;
  reviews: number;
  dist: string;
  verified: boolean;
  prepscore: number;
  isPro?: boolean; // Preppa Pro member — real (non-seed) kitchens only; seed cooks never carry this
}

export const COOKS: Record<CookId, Cook> = {
  maria: { name: 'Chef Maria', kitchen: "Maria's Kitchen", initial: 'M', grad: 'g4', cuisine: 'Italian comfort', rating: 4.9, reviews: 312, dist: '1.2 km', verified: true, prepscore: 98 },
  david: { name: 'Chef David', kitchen: "David's Table", initial: 'D', grad: 'g3', cuisine: 'Healthy & seafood', rating: 4.8, reviews: 204, dist: '0.8 km', verified: true, prepscore: 95 },
  amara: { name: 'Amara O.', kitchen: "Amara's Kitchen", initial: 'A', grad: 'g1', cuisine: 'West African', rating: 4.9, reviews: 412, dist: '0.6 km', verified: true, prepscore: 97 },
  denise: { name: 'Denise R.', kitchen: "Denise's Soul Food", initial: 'D', grad: 'g6', cuisine: 'Soul food', rating: 4.9, reviews: 540, dist: '1.6 km', verified: true, prepscore: 99 },
  lucia: { name: 'Lucia R.', kitchen: 'Cocina de Lucia', initial: 'L', grad: 'g7', cuisine: 'Oaxacan', rating: 4.7, reviews: 198, dist: '2.1 km', verified: true, prepscore: 94 },
  sana: { name: 'Sana K.', kitchen: "Sana's Halal Home", initial: 'S', grad: 'g8', cuisine: 'Halal & Desi', rating: 4.8, reviews: 276, dist: '1.4 km', verified: true, prepscore: 96 },
};

export interface Meal {
  id: string;
  name: string;
  /** Stable kitchen identity: a seed CookId for fixtures, or the real kitchen UUID. */
  cook: string;
  price: number;
  grad: GradKey;
  rating: number;
  reviews: number;
  time: string;
  dist: string;
  tags: string[];
  match: boolean;
  kcal: number;
  protein: number; // grams — illustrative seed data (real per-batch macros are REQUIRES-SERVER)
  serves: number;
  desc: string;
  ingredients?: string;
  allergens?: string[];
  allergenReviewed?: boolean;
  img?: string; // cover photo; the grad is the loading/error fallback
  photos?: string[]; // extra gallery photos (illustrative seed); the carousel shows these when present, else [img]
  mealUuid?: string; // real DB meals.id (present when sourced from Supabase) — carried to checkout
  kitchenUuid?: string; // real DB kitchens.id — carried to checkout
  // Real (non-seed) kitchen display identity, carried so an approved prepper's meal
  // renders under its own kitchen instead of being misattributed to a seed cook.
  // Present only for kitchens outside the 6 seed cooks; `cookOf` prefers these.
  kitchenName?: string;
  kitchenCuisine?: string;
  kitchenArea?: string;
  kitchenIsPro?: boolean; // Preppa Pro member kitchen — feeds cookOf().isPro + discovery sort
  kitchenLat?: number; // real kitchen coords (for proximity); present once geocoded
  kitchenLng?: number;
  distKm?: number; // computed distance from the viewer (present when both have coords)
  // Real fulfillment capability (kitchens.supports_delivery/supports_pickup). Seed kitchens
  // always support both; real kitchens default true/true too until a cook changes it.
  supportsDelivery?: boolean;
  supportsPickup?: boolean;
}

/**
 * Resolve a meal's cook for DISPLAY. For the 6 seed kitchens this returns the rich
 * seed `Cook`; for a real approved kitchen it synthesizes a Cook from the kitchen
 * identity carried on the meal — so real supply shows under its own name/avatar
 * rather than defaulting to a seed cook.
 */
export function cookOf(m: Meal): Cook {
  if (m.kitchenName) {
    return {
      name: m.kitchenName,
      kitchen: m.kitchenName,
      initial: m.kitchenName.trim()[0]?.toUpperCase() ?? 'K',
      grad: m.grad,
      cuisine: m.kitchenCuisine ?? '',
      rating: m.rating,
      reviews: m.reviews,
      dist: m.kitchenArea ?? m.dist,
      verified: true,
      prepscore: 0,
      isPro: !!m.kitchenIsPro,
    };
  }
  return COOKS[m.cook as CookId] ?? {
    name: 'Kitchen', kitchen: 'Kitchen', initial: 'K', grad: m.grad, cuisine: '',
    rating: m.rating, reviews: m.reviews, dist: m.dist, verified: true, prepscore: 0,
  };
}

/** Same resolution as `cookOf`, for a cart/order line instead of a catalog `Meal` — checkout,
 *  cart, and order-tracking screens must attribute a real kitchen's line to its own identity
 *  too, not just the browse/detail screens. */
export function cookOfLine(l: { cook: string; kitchenName?: string; grad: GradKey }): Cook {
  if (l.kitchenName) {
    return {
      name: l.kitchenName,
      kitchen: l.kitchenName,
      initial: l.kitchenName.trim()[0]?.toUpperCase() ?? 'K',
      grad: l.grad,
      cuisine: '',
      rating: 0,
      reviews: 0,
      dist: '',
      verified: true,
      prepscore: 0,
    };
  }
  return COOKS[l.cook as CookId] ?? COOKS.maria;
}

/** The real grouping/routing key for a cart or order line: a real kitchen's UUID when
 *  present, else the seed CookId. */
export function lineKey(l: { cook: string; kitchenUuid?: string }): string {
  return l.kitchenUuid ?? l.cook;
}

/** Gallery photos for a meal: its `photos` array if present, else its single cover, else none. */
export const mealPhotos = (m: Meal): string[] => (m.photos && m.photos.length ? m.photos : m.img ? [m.img] : []);

/** A smaller image variant for card-sized contexts. themealdb serves a ~thumbnail at
 *  `<url>/preview`; other hosts (Supabase uploads) are returned unchanged. Keeps full-res
 *  for hero/detail views, cuts bytes on the many small grid cards. */
export const thumb = (url?: string): string | undefined =>
  url && url.includes('themealdb.com') ? url + '/preview' : url;

export interface Experience {
  id: string; title: string; sub: string; cook: CookId; price: number;
  grad: GradKey | Grad; when: string; spots: string; tag: string; ico: string; img?: string;
}
/* ---------------- meal plans / subscriptions ---------------- */
export type PlanGoal = 'cut' | 'bulk' | 'maintain';

export interface Subscription { name: string; cook: CookId | null; price: number; per: string; items: string[]; day: string; status: 'active' | 'paused'; skipNext: boolean; }

/** Safe currency formatter — guards NaN/Infinity/negative-zero, adds thousands separators. */
export const money = (n: number) => {
  const v = Number.isFinite(n) ? n : 0;
  const sign = v < 0 ? '-' : '';
  return sign + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
