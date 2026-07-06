/* PREPPA — mock data, ported from the design prototype (app-core / exp-suite / plans-suite). */

export type Grad = readonly [string, string];

/** ListingImage placeholder gradients (--g1..--g8), from the canonical theme. */
export const GRAD = {
  g1: ['#FF6B35', '#F7931E'],
  g2: ['#667EEA', '#764BA2'],
  g3: ['#11998E', '#38EF7D'],
  g4: ['#FF8A4C', '#F26B1D'],
  g5: ['#A8E063', '#56AB2F'],
  g6: ['#EF4444', '#F97316'],
  g7: ['#7C3AED', '#A855F7'],
  g8: ['#0EA5E9', '#6366F1'],
} as const satisfies Record<string, Grad>;
export type GradKey = keyof typeof GRAD;

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
  cook: CookId;
  price: number;
  grad: GradKey;
  rating: number;
  reviews: number;
  time: string;
  dist: string;
  tags: string[];
  match: boolean;
  kcal: number;
  serves: number;
  desc: string;
}

export const MEALS: Meal[] = [
  { id: 'lasagna', name: 'Family Lasagna Tray', cook: 'maria', price: 13.5, grad: 'g4', rating: 4.9, reviews: 312, time: '25m', dist: '1.2 km', tags: ['Comfort', 'Pasta'], match: true, kcal: 680, serves: 2, desc: 'Layered fresh pasta, slow-simmered beef ragù and three cheeses, baked golden. Travels in a sealed oven-ready tray — reheat and serve.' },
  { id: 'salmon', name: 'Honey Garlic Salmon', cook: 'david', price: 9.75, grad: 'g3', rating: 4.8, reviews: 204, time: '30m', dist: '0.8 km', tags: ['Healthy', 'Seafood'], match: true, kcal: 420, serves: 1, desc: 'Pan-seared salmon glazed in honey-garlic, over herbed jasmine rice with charred greens. High protein, gluten-free.' },
  { id: 'jollof', name: 'Smoky Jollof & Chicken', cook: 'amara', price: 12.0, grad: 'g1', rating: 4.9, reviews: 412, time: '20m', dist: '0.6 km', tags: ['West African', 'Spicy'], match: false, kcal: 610, serves: 1, desc: 'Party-style smoky jollof rice with grilled marinated chicken and fried plantain. A neighborhood favorite that sells out fast.' },
  { id: 'shortrib', name: 'Slow-Braised Short Rib', cook: 'denise', price: 16.5, grad: 'g6', rating: 4.9, reviews: 540, time: '35m', dist: '1.6 km', tags: ['Comfort', 'Soul food'], match: true, kcal: 720, serves: 1, desc: 'Fork-tender short rib braised for six hours, creamy mash and buttered greens. Rich, deeply savory Sunday cooking any day.' },
  { id: 'tacos', name: 'Oaxacan Mole Tacos', cook: 'lucia', price: 11.0, grad: 'g7', rating: 4.7, reviews: 198, time: '25m', dist: '2.1 km', tags: ['Mexican', 'Vegan opt.'], match: false, kcal: 540, serves: 1, desc: 'House mole negro over three soft-corn tacos with pickled onion and queso fresco. Mild heat, deep complexity.' },
  { id: 'biryani', name: 'Chicken Biryani Box', cook: 'sana', price: 12.75, grad: 'g8', rating: 4.8, reviews: 276, time: '30m', dist: '1.4 km', tags: ['Halal', 'Desi'], match: true, kcal: 650, serves: 1, desc: 'Fragrant dum biryani layered with saffron basmati and tender chicken, raita and salan on the side. Halal-certified kitchen.' },
  { id: 'poke', name: 'Rainbow Poke Bowl', cook: 'david', price: 10.5, grad: 'g5', rating: 4.7, reviews: 142, time: '20m', dist: '0.8 km', tags: ['Healthy', 'Fresh'], match: false, kcal: 480, serves: 1, desc: 'Ahi tuna, edamame, mango and avocado over sushi rice with sesame-soy dressing. Bright, clean and filling.' },
  { id: 'cornbread', name: 'Honey Cornbread (6)', cook: 'denise', price: 6.0, grad: 'g4', rating: 5.0, reviews: 88, time: '15m', dist: '1.6 km', tags: ['Sides', 'Baked'], match: false, kcal: 240, serves: 6, desc: 'Six warm honey-butter cornbread squares. The perfect add-on to any soul food order.' },
];
export const mealById = (id: string) => MEALS.find((m) => m.id === id);

export const FOUNDING = new Set<CookId>(['maria', 'amara']);
export interface Addon { key: string; name: string; cook: CookId; price: number; grad: GradKey; }
export const ADDONS: Addon[] = [
  { key: 'cornbread', name: 'Honey cornbread (6)', cook: 'denise', price: 6.0, grad: 'g4' },
  { key: 'lemonade', name: 'Sparkling lemonade', cook: 'maria', price: 3.5, grad: 'g8' },
];

export interface Conversation { cook: CookId; msg: string; time: string; unread: number; online: boolean; }
export const CONVERSATIONS: Conversation[] = [
  { cook: 'maria', msg: 'Your lasagna is in the oven now! 🔥', time: '2m', unread: 2, online: true },
  { cook: 'amara', msg: 'Thanks for the 5 stars — see you next week!', time: '1h', unread: 0, online: true },
  { cook: 'david', msg: 'I can do a no-rice swap, no problem.', time: '3h', unread: 0, online: false },
  { cook: 'denise', msg: 'New short rib drop goes live Friday 6pm.', time: '1d', unread: 0, online: false },
];

export interface Experience {
  id: string; title: string; sub: string; cook: CookId; price: number;
  grad: GradKey | Grad; when: string; spots: string; tag: string; ico: string;
}
export const EXPERIENCES: Experience[] = [
  { id: 'pasta', title: 'Pasta Masterclass', sub: 'Hands-on with Chef Maria', cook: 'maria', price: 65, grad: 'g4', when: 'Sat · 4:00 PM', spots: '4 spots left', tag: 'Class', ico: 'chefhat' },
  { id: 'supper', title: 'West African Supper Club', sub: 'Authentic 5-course night', cook: 'amara', price: 58, grad: 'g1', when: 'Sun · 6:00 PM', spots: '8 seats', tag: 'Supper club', ico: 'globe' },
  { id: 'birthday', title: 'Private Birthday Dinner', sub: 'Chef-crafted celebration', cook: 'denise', price: 45, grad: ['#FF6B9D', '#EC4899'], when: 'Book any date', spots: 'Private', tag: 'Private dining', ico: 'gift' },
  { id: 'bbq', title: 'Backyard BBQ Night', sub: 'Open-fire gathering', cook: 'denise', price: 40, grad: 'g6', when: 'Sat · 5:00 PM', spots: '12 going', tag: 'Event', ico: 'bolt' },
  { id: 'taco', title: 'Taco & Mezcal Evening', sub: 'Oaxacan night with Lucia', cook: 'lucia', price: 52, grad: 'g7', when: 'Fri · 7:00 PM', spots: '6 seats', tag: 'Supper club', ico: 'globe' },
];
export const expById = (id: string) => EXPERIENCES.find((e) => e.id === id);

export interface FeedItem { id: string; cook: CookId; meal: string; grad: GradKey; live: boolean; caption: string; likes: string; comments: number; tag: string; }
export const FEED: FeedItem[] = [
  { id: 'f1', cook: 'maria', meal: 'lasagna', grad: 'g4', live: true, caption: 'Layering tonight’s lasagna trays 🔥 fresh out at 5:30', likes: '1.2k', comments: 340, tag: 'LIVE' },
  { id: 'f2', cook: 'amara', meal: 'jollof', grad: 'g1', live: false, caption: 'Smoky jollof the right way — party-rice energy 🎉', likes: '2.4k', comments: 512, tag: 'Reel' },
  { id: 'f3', cook: 'david', meal: 'salmon', grad: 'g3', live: false, caption: 'Honey-garlic glaze hitting the pan 🐟 high protein', likes: '980', comments: 142, tag: 'Reel' },
  { id: 'f4', cook: 'denise', meal: 'shortrib', grad: 'g6', live: false, caption: '6-hour short rib. Sunday cooking, any day 🥹', likes: '3.1k', comments: 620, tag: 'Reel' },
  { id: 'f5', cook: 'lucia', meal: 'tacos', grad: 'g7', live: false, caption: 'Mole negro from scratch — 20 ingredients ✨', likes: '1.7k', comments: 288, tag: 'Reel' },
];

export interface Notif { ico: string; cls: string; title: string; body: string; time: string; unread: boolean; }
export const NOTIFS: Notif[] = [
  { ico: 'chefhat', cls: 'amber', title: 'Maria is cooking your order', body: 'Family Lasagna Tray · ready ~5:30 PM', time: '2m', unread: true },
  { ico: 'bolt', cls: 'purple', title: 'New drop near you', body: 'Amara just listed Smoky Jollof — selling fast', time: '18m', unread: true },
  { ico: 'gift', cls: 'green', title: 'You earned 40 points', body: 'Thanks for reviewing Honey Garlic Salmon', time: '1h', unread: false },
  { ico: 'ticket', cls: 'amber', title: 'Free delivery unlocked', body: 'Your next order ships free 🎉', time: '3h', unread: false },
  { ico: 'star', cls: '', title: 'Rate your last order', body: 'How was Chef David’s poke bowl?', time: '1d', unread: false },
];

/* ---------------- experiences: services + requests + quotes ---------------- */
export interface Service {
  id: string; name: string; sub: string; ico: string; cls: string;
  premium?: boolean; sizeLbl?: string; notesPh: string; budgets: string[];
}
export const SERVICES: Service[] = [
  { id: 'cookhome', name: 'Cook at My Place', sub: 'A private chef cooks in your kitchen', ico: 'chefhat', cls: 'amber', premium: true, sizeLbl: 'Guests', notesPh: 'Tell them about the occasion, cuisine you love, dietary needs…', budgets: ['$150–250', '$250–400', '$400+'] },
  { id: 'catering', name: 'Catering & Events', sub: 'Parties, offices, celebrations', ico: 'users', cls: 'purple', sizeLbl: 'Guests', notesPh: 'Describe the event — plated or buffet, cuisines, timing…', budgets: ['$300–600', '$600–1,200', '$1,200+'] },
  { id: 'grocery', name: 'Grocery Run', sub: 'A Preppa shops & delivers your list', ico: 'bag', cls: 'green', notesPh: 'Paste your grocery list here — brands and swaps welcome…', budgets: ['Under $50', '$50–120', '$120+'] },
  { id: 'bulk', name: 'Bulk & Meal Prep', sub: 'Trays & weekly prep at scale', ico: 'grid', cls: 'blue', sizeLbl: 'Portions', notesPh: 'What do you need cooked, how many portions, packaging…', budgets: ['$100–250', '$250–500', '$500+'] },
  { id: 'errand', name: 'Quick Errands', sub: 'Pickups, drop-offs & market runs', ico: 'bolt', cls: 'red', notesPh: 'What needs picking up or dropping off, and where…', budgets: ['Under $25', '$25–50', '$50+'] },
];
export const svcById = (id: string) => SERVICES.find((s) => s.id === id);

export interface Quote { cook: CookId; amount: number; note: string; }
export interface ServiceRequest {
  id: string; svc: string; title: string; when: string; loc: string;
  size: string | null; budget: string; status: 'open' | 'quoted' | 'booked';
  notes: string; quotes: Quote[]; booked?: Quote;
}
export const SEED_REQUESTS: ServiceRequest[] = [
  {
    id: 'REQ-104', svc: 'cookhome', title: 'Anniversary dinner for two', when: 'Sat, Jul 12 · 7:00 PM',
    loc: 'Home · 88 Highland Ave NE', size: '2 guests', budget: '$250–400', status: 'quoted',
    notes: 'A 4-course Italian night for our anniversary. Open to menu ideas!',
    quotes: [
      { cook: 'denise', amount: 280, note: 'I’d love to do this — 4 courses, my braised short rib as the main, and a plated dessert. I bring everything and leave your kitchen spotless.' },
      { cook: 'maria', amount: 265, note: 'Ciao! Fresh handmade pasta course, secondi, and tiramisu to finish. I can shop day-of for the freshest ingredients.' },
      { cook: 'lucia', amount: 240, note: 'A Oaxacan twist on date night — mole tasting, handmade tortillas, mezcal pairing notes. Something you won’t forget.' },
    ],
  },
];
const QUOTE_POOL: Record<string, CookId[]> = {
  cookhome: ['denise', 'maria', 'lucia'], catering: ['maria', 'amara'], grocery: ['david', 'sana'],
  bulk: ['amara', 'denise'], errand: ['david', 'sana'],
};
const QUOTE_NOTES: Record<string, string[]> = {
  cookhome: ['I’d love to cook for you — menu tailored to the occasion, and I handle all the shopping.', 'Happy to take this on! I’ll send a sample menu once we chat.'],
  catering: ['I can absolutely handle this size — plated or family-style, your call.', 'This is right in my wheelhouse. Deposit reserves your date.'],
  grocery: ['I shop at the Freedom Farmers Market every morning — can add your list to my run.', 'I can have this shopped and dropped within 2 hours.'],
  bulk: ['I batch-cook trays every week — can scale to your count with labeled packaging.', 'Happy to do this as a weekly standing order too, if useful.'],
  errand: ['I’m out on runs every afternoon — easy add.', 'Can do this today between my lunch and dinner windows.'],
};
export function genQuotes(req: ServiceRequest): Quote[] {
  const pool = QUOTE_POOL[req.svc] || ['maria', 'david'];
  const base =
    ({ 'Under $25': 20, '$25–50': 38, 'Under $50': 42, '$50–120': 85, '$120+': 140, '$50+': 60, '$100–250': 180, '$250–500': 360, '$500+': 560, '$150–250': 210, '$250–400': 300, '$400+': 450, '$300–600': 480, '$600–1,200': 900, '$1,200+': 1400 } as Record<string, number>)[req.budget] || 120;
  return pool.slice(0, 2).map((c, i) => ({ cook: c, amount: Math.round(base * (0.9 + i * 0.18)), note: QUOTE_NOTES[req.svc][i] }));
}

/* ---------------- meal plans / subscriptions ---------------- */
export interface MarketPlan { id: string; cook: CookId; name: string; price: number; per: string; meals: number; grad: GradKey; desc: string; items: string[]; }
export const MARKET_PLANS: MarketPlan[] = [
  { id: 'weeknight', cook: 'maria', name: 'Weeknight Italian Box', price: 48, per: 'week', meals: 3, grad: 'g4', desc: 'Three chef-cooked dinners delivered every week — rotating pasta, bakes and one lighter dish.', items: ['Family Lasagna Tray', 'Sunday Meatballs', 'Eggplant Parmigiana'] },
  { id: 'protein', cook: 'david', name: 'High-Protein Reset', price: 42, per: 'week', meals: 3, grad: 'g3', desc: 'Lean, macro-balanced dinners — grilled fish, bowls and greens. 40g+ protein each.', items: ['Honey Garlic Salmon', 'Rainbow Poke Bowl', 'Charred Greens Bowl'] },
  { id: 'soul', cook: 'denise', name: 'Sunday Soul Table', price: 36, per: 'week', meals: 1, grad: 'g6', desc: 'One big family tray every Sunday — slow-braised comfort that feeds four.', items: ['Slow-Braised Short Rib tray', 'Honey Cornbread (6)'] },
  { id: 'halal', cook: 'sana', name: 'Halal Family Box', price: 54, per: 'week', meals: 4, grad: 'g8', desc: 'Four halal-certified dinners for the family, spiced to order.', items: ['Chicken Biryani Box', 'Karahi Night', 'Daal + Naan', 'Kofta Curry'] },
];
export const marketPlanById = (id: string) => MARKET_PLANS.find((p) => p.id === id);
export const PLAN_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sun'];

export interface Subscription { name: string; cook: CookId | null; price: number; per: string; items: string[]; day: string; status: 'active' | 'paused'; skipNext: boolean; }

/* ---------------- storefront ---------------- */
export interface StoreReview { name: string; grad: GradKey; stars: number; time: string; text: string; }
export const STORE_REVIEWS: StoreReview[] = [
  { name: 'Jordan M.', grad: 'g8', stars: 5, time: '2 days ago', text: 'Ordered for the third week running. Tastes like someone’s grandmother is looking out for you.' },
  { name: 'The Okafors', grad: 'g3', stars: 5, time: '1 week ago', text: 'Fed the whole family with one tray. Warm at pickup, spotless packaging, lovely note inside.' },
  { name: 'Priya S.', grad: 'g7', stars: 4, time: '2 weeks ago', text: 'Really good — portion was generous. Delivery ran ten minutes late but they messaged ahead.' },
];
export const STORE_SPECIALTIES: Record<CookId, string[]> = {
  maria: ['Fresh pasta', 'Slow ragù', 'Tiramisu'], david: ['High-protein', 'Seafood', 'Meal prep'],
  amara: ['Jollof', 'Open-fire', 'Party trays'], denise: ['Braises', 'Soul classics', 'Baking'],
  lucia: ['Mole', 'Handmade tortillas', 'Mezcal nights'], sana: ['Dum biryani', 'Halal-certified', 'Family boxes'],
};

export const money = (n: number) => '$' + n.toFixed(2);
