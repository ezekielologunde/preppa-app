import { useCallback, useEffect, useSyncExternalStore } from 'react';

/**
 * Tiny stale-while-revalidate cache at the data-hook seam (no react-query dependency).
 * - Returns cached data immediately (no full-screen spinner on remount).
 * - Dedupes in-flight requests per key (Home + Discover + storefront share one fetch).
 * - `invalidate(key | predicate)` after a mutation refetches active subscribers.
 * Hydration-safe for RN-Web static export: the server snapshot is a stable version 0.
 */
interface Entry {
  data: unknown;
  error: Error | null;
  ts: number;                 // last successful fetch time
  version: number;            // bumped on any change → drives useSyncExternalStore
  promise: Promise<unknown> | null;
  run: (() => Promise<unknown>) | null;
  subs: Set<() => void>;
}

const store = new Map<string, Entry>();

function ent(key: string): Entry {
  let e = store.get(key);
  if (!e) { e = { data: undefined, error: null, ts: 0, version: 0, promise: null, run: null, subs: new Set() }; store.set(key, e); }
  return e;
}
function bump(e: Entry) { e.version++; e.subs.forEach((fn) => fn()); }

function runKey(key: string) {
  const e = ent(key);
  if (e.promise || !e.run) return;
  e.promise = e.run()
    .then((d) => { e.data = d; e.error = null; e.ts = Date.now(); e.promise = null; bump(e); })
    .catch((err) => { e.error = err instanceof Error ? err : new Error(String(err)); e.promise = null; bump(e); });
}

/** Invalidate one key or all keys matching a predicate; refetch any that are being observed. */
export function invalidate(pred: string | ((key: string) => boolean)) {
  for (const [k, e] of store) {
    if (typeof pred === 'string' ? k === pred : pred(k)) {
      e.ts = 0;
      if (e.subs.size) runKey(k);
    }
  }
}

export interface AsyncState<T> { data: T | null; loading: boolean; error: Error | null }

export function useCachedAsync<T>(key: string | null, fetcher: () => Promise<T>, opts?: { staleMs?: number }): AsyncState<T> {
  const staleMs = opts?.staleMs ?? 60_000;

  const subscribe = useCallback((cb: () => void) => {
    if (!key) return () => {};
    const e = ent(key); e.subs.add(cb);
    return () => { e.subs.delete(cb); };
  }, [key]);
  const getVersion = useCallback(() => (key ? ent(key).version : 0), [key]);
  useSyncExternalStore(subscribe, getVersion, getVersion);

  useEffect(() => {
    if (!key) return;
    const e = ent(key);
    e.run = fetcher as () => Promise<unknown>;              // keep latest fetcher for invalidate()
    const stale = Date.now() - e.ts > staleMs;
    if (!e.promise && (e.data === undefined || stale)) runKey(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const e = key ? ent(key) : null;
  return {
    data: (e && e.data !== undefined ? e.data : null) as T | null,
    loading: !!key && e!.data === undefined && !e!.error,
    error: e?.error ?? null,
  };
}
