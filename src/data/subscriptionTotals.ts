const BOX_DISCOUNT_BPS = 1000;
const BOX_FEE_BPS = 1500;
const SERVICE_FEE_BPS_DEFAULT = 1000;

type CyclePlan = {
  priceCents: number;
  selectionModel?: 'fixed' | 'customer_choice';
  perMealCents?: number | null;
  perDeliveryCents?: number;
  serviceFeeBps?: number;
  items: { qty: number; priceCents?: number }[];
};

export function customerWeeklyCents(
  cookCents: number,
  serviceFeeBps = SERVICE_FEE_BPS_DEFAULT,
  feeWaived = false,
): number {
  return cookCents + (feeWaived ? 0 : Math.round((cookCents * serviceFeeBps) / 10000));
}

export function estimateCycle(
  plan: CyclePlan,
  selection?: { qty: number; priceCents?: number }[],
  feeWaived = false,
): { subtotalCents: number; feeCents: number; totalCents: number } {
  const perDelivery = plan.perDeliveryCents ?? 0;
  let subtotal: number;
  if ((plan.selectionModel ?? 'fixed') === 'fixed') {
    subtotal = plan.priceCents;
  } else {
    const items = selection ?? plan.items;
    const qty = items.reduce((total, item) => total + item.qty, 0);
    subtotal = plan.perMealCents != null
      ? plan.perMealCents * qty
      : items.reduce((total, item) => total + (item.priceCents ?? 0) * item.qty, 0);
  }
  subtotal += perDelivery;
  const fee = feeWaived ? 0 : Math.round((subtotal * (plan.serviceFeeBps ?? SERVICE_FEE_BPS_DEFAULT)) / 10000);
  return { subtotalCents: subtotal, feeCents: fee, totalCents: subtotal + fee };
}

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
