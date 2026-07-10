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
import type { GradKey } from '../theme/theme';
import type { Repositories, MealQuery } from './repository';

// kitchen UUID -> mock cook key (reverse of KITCHEN_ID)
const KITCHEN_TO_COOK: Record<string, CookId> = Object.fromEntries(
  Object.entries(KITCHEN_ID).map(([key, uuid]) => [uuid, key as CookId]),
) as Record<string, CookId>;

// Embeds the parent kitchen (to-one) so real kitchens can render under their own
// identity instead of a seed cook.
const MEAL_COLS =
  'id,slug,name,kitchen_id,price_cents,grad,rating,review_count,prep_label,dist_label,tags,is_match,kcal,protein_g,serves,description,image_url,photos,kitchens(name,cuisine,approx_area)';

function rowToMeal(r: any): Meal {
  const seedCook = KITCHEN_TO_COOK[r.kitchen_id]; // defined only for the 6 seed kitchens
  const k = r.kitchens ?? null; // joined kitchen row (to-one embed)
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
    dist: r.dist_label ?? (seedCook ? '' : k?.approx_area ?? ''),
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
  };
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
        out.sort((a, b) => a.name.localeCompare(b.name)); // stable catalog order
        if (query?.cook) out = out.filter((m) => m.cook === query.cook);
        if (query?.cat && query.cat !== 'All') {
          const cat = query.cat.toLowerCase();
          out = out.filter((m) => m.tags.some((t) => t.toLowerCase().includes(cat)));
        }
        if (query?.q) {
          const q = query.q.toLowerCase();
          out = out.filter((m) => m.name.toLowerCase().includes(q) || (COOKS[m.cook]?.name ?? '').toLowerCase().includes(q));
        }
        return out;
      },
      async byId(id: string) {
        const { data, error } = await supabase.from('meals').select(MEAL_COLS).eq('slug', id).maybeSingle();
        if (error) throw error;
        return data ? rowToMeal(data) : null;
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
