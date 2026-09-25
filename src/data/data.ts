/* PREPPA — mock data, ported from the design prototype (app-core / exp-suite / plans-suite). */

import type { GradKey } from '../theme/theme';
export type { GradKey } from '../theme/theme';

export type Grad = readonly [string, string];

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
  isPro?: boolean;
}

export interface Meal {
  id: string;
  name: string;
  /** Stable kitchen identity from the server. */
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
 * Resolve the server kitchen identity carried on a meal for display.
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
  return {
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
  return {
    name: 'Kitchen', kitchen: 'Kitchen', initial: 'K', grad: l.grad, cuisine: '',
    rating: 0, reviews: 0, dist: '', verified: false, prepscore: 0,
  };
}

/** The grouping/routing key for a cart or order line. */
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

/* ---------------- meal plans / subscriptions ---------------- */
export type PlanGoal = 'cut' | 'bulk' | 'maintain';

/** Safe currency formatter — guards NaN/Infinity/negative-zero, adds thousands separators. */
export const money = (n: number) => {
  const v = Number.isFinite(n) ? n : 0;
  const sign = v < 0 ? '-' : '';
  return sign + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
