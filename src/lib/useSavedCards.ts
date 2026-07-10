import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { listPaymentMethods, SavedCard } from './payments';

/**
 * Loads the buyer's saved cards (web-only — the real payment path is web-only).
 * Shared by the payments screen and checkout so both see the same list + default.
 */
export function useSavedCards() {
  const [methods, setMethods] = useState<SavedCard[]>([]);
  const [defaultId, setDefaultId] = useState<string | null>(null);
  const [loading, setLoading] = useState(Platform.OS === 'web');
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    if (Platform.OS !== 'web') {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await listPaymentMethods();
      setMethods(res.methods);
      setDefaultId(res.defaultId);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { methods, defaultId, loading, error, refetch };
}
