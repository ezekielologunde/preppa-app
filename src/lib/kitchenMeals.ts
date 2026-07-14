/**
 * Prepper-side meal management (edit/pause/resume/archive). Audit Critical: none of this
 * existed before — a prepper could create a meal (create_meal) but never edit, pause, mark
 * sold-out, or archive it again, and "My menu" read from a permanently-empty mock array
 * instead of the real `meals` table.
 */
import { supabase } from './supabase';
import type { GradKey } from '../data/data';

export type RealMealStatus = 'live' | 'paused' | 'sold_out' | 'archived';

export interface MyMealRow {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  serves: number;
  tags: string[] | null;
  grad: GradKey;
  slug: string;
  status: RealMealStatus;
  created_at: string;
}

export async function fetchMyMeals(): Promise<MyMealRow[]> {
  const { data, error } = await supabase.rpc('my_meals');
  if (error) throw error;
  return (data as MyMealRow[]) ?? [];
}

export async function updateMeal(
  mealId: string,
  fields: { name: string; description?: string; priceCents?: number; serves?: number; tags?: string[]; grad?: string },
): Promise<void> {
  const { error } = await supabase.rpc('update_meal', {
    p_meal_id: mealId,
    p_name: fields.name,
    p_description: fields.description ?? null,
    p_price_cents: fields.priceCents ?? null,
    p_serves: fields.serves ?? null,
    p_tags: fields.tags ?? null,
    p_grad: fields.grad ?? null,
  });
  if (error) throw new Error(error.message || 'Could not save changes.');
}

export async function setMealStatus(mealId: string, status: RealMealStatus): Promise<void> {
  const { error } = await supabase.rpc('set_meal_status', { p_meal_id: mealId, p_status: status });
  if (error) throw new Error(error.message || 'Could not update this dish.');
}
