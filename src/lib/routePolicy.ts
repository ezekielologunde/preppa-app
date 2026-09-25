const REJECTED_SEED_KITCHEN_ROUTES = new Set([
  'maria',
  'david',
  'amara',
  'denise',
  'lucia',
  'sana',
]);

export function isRejectedSeedKitchenRoute(value: string | undefined): boolean {
  return typeof value === 'string' && REJECTED_SEED_KITCHEN_ROUTES.has(value);
}
