/**
 * Async data hooks over the repository seam (council #7a). These give screens a
 * ready-made loading/error contract for when the backend lands — adopt incrementally.
 */
import { useEffect, useState } from 'react';
import { getRepositories, MealQuery } from './repository';
import { Meal, Cook, CookId } from './data';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

function useAsync<T>(run: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });
  useEffect(() => {
    let alive = true;
    setState({ data: null, loading: true, error: null });
    run()
      .then((data) => alive && setState({ data, loading: false, error: null }))
      .catch((error) => alive && setState({ data: null, loading: false, error }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export function useMeals(query?: MealQuery): AsyncState<Meal[]> {
  return useAsync(() => getRepositories().meals.list(query), [query?.cook, query?.cat, query?.q]);
}
export function useMeal(id: string): AsyncState<Meal | null> {
  return useAsync(() => getRepositories().meals.byId(id), [id]);
}
export function useCook(id: CookId): AsyncState<Cook | null> {
  return useAsync(() => getRepositories().cooks.byId(id), [id]);
}
