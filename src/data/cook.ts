/* PREPPA — prepper "My Hub" mock data, ported from the prototype (cook-core / plans-suite). */
import { GradKey } from './data';

export type KTone = 'ic-amber' | 'ic-green' | 'ic-purple' | 'ic-blue' | 'ic-ink' | 'ic-red';

export const ME = { id: 'maria', name: 'Chef Maria', kitchen: "Maria's Kitchen", initial: 'M', grad: 'g4' as GradKey, rating: 4.9, reviews: 312, prepscore: 98 };

export type MealStatus = 'live' | 'paused' | 'soldout';
export interface MyMeal { id: string; name: string; price: number; grad: GradKey; status: MealStatus; sold: number; rating: number; serves: number; }
export const MY_MEALS: MyMeal[] = [
  { id: 'lasagna', name: 'Family Lasagna Tray', price: 13.5, grad: 'g4', status: 'live', sold: 142, rating: 4.9, serves: 2 },
  { id: 'meatballs', name: 'Sunday Meatballs', price: 12.0, grad: 'g6', status: 'live', sold: 88, rating: 4.8, serves: 2 },
  { id: 'eggplant', name: 'Eggplant Parmigiana', price: 11.5, grad: 'g1', status: 'live', sold: 54, rating: 4.9, serves: 1 },
  { id: 'tiramisu', name: 'Tiramisu Cups (2)', price: 8.5, grad: 'g7', status: 'soldout', sold: 47, rating: 5.0, serves: 2 },
  { id: 'minestra', name: 'Tuscan Minestrone', price: 9.0, grad: 'g3', status: 'paused', sold: 31, rating: 4.7, serves: 1 },
];
export const myMeal = (id: string) => MY_MEALS.find((m) => m.id === id)!;

export type OrderStatus = 'new' | 'prep' | 'ready' | 'done';
export interface CookOrder { id: string; meal: string; qty: number; cust: string; total: number; mode: 'delivery' | 'pickup'; status: OrderStatus; when: string; day: string; }
export const ORDERS: CookOrder[] = [
  { id: 'PR-2051', meal: 'lasagna', qty: 2, cust: 'Jordan A.', total: 27.0, mode: 'delivery', status: 'new', when: '3 min ago', day: 'today' },
  { id: 'PR-2050', meal: 'tiramisu', qty: 1, cust: 'Priya S.', total: 8.5, mode: 'pickup', status: 'new', when: '12 min ago', day: 'today' },
  { id: 'PR-2049', meal: 'meatballs', qty: 2, cust: 'Marcus T.', total: 24.0, mode: 'delivery', status: 'prep', when: '28 min ago', day: 'today' },
  { id: 'PR-2048', meal: 'eggplant', qty: 1, cust: 'Dana L.', total: 11.5, mode: 'pickup', status: 'ready', when: '40 min ago', day: 'today' },
  { id: 'PR-2045', meal: 'lasagna', qty: 3, cust: 'The Okafors', total: 40.5, mode: 'delivery', status: 'done', when: 'Yesterday', day: 'yesterday' },
  { id: 'PR-2043', meal: 'meatballs', qty: 1, cust: 'Sofia R.', total: 12.0, mode: 'pickup', status: 'done', when: 'Yesterday', day: 'yesterday' },
  { id: 'PR-2040', meal: 'eggplant', qty: 2, cust: 'Liam K.', total: 23.0, mode: 'delivery', status: 'done', when: 'Mon', day: 'earlier' },
  { id: 'PR-2038', meal: 'tiramisu', qty: 4, cust: 'Grace M.', total: 34.0, mode: 'pickup', status: 'done', when: 'Sun', day: 'earlier' },
];
export const orderById = (id: string) => ORDERS.find((o) => o.id === id);

export interface CaterReq {
  id: string; type: string; title: string; host: string; date: string;
  guests: number | null; budget: string; loc: string; cuisine: string | null;
  posted?: string; bids?: number; msg?: string;
}
export const CATER_OPEN: CaterReq[] = [
  { id: 'EVT-118', type: 'Catering', title: 'Office lunch for 25', host: 'Lena · Northwind Studio', date: 'Fri, Jun 12', guests: 25, budget: '$400–600', loc: 'Midtown · 3.2 km', cuisine: 'Italian', posted: '2h ago', bids: 4 },
  { id: 'EVT-127', type: 'Cook at my place', title: 'Date-night dinner for 4', host: 'Marcus T.', date: 'Fri, Jul 10 · 7 PM', guests: 4, budget: '$250–400', loc: 'Old Fourth Ward · 2.4 km', cuisine: 'Italian', posted: '3h ago', bids: 3 },
  { id: 'EVT-128', type: 'Grocery run', title: 'Weekly shop for family of 5', host: 'Grace M.', date: 'Tomorrow AM', guests: null, budget: '$35 + groceries', loc: 'Poncey-Highland · 1.1 km', cuisine: null, posted: '4h ago', bids: 1 },
  { id: 'EVT-121', type: 'Class', title: 'Pasta-making class for 8', host: 'Dana W.', date: 'Flexible', guests: 8, budget: '$420', loc: 'Your kitchen', cuisine: 'Hands-on', posted: '5h ago', bids: 2 },
  { id: 'EVT-129', type: 'Bulk order', title: '60 lunch boxes · team retreat', host: 'Raj · Atlas Fintech', date: 'Thu, Jul 16', guests: 60, budget: '$540–700', loc: 'Buckhead · 6 km', cuisine: 'Mixed', posted: '1d ago', bids: 5 },
  { id: 'EVT-132', type: 'Errand', title: 'Farmers-market pickup', host: 'Dana L.', date: 'Sat morning', guests: null, budget: '$20', loc: 'Freedom Farmers Mkt', cuisine: null, posted: '1d ago', bids: 2 },
  { id: 'EVT-124', type: 'Event', title: 'Backyard graduation party', host: 'The Bells', date: 'Sat, Jun 28', guests: 35, budget: '$700–900', loc: 'Decatur · 8 km', cuisine: 'Family-style', posted: '1d ago', bids: 6 },
];
export const CATER_INCOMING: CaterReq[] = [
  { id: 'REQ-44', type: 'Private chef', title: 'Anniversary dinner for two', host: 'Olivia P.', date: 'Sat, Jun 14 · 7 PM', guests: 2, budget: '$300', loc: 'Inman Park', cuisine: 'Italian', msg: 'We loved your lasagna last month — could you do a 4-course Italian anniversary night for us? Open to your menu suggestions.' },
  { id: 'REQ-47', type: 'Catering', title: 'Corporate quarterly dinner', host: 'Raj · Atlas Fintech', date: 'Wed, Jun 18', guests: 40, budget: '$1,200', loc: 'Buckhead office', cuisine: 'Mixed, halal options', msg: 'Need a seated dinner for 40 with vegetarian + halal options. Plates, not buffet. Can you handle this size?' },
];
export const caterById = (id: string) => [...CATER_OPEN, ...CATER_INCOMING].find((r) => r.id === id);

export interface MyBid { id: string; title: string; amount: number; status: 'pending' | 'accepted' | 'declined'; }
export const MY_BIDS: MyBid[] = [
  { id: 'EVT-118', title: 'Office lunch for 25', amount: 520, status: 'pending' },
  { id: 'EVT-201', title: 'Wine-pairing supper club', amount: 780, status: 'accepted' },
  { id: 'EVT-190', title: 'Holiday cookie workshop', amount: 300, status: 'declined' },
];

export const BALANCE = { available: 842.5, pending: 156.0, lifetime: 18420, today: 84.5, todayOrders: 6, week: 612.0, month: 2480.0 };
export interface LedgerEntry { ic: string; cls: KTone; nm: string; mt: string; amt: number; pos: boolean; }
export const LEDGER: LedgerEntry[] = [
  { ic: 'box', cls: 'ic-amber', nm: 'Order #PR-2049 · Sunday Meatballs', mt: 'Today · 11:42 AM', amt: 24.3, pos: true },
  { ic: 'gift', cls: 'ic-green', nm: 'Tip from Jordan A.', mt: 'Today · 10:05 AM', amt: 3.0, pos: true },
  { ic: 'bank', cls: 'ic-ink', nm: 'Payout to •••• 4242', mt: 'Yesterday', amt: -500.0, pos: false },
  { ic: 'box', cls: 'ic-amber', nm: 'Order #PR-2045 · Family Lasagna', mt: 'Yesterday', amt: 48.6, pos: true },
  { ic: 'users', cls: 'ic-purple', nm: 'Catering deposit · Graduation party', mt: 'Mon', amt: 150.0, pos: true },
  { ic: 'repeat', cls: 'ic-red', nm: 'Refund · #PR-2041', mt: 'Sun', amt: -12.5, pos: false },
];

export interface MyPlan { id: string; name: string; price: number; per: string; meals: string; subs: number; grad: GradKey; status: string; }
export const MY_PLANS: MyPlan[] = [
  { id: 'weeknight', name: 'Weeknight Italian Box', price: 48, per: 'week', meals: '3 meals', subs: 24, grad: 'g4', status: 'live' },
  { id: 'sunday', name: 'Family Sunday Tray', price: 36, per: 'week', meals: '1 large tray', subs: 11, grad: 'g6', status: 'live' },
];

export const ANALYTICS = {
  revenue: [380, 420, 510, 460, 540, 600, 580, 612],
  orders: 96, aov: 15.8, repeat: 42, rating: 4.9, views: 1840, conv: 11,
  top: [
    { name: 'Family Lasagna Tray', sold: 142, pct: 100 },
    { name: 'Sunday Meatballs', sold: 88, pct: 62 },
    { name: 'Eggplant Parmigiana', sold: 54, pct: 38 },
    { name: 'Tiramisu Cups', sold: 47, pct: 33 },
  ],
};

export interface Subscriber { name: string; plan: string; since: string; day: string; status: 'active' | 'paused' | 'skip'; grad: GradKey; }
export const SUBSCRIBERS: Subscriber[] = [
  { name: 'Jordan M.', plan: 'Weeknight Italian Box', since: 'Mar 2026', day: 'Thu', status: 'active', grad: 'g8' },
  { name: 'The Okafors', plan: 'Weeknight Italian Box', since: 'Jan 2026', day: 'Thu', status: 'active', grad: 'g3' },
  { name: 'Priya S.', plan: 'Weeknight Italian Box', since: 'May 2026', day: 'Thu', status: 'active', grad: 'g7' },
  { name: 'Dana L.', plan: 'Family Sunday Tray', since: 'Feb 2026', day: 'Sun', status: 'active', grad: 'g1' },
  { name: 'Marcus T.', plan: 'Family Sunday Tray', since: 'Jun 2026', day: 'Sun', status: 'paused', grad: 'g6' },
  { name: 'Grace M.', plan: 'Weeknight Italian Box', since: 'Apr 2026', day: 'Thu', status: 'skip', grad: 'g5' },
];
