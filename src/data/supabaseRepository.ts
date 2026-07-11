/**
 * Supabase-backed repository (R1). Reads the buyer catalog from the real `meals`
 * table instead of the in-memory mock. Meals map to the app `Meal` shape with
 * `id = slug` (cart/route-compatible) and `cook` reverse-mapped from `kitchen_id`,
 * so consumers don't change. Cooks/experiences/plans still delegate to the seed
 * for this slice (migrated next). No mock fallback — a DB error surfaces to the
 * screen's error state rather than silently showing fixtures.
 */
import { supabase, KITCHEN_ID } from '../lib/supabase';
import { Meal, Cook, CookId, COOKS, Experience, EXPERIENCES, expById, MarketPlan, MARKET_PLANS } from './data';
import { distanceKm, distanceLabel, type LatLng } from '../lib/geo';
import type { GradKey } from '../theme/theme';
import type { Repositories, MealQuery } from './repository';

// kitchen UUID -> mock cook key (reverse of KITCHEN_ID)
const KITCHEN_TO_COOK: Record<string, CookId> = Object.fromEntries(
  Object.entries(KITCHEN_ID).map(([key, uuid]) => [uuid, key as CookId]),
) as Record<string, CookId>;

/** The seed CookId a verified kitchen UUID maps to (only the 6 seed kitchens), else undefined.
 *  Lets discovery keep the rich seed presentation for the seeded six while real kitchens
 *  render from live data. */
export const seedCookForKitchen = (kitchenUuid: string): CookId | undefined => KITCHEN_TO_COOK[kitchenUuid];

// The viewer's captured coordinates, pushed by the store on GPS capture. Used to
// compute real distance to each kitchen and sort the catalog nearest-first.
let viewerCoords: LatLng | null = null;
export function setViewerCoords(c: LatLng | null) { viewerCoords = c; }

// Embeds the parent kitchen (to-one) so real kitchens can render under their own
// identity + coordinates instead of a seed cook.
const MEAL_COLS =
  'id,slug,name,kitchen_id,price_cents,grad,rating,review_count,prep_label,tags,is_match,kcal,protein_g,serves,description,image_url,photos,kitchens(name,cuisine,approx_area,approx_lat,approx_lng)';

function rowToMeal(r: any): Meal {
  const seedCook = KITCHEN_TO_COOK[r.kitchen_id]; // defined only for the 6 seed kitchens
  const k = r.kitchens ?? null; // joined kitchen row (to-one embed)
  // numeric columns arrive from supabase-js as strings — coerce + guard.
  const lat = k?.approx_lat != null ? Number(k.approx_lat) : NaN;
  const lng = k?.approx_lng != null ? Number(k.approx_lng) : NaN;
  return {
    id: r.slug,
    name: r.name,
    // Seed kitchens map to their rich seed cook; real kitchens keep a harmless seed
    // fallback for legacy plumbing but display via the carried kitchen fields below.
    cook: (seedCook ?? 'maria') as CookId,
    price: (r.price_cents ?? 0) / 100,
    grad: (r.grad ?? 'g1') as GradKey,
    rating: Number(r.rating ?? 0),
    reviews: r.review_count ?? 0,
    time: r.prep_label ?? '',
    // No fake distance: dist is a REAL computed value (filled in list() when the
    // viewer and the kitchen both have coordinates), otherwise empty.
    dist: '',
    tags: (r.tags as string[]) ?? [],
    match: !!r.is_match,
    kcal: r.kcal ?? 0,
    protein: r.protein_g ?? 0,
    serves: r.serves ?? 1,
    desc: r.description ?? '',
    img: r.image_url ?? undefined,
    photos: r.photos && r.photos.length ? (r.photos as string[]) : undefined,
    mealUuid: r.id,
    kitchenUuid: r.kitchen_id,
    // Real-kitchen identity (only for non-seed kitchens) → cookOf() renders it.
    kitchenName: seedCook ? undefined : (k?.name ?? 'Kitchen'),
    kitchenCuisine: seedCook ? undefined : (k?.cuisine ?? undefined),
    kitchenArea: seedCook ? undefined : (k?.approx_area ?? undefined),
    kitchenLat: Number.isFinite(lat) ? lat : undefined,
    kitchenLng: Number.isFinite(lng) ? lng : undefined,
  };
}

// Fill in real distance from the viewer's coords, and sort nearest-first. Kitchens
// without coordinates (e.g. the seed cooks) get no distance and sort after those
// that do; with no viewer location we keep a stable alphabetical order.
function applyProximity(meals: Meal[]): Meal[] {
  if (viewerCoords) {
    for (const m of meals) {
      if (typeof m.kitchenLat === 'number' && typeof m.kitchenLng === 'number') {
        m.distKm = distanceKm(viewerCoords, { lat: m.kitchenLat, lng: m.kitchenLng });
        m.dist = distanceLabel(m.distKm);
      }
    }
    return meals.sort((a, b) => {
      const da = a.distKm ?? Infinity;
      const db = b.distKm ?? Infinity;
      return da === db ? a.name.localeCompare(b.name) : da - db;
    });
  }
  return meals.sort((a, b) => a.name.localeCompare(b.name));
}

export function makeSupabaseRepositories(): Repositories {
  return {
    meals: {
      async list(query?: MealQuery) {
        const { data, error } = await supabase
          .from('meals')
          .select(MEAL_COLS)
          .eq('status', 'live')
          .not('slug', 'is', null);
        if (error) throw error;
        let out = (data ?? []).map(rowToMeal);
        if (query?.kitchenUuid) out = out.filter((m) => m.kitchenUuid === query.kitchenUuid);
        if (query?.cook) out = out.filter((m) => m.cook === query.cook);
        if (query?.cat && query.cat !== 'All') {
          const cat = query.cat.toLowerCase();
          out = out.filter((m) => m.tags.some((t) => t.toLowerCase().includes(cat)));
        }
        if (query?.q) {
          const q = query.q.toLowerCase();
          out = out.filter((m) => m.name.toLowerCase().includes(q) || (COOKS[m.cook]?.name ?? '').toLowerCase().includes(q));
        }
        return applyProximity(out); // real distance + nearest-first when the viewer has coords
      },
      async byId(id: string) {
        const { data, error } = await supabase.from('meals').select(MEAL_COLS).eq('slug', id).maybeSingle();
        if (error) throw error;
        if (!data) return null;
        return applyProximity([rowToMeal(data)])[0];
      },
    },
    // Delegated to the seed for this slice; migrated in the next R1 pass.
    cooks: {
      async list(): Promise<Cook[]> { return Object.values(COOKS); },
      async byId(id: CookId) { return COOKS[id] ?? null; },
    },
    experiences: {
      async list(): Promise<Experience[]> { return EXPERIENCES; },
      async byId(id: string) { return expById(id) ?? null; },
    },
    plans: {
      async list(): Promise<MarketPlan[]> { return MARKET_PLANS; },
    },
  };
}
