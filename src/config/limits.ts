/** Must match the per-line quantity ceiling enforced by create-order and subscription functions. */
export const MAX_ORDER_ITEM_QUANTITY = 20;

export function normalizeOrderQuantity(value: number, fallback = 1): number {
  const finite = Number.isFinite(value) ? value : fallback;
  return Math.max(1, Math.min(MAX_ORDER_ITEM_QUANTITY, Math.floor(finite)));
}
