import { supabase } from './supabase';

/**
 * In-home ("Cook at My Place") vetting — a separate, higher bar than general kitchen
 * verification, since this category sends a prepper into a customer's home. Docs (background
 * check + insurance) upload to the same private `cook-docs` bucket as kitchen application
 * docs (see uploadCookPhoto in supabase.ts); status lives on kitchens.in_home_vetting_status
 * and gates routing in create-service-request/edit-service-request.
 */

export type VettingStatus = 'unverified' | 'pending' | 'verified' | 'rejected' | 'suspended';

export interface InHomeVettingDocs { backgroundCheck: string[]; insurance: string[] }
export interface MyInHomeVetting {
  status: VettingStatus;
  vettedAt: string | null;
  reason: string | null;
  docs: InHomeVettingDocs;
  insuranceExpiresAt: string | null;
}

const emptyDocs = (): InHomeVettingDocs => ({ backgroundCheck: [], insurance: [] });

/** The caller's own kitchen's in-home vetting state (owner-only via RLS on kitchen_private). */
export async function getMyInHomeVetting(kitchenId: string): Promise<MyInHomeVetting> {
  const { data: k } = await supabase.from('kitchens')
    .select('in_home_vetting_status, in_home_vetted_at, in_home_vetting_reason')
    .eq('id', kitchenId).maybeSingle();
  const { data: kp } = await supabase.from('kitchen_private')
    .select('in_home_vetting').eq('kitchen_id', kitchenId).maybeSingle();
  const v = (kp?.in_home_vetting as any) ?? {};
  return {
    status: (k?.in_home_vetting_status as VettingStatus) ?? 'unverified',
    vettedAt: k?.in_home_vetted_at ?? null,
    reason: k?.in_home_vetting_reason ?? null,
    docs: { backgroundCheck: v?.docs?.backgroundCheck ?? [], insurance: v?.docs?.insurance ?? [] },
    insuranceExpiresAt: v?.insuranceExpiresAt ?? null,
  };
}

/** Submit/resubmit for review — flips status to 'pending'. */
export async function submitInHomeVetting(kitchenId: string, docs: InHomeVettingDocs, insuranceExpiresAt?: string | null): Promise<void> {
  const { error } = await supabase.rpc('submit_in_home_vetting', {
    p_kitchen: kitchenId, p_docs: docs, p_insurance_expires: insuranceExpiresAt ?? null,
  });
  if (error) throw new Error(error.message || 'Could not submit for review.');
}

export { emptyDocs };
