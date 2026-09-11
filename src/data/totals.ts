/* Pure order-total math — the single source of truth for both the cart UI and placeOrder. */
import { CookId, FOUNDING } from './data';

export interface Totals {
  subtotal: number;
  service: number;
  serviceFull: number;
  hasFounder: boolean;
  deliveryFull: number;
  delivery: number;
  tax: number;
  total: number;
  tip: number;
}

/** A cart line — structurally compatible with the store's CartLine. */
export interface TotalLine {
  price: number;
  qty: number;
  cook: CookId;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Pre-checkout preview only — real tax is a Stripe Tax calculation done server-side in
 *  `create-order` (jurisdiction-aware, not a single flat rate) once the buyer's country is
 *  known. This preview always shows $0 tax; the real amount appears after the order is
 *  created (see `taxCents` from `createRealOrder`/`payWithCard`) and on the order receipt. */
export function computeTotals(cart: TotalLine[], tip: number, mode: 'delivery' | 'pickup'): Totals {
  const subtotal = round(cart.reduce((s, l) => s + l.price * l.qty, 0));
  const hasFounder = cart.some((l) => FOUNDING.has(l.cook));
  const serviceFull = round(subtotal * 0.1);
  const service = hasFounder ? 0 : serviceFull;
  const deliveryFull = mode === 'pickup' ? 0 : 2.99;
  const delivery = 0; // free-delivery reward — shown struck-through, charged $0
  const tax = 0;
  const total = round(subtotal + service + delivery + tax + tip);
  return { subtotal, service, serviceFull, hasFounder, deliveryFull, delivery, tax, total, tip };
}
