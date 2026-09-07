
-- In-home ("Cook at My Place") vetting: a separate, higher bar than general kitchen
-- verification, since this category sends a prepper into a customer's home. Reuses the
-- existing verification_status enum (unverified/pending/verified/rejected/suspended) so it
-- reads consistently with kitchens.verification_status.
alter table public.kitchens
  add column in_home_vetting_status verification_status not null default 'unverified',
  add column in_home_vetted_at timestamptz,
  add column in_home_vetting_reason text;

-- Private docs (background-check + insurance) live in kitchen_private, same place as the
-- existing food_safety application docs — same RLS (owner + admin only).
alter table public.kitchen_private
  add column in_home_vetting jsonb;

comment on column public.kitchens.in_home_vetting_status is 'Separate from verification_status — gates routing of cook_at_home service requests.';
comment on column public.kitchen_private.in_home_vetting is 'Shape: {docs:{backgroundCheck:[storagePath,...], insurance:[storagePath,...]}, insuranceExpiresAt: date, note: text}';
