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

const TAX_RATE = 0.089; // Atlanta, GA combined sales tax (illustrative)
const round = (n: number) => Math.round(n * 100) / 100;

export function computeTotals(cart: TotalLine[], tip: number, mode: 'delivery' | 'pickup'): Totals {
  const subtotal = round(cart.reduce((s, l) => s + l.price * l.qty, 0));
  const hasFounder = cart.some((l) => FOUNDING.has(l.cook));
  const serviceFull = round(subtotal * 0.1);
  const service = hasFounder ? 0 : serviceFull;
  const deliveryFull = mode === 'pickup' ? 0 : 2.99;
  const delivery = 0; // free-delivery reward — shown struck-through, charged $0
  const tax = round(subtotal * TAX_RATE);
  const total = round(subtotal + service + delivery + tax + tip);
  return { subtotal, service, serviceFull, hasFounder, deliveryFull, delivery, tax, total, tip };
}
