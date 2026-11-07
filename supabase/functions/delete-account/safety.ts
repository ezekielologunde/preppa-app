/** Never interpret an unavailable dependency as permission to delete an account. */
export function requireDeletionResult<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw new Error('Account deletion dependency failed');
  return result.data;
}

interface Subscriptions {
  retrieve(id: string): Promise<{ status: string }>;
  cancel(id: string): Promise<{ status: string }>;
}

/** A missing or malformed eligibility response must never authorize deletion. */
export function requireDeletionBlockers(value: unknown): {
  has_active_orders: boolean; balance_cents: number; active_subscribers: number; is_suspended: boolean;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Deletion eligibility unavailable');
  const row = value as Record<string, unknown>;
  if (typeof row.has_active_orders !== 'boolean' || typeof row.is_suspended !== 'boolean'
    || typeof row.balance_cents !== 'number' || !Number.isSafeInteger(row.balance_cents)
    || typeof row.active_subscribers !== 'number' || !Number.isSafeInteger(row.active_subscribers) || row.active_subscribers < 0) {
    throw new Error('Deletion eligibility unavailable');
  }
  return { has_active_orders: row.has_active_orders, balance_cents: row.balance_cents,
    active_subscribers: row.active_subscribers, is_suspended: row.is_suspended };
}

/** Confirm cancellation before removing access. Retry is safe after a partial failure. */
export async function cancelForDeletion(subscriptions: Subscriptions, id: string | null | undefined): Promise<void> {
  if (id == null) return;
  if (!id.trim()) throw new Error('Invalid subscription reference');
  const current = await subscriptions.retrieve(id);
  if (current.status === 'canceled') return;
  const canceled = await subscriptions.cancel(id);
  if (canceled.status !== 'canceled') throw new Error('Subscription cancellation not confirmed');
}
