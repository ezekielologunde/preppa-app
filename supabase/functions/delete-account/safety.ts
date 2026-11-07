/** Never interpret an unavailable dependency as permission to delete an account. */
export function requireDeletionResult<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw new Error('Account deletion dependency failed');
  return result.data;
}

interface Subscriptions {
  retrieve(id: string): Promise<{ status: string }>;
  cancel(id: string): Promise<{ status: string }>;
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
