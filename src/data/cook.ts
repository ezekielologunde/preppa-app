/* PREPPA — prepper "My Hub" mock data, ported from the prototype (cook-core / plans-suite). */
import { GradKey } from './data';

export type KTone = 'ic-amber' | 'ic-green' | 'ic-purple' | 'ic-blue' | 'ic-ink' | 'ic-red';

export const ME = { id: 'maria', name: 'Chef Maria', kitchen: "Maria's Kitchen", initial: 'M', grad: 'g4' as GradKey, rating: 4.9, reviews: 312, prepscore: 98 };

export type MealStatus = 'live' | 'paused' | 'soldout';
export interface MyMeal { id: string; name: string; price: number; grad: GradKey; status: MealStatus; sold: number; rating: number; serves: number; }
// A new cook starts with an empty kitchen — real listings come from the cook, not seed data.
export const MY_MEALS: MyMeal[] = [];
export const myMeal = (id: string) => MY_MEALS.find((m) => m.id === id)!;

export type OrderStatus = 'new' | 'prep' | 'ready' | 'done';
export interface CookOrder { id: string; meal: string; qty: number; cust: string; total: number; mode: 'delivery' | 'pickup'; status: OrderStatus; when: string; day: string; }
export const ORDERS: CookOrder[] = [];
export const orderById = (id: string) => ORDERS.find((o) => o.id === id);

export interface CaterReq {
  id: string; type: string; title: string; host: string; date: string;
  guests: number | null; budget: string; loc: string; cuisine: string | null;
  posted?: string; bids?: number; msg?: string;
}
export const CATER_OPEN: CaterReq[] = [];
export const CATER_INCOMING: CaterReq[] = [];
export const caterById = (id: string) => [...CATER_OPEN, ...CATER_INCOMING].find((r) => r.id === id);

export interface MyBid { id: string; title: string; amount: number; status: 'pending' | 'accepted' | 'declined'; }
export const MY_BIDS: MyBid[] = [];

export const BALANCE = { available: 0, pending: 0, lifetime: 0, today: 0, todayOrders: 0, week: 0, month: 0 };
export interface LedgerEntry { ic: string; cls: KTone; nm: string; mt: string; amt: number; pos: boolean; }
export const LEDGER: LedgerEntry[] = [];

export interface MyPlan { id: string; name: string; price: number; per: string; meals: string; subs: number; grad: GradKey; status: string; }
export const MY_PLANS: MyPlan[] = [];

export const ANALYTICS = {
  revenue: [] as number[],
  orders: 0, aov: 0, repeat: 0, rating: 0, views: 0, conv: 0,
  top: [] as { name: string; sold: number; pct: number }[],
};

export interface Subscriber { name: string; plan: string; since: string; day: string; status: 'active' | 'paused' | 'skip'; grad: GradKey; }
export const SUBSCRIBERS: Subscriber[] = [];
