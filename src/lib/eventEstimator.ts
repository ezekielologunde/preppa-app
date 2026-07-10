/**
 * Event cost estimator — deterministic, advisory-only.
 *
 * Purpose: most customers planning a large event have no idea what catering costs
 * and budget by optimism. This gives them an honest ballpark (a RANGE, never a
 * fake-precise number) for budget, menu, serving quantities and staffing BEFORE
 * they talk to any prepper — so they arrive informed.
 *
 * It is intentionally rules-based, not an LLM call: the value here is explainable,
 * consistent ranges grounded in defensible US catering economics, not creativity.
 * Every figure is a planning estimate; real prices come from real prepper quotes.
 *
 * Sources for the per-person bands below are typical US catering ranges (drop-off
 * through full-service/luxury) as of 2026; they are deliberately wide.
 */

export type ServiceLevel = 'dropoff' | 'standard' | 'full' | 'luxury';
export type EstimatorModel = 'catering' | 'class' | 'mealprep';

export interface EventType {
  key: string;
  label: string;
  icon: string; // maps to the app Icon set
  model: EstimatorModel;
  /** catering: per-person cost multiplier vs. the base band (richer/leaner events). */
  mult?: number;
  /** a short, tailorable sample menu shown to anchor expectations. */
  menu: string[];
}

export const EVENT_TYPES: EventType[] = [
  { key: 'corporate', label: 'Corporate Lunch', icon: 'calendar', model: 'catering', mult: 1.0, menu: ['Two mains (one vegetarian)', 'Grain or pasta side', 'Fresh salad', 'Dessert tray', 'Drinks & water'] },
  { key: 'birthday', label: 'Birthday Party', icon: 'gift', model: 'catering', mult: 1.0, menu: ['Crowd-pleaser main', 'Two sides', 'Salad', 'Cake or dessert bar', 'Soft drinks'] },
  { key: 'shower', label: 'Wedding Shower', icon: 'heart', model: 'catering', mult: 1.15, menu: ['Passed appetizers', 'Two elegant mains', 'Seasonal salad', 'Dessert display', 'Mocktail / punch'] },
  { key: 'reunion', label: 'Family Reunion', icon: 'users', model: 'catering', mult: 0.9, menu: ['BBQ or smoked main', 'Three homestyle sides', 'Cornbread / rolls', 'Cobbler or cookies', 'Iced tea & lemonade'] },
  { key: 'graduation', label: 'Graduation Party', icon: 'star', model: 'catering', mult: 0.9, menu: ['Two casual mains', 'Two sides', 'Chips & dip', 'Sheet cake', 'Assorted drinks'] },
  { key: 'church', label: 'Church Event', icon: 'users', model: 'catering', mult: 0.85, menu: ['Big-batch main', 'Rice or potato side', 'Vegetable side', 'Rolls', 'Dessert & drinks'] },
  { key: 'dinner', label: 'Private Dinner', icon: 'chefhat', model: 'catering', mult: 1.3, menu: ['Chef-plated 3 courses', 'Starter', 'Main with sides', 'Dessert', 'Wine pairing (optional)'] },
  { key: 'class', label: 'Cooking Class', icon: 'flame', model: 'class', menu: ['Hands-on guided dishes', 'All ingredients provided', 'Recipe cards to keep', 'Tastings throughout'] },
  { key: 'reset', label: 'Meal Prep Reset', icon: 'repeat', model: 'mealprep', menu: ['A week of balanced meals', 'Portioned & labeled containers', 'Mix of proteins & veg', 'Reheat instructions'] },
];

export function eventTypeByKey(key: string): EventType | undefined {
  return EVENT_TYPES.find((e) => e.key === key);
}

export const SERVICE_LEVELS: { key: ServiceLevel; label: string; sub: string }[] = [
  { key: 'dropoff', label: 'Drop-off', sub: 'Food only, no staff' },
  { key: 'standard', label: 'Standard', sub: 'Catered, light setup' },
  { key: 'full', label: 'Full-service', sub: 'Staff, setup & cleanup' },
  { key: 'luxury', label: 'Luxury', sub: 'Premium, white-glove' },
];

export const DIETARY_OPTIONS = ['Vegan', 'Vegetarian', 'Halal', 'Keto', 'Gluten-free', 'Nut-free'];

// Per-person food cost bands (USD), before the event-type multiplier.
const BANDS: Record<ServiceLevel, [number, number]> = {
  dropoff: [14, 24],
  standard: [26, 42],
  full: [48, 80],
  luxury: [95, 160],
};

export interface EstimatorInput {
  eventType: string;
  adults: number;
  children: number;
  serviceLevel: ServiceLevel;
  dietary: string[];
}

export interface EstimateResult {
  model: EstimatorModel;
  guests: number;
  effectiveGuests: number;
  perPersonLow: number;
  perPersonHigh: number;
  budgetLow: number;
  budgetHigh: number;
  staffing: { cooks: number; servers: number } | null;
  quantities: { label: string; value: string }[];
  menu: string[];
  notes: string[];
}

const round5 = (n: number) => Math.round(n / 5) * 5;
const round25 = (n: number) => Math.round(n / 25) * 25;
const roundBudget = (n: number) => (n >= 500 ? round25(n) : round5(n));

/** Format a whole-dollar amount like $1,850. */
export function usd(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

/** Human range, e.g. "$1,500–$2,400" (or a single value when low==high). */
export function usdRange(low: number, high: number): string {
  return low === high ? usd(low) : `${usd(low)}–${usd(high)}`;
}

export function estimate(input: EstimatorInput): EstimateResult {
  const type = eventTypeByKey(input.eventType) ?? EVENT_TYPES[0];
  const adults = Math.max(0, Math.floor(input.adults));
  const children = Math.max(0, Math.floor(input.children));
  const guests = Math.max(1, adults + children);
  // Children eat ~60% of an adult portion — standard catering planning assumption.
  const eff = Math.max(1, adults + children * 0.6);
  const dietary = input.dietary ?? [];
  const notes: string[] = ['This is a rough planning estimate — real, fixed prices come from prepper quotes.'];
  if (dietary.length) notes.push(`Menu can be adapted for ${dietary.join(', ').toLowerCase()} — tell your prepper in the request.`);

  // --- Cooking class: priced per seat, not per catered head ---
  if (type.model === 'class') {
    const [lo, hi] = [45, 95];
    const budgetLow = roundBudget(guests * lo);
    const budgetHigh = roundBudget(guests * hi);
    const instructors = Math.max(1, Math.ceil(guests / 10));
    notes.push('Classes are priced per seat and usually cap around 12–16 guests for a hands-on experience.');
    return {
      model: 'class', guests, effectiveGuests: eff,
      perPersonLow: lo, perPersonHigh: hi, budgetLow, budgetHigh,
      staffing: { cooks: instructors, servers: 0 },
      quantities: [
        { label: 'Seats', value: `${guests}` },
        { label: 'Instructor(s)', value: `${instructors}` },
        { label: 'Dishes', value: '2–3 hands-on' },
      ],
      menu: type.menu, notes,
    };
  }

  // --- Meal-prep reset: priced per person for a week of prepped meals ---
  if (type.model === 'mealprep') {
    const [lo, hi] = [90, 165]; // ~10–12 meals pp/week
    const budgetLow = roundBudget(guests * lo);
    const budgetHigh = roundBudget(guests * hi);
    notes.push('Priced for roughly a week of meals per person (about 10–12 portioned containers).');
    return {
      model: 'mealprep', guests, effectiveGuests: eff,
      perPersonLow: lo, perPersonHigh: hi, budgetLow, budgetHigh,
      staffing: null,
      quantities: [
        { label: 'People', value: `${guests}` },
        { label: 'Meals / week', value: `${guests * 10}–${guests * 12}` },
        { label: 'Proteins', value: '2–3 rotating' },
      ],
      menu: type.menu, notes,
    };
  }

  // --- Catering (the common case) ---
  const [baseLo, baseHi] = BANDS[input.serviceLevel];
  const mult = type.mult ?? 1;
  const ppLow = round5(baseLo * mult) || baseLo;
  const ppHigh = round5(baseHi * mult) || baseHi;
  let budgetLow = eff * ppLow;
  let budgetHigh = eff * ppHigh;

  // Staffing only applies to serviced tiers.
  let staffing: { cooks: number; servers: number } | null = null;
  if (input.serviceLevel === 'full' || input.serviceLevel === 'luxury') {
    const cooks = guests <= 30 ? 1 : guests <= 100 ? 2 : guests <= 200 ? 3 : 3 + Math.ceil((guests - 200) / 100);
    const servers = Math.max(1, Math.ceil(guests / 25));
    staffing = { cooks, servers };
    // Fold a labor line into the range (~$160–260 per staffer for the event).
    const staff = cooks + servers;
    budgetLow += staff * 160;
    budgetHigh += staff * 260;
    notes.push(`Includes an estimated ${cooks} cook${cooks > 1 ? 's' : ''} + ${servers} server${servers > 1 ? 's' : ''}; setup & cleanup covered at this tier.`);
  } else if (input.serviceLevel === 'dropoff') {
    notes.push('Drop-off only — no on-site staff, setup or cleanup.');
  }

  budgetLow = roundBudget(budgetLow);
  budgetHigh = roundBudget(budgetHigh);

  // Serving quantities — simple, honest planning portions.
  const proteinLb = Math.round(eff * 0.4); // ~6 oz cooked pp
  const quantities = [
    { label: 'Main servings', value: `≈ ${Math.ceil(eff)}` },
    { label: 'Protein', value: `≈ ${proteinLb} lb` },
    { label: 'Sides', value: `2 × ≈ ${Math.ceil(eff * 1.2)} servings` },
    { label: 'Dessert', value: `≈ ${Math.ceil(eff)} portions` },
  ];

  return {
    model: 'catering', guests, effectiveGuests: eff,
    perPersonLow: ppLow, perPersonHigh: ppHigh, budgetLow, budgetHigh,
    staffing, quantities, menu: type.menu, notes,
  };
}
