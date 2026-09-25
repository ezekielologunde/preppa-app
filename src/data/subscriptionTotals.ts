const BOX_DISCOUNT_BPS = 1000;
const BOX_FEE_BPS = 1500;

/** Customer box preview: subtotal minus the 10% bundle discount plus the 15% box fee. */
export function estimateBox(items: { qty: number; priceCents: number }[], feeWaived = false): {
  subtotalCents: number;
  discountCents: number;
  feeCents: number;
  totalCents: number;
} {
  const subtotal = items.reduce((sum, item) => sum + item.priceCents * item.qty, 0);
  const discount = Math.round((subtotal * BOX_DISCOUNT_BPS) / 10000);
  const fee = feeWaived ? 0 : Math.round((subtotal * BOX_FEE_BPS) / 10000);
  return {
    subtotalCents: subtotal,
    discountCents: discount,
    feeCents: fee,
    totalCents: subtotal - discount + fee,
  };
}
