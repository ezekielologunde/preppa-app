/**
 * Repository seam (council #7a). Screens should read catalog data through these
 * interfaces instead of importing the mock arrays directly. Today they're backed by
 * the in-memory mocks; swapping to Supabase is a single new implementation file plus
 * flipping `getRepositories()` — no consumer changes.
 */
import {
  Meal, MEALS, mealById, Cook, COOKS, CookId,
  Experience, EXPERIENCES, expById, MarketPlan, MARKET_PLANS,
} from './data';
import { makeSupabaseRepositories } from './supabaseRepository';

export interface MealQuery {
  cook?: CookId;
  cat?: string; // matches a tag substring, case-insensitive
  q?: string; // free text over meal name + cook name
}

export interface MealRepository {
  list(query?: MealQuery): Promise<Meal[]>;
  byId(id: string): Promise<Meal | null>;
}
export interface CookRepository {
  list(): Promise<Cook[]>;
  byId(id: CookId): Promise<Cook | null>;
}
export interface ExperienceRepository {
  list(): Promise<Experience[]>;
  byId(id: string): Promise<Experience | null>;
}
export interface PlanRepository {
  list(): Promise<MarketPlan[]>;
}

export interface Repositories {
  meals: MealRepository;
  cooks: CookRepository;
  experiences: ExperienceRepository;
  plans: PlanRepository;
}

/** Mock-backed implementation (current default). */
function makeMockRepositories(): Repositories {
  return {
    meals: {
      async list(query) {
        let out = MEALS;
        if (query?.cook) out = out.filter((m) => m.cook === query.cook);
        if (query?.cat && query.cat !== 'All') out = out.filter((m) => m.tags.some((t) => t.toLowerCase().includes(query.cat!.toLowerCase())));
        if (query?.q) {
          const q = query.q.toLowerCase();
          out = out.filter((m) => m.name.toLowerCase().includes(q) || COOKS[m.cook].name.toLowerCase().includes(q));
        }
        return out;
      },
      async byId(id) {
        return mealById(id) ?? null;
      },
    },
    cooks: {
      async list() {
        return Object.values(COOKS);
      },
      async byId(id) {
        return COOKS[id] ?? null;
      },
    },
    experiences: {
      async list() {
        return EXPERIENCES;
      },
      async byId(id) {
        return expById(id) ?? null;
      },
    },
    plans: {
      async list() {
        return MARKET_PLANS;
      },
    },
  };
}

let _repos: Repositories | null = null;
/**
 * Composition root. Now Supabase-backed for the catalog (meals from the DB);
 * `makeMockRepositories` is retained for reference/tests but no longer the default.
 */
export function getRepositories(): Repositories {
  if (!_repos) _repos = makeSupabaseRepositories();
  return _repos;
}
