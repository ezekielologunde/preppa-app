-- Web launch S12 (SECURITY-SPEC 7, DESIGN 2.2): signed-out visitors (role anon) read only the
-- columns guest browse uses on kitchens, reviews, plans and plan_items.
--
-- Why: 20260705122358_0008_grants.sql granted anon table-level SELECT on every public table, and
-- RLS filters rows, not columns. So anon could read every column of a verified kitchen (owner_id,
-- rejection_reason, suspension_reason, in_home_vetting_*, cod flags), every review's author_id,
-- order_id and booking_id, and plans.stripe_price_id and tax_bps. A column-level REVOKE does
-- nothing while the table grant exists, so each table grant is revoked from anon and replaced by
-- an explicit column list. Revoking the table privilege also drops any column privileges, so the
-- revoke-then-grant pair is re-runnable. authenticated and service_role privileges, and ALTER
-- DEFAULT PRIVILEGES, are not touched: signed-in users run as authenticated and are unaffected.
--
-- Column lists (the client code paths that read them signed out):
-- * kitchens: the kitchen_public view (security_invoker, so it needs these columns), the meals
--   embed in src/data/supabaseRepository.ts, the cart re-check in src/lib/orders.ts, and the
--   kitchens!inner(name, avatar_url, verification_status) embeds in src/lib/feed.ts and
--   src/lib/livestream.ts. Withheld: owner_id, cod_enabled, cod_paused, approved_at,
--   rejection_reason, suspension_reason, service_categories, in_home_vetting_*,
--   approval_notice_seen_at, updated_at.
-- * reviews: src/data/hooks.ts and the kitchen_rating view. Withheld: author_id, order_id, booking_id.
-- * plans: PLAN_SELECT in src/lib/subscriptions.ts plus created_at (its order by). Withheld:
--   stripe_price_id, tax_bps, interval, service_area, photo_urls, updated_at.
-- * plan_items: the plan_items(qty, meal_id, week_index) embed, plus its keys.
--
-- Policies rewritten. A subquery inside an RLS policy runs as the querying role, so a policy on
-- another table that reads kitchens.owner_id would raise 42501 for anon once owner_id is withheld.
-- Every SELECT policy that applies to anon (to anon, or no role given, which is public) and reads
-- kitchens.owner_id is re-created under the same name, command and roles, with
--   kitchen_id in (select id from kitchens where owner_id = auth.uid())
-- replaced by
--   kitchen_id in (select public.owned_kitchen_ids())
-- owned_kitchen_ids() is SECURITY DEFINER and returns the ids of the kitchens the caller owns. It
-- returns the same set as the old subquery: that subquery saw kitchens through
-- kitchens_select_verified_public, which always shows the caller's own rows (owner_id = auth.uid()),
-- so skipping RLS inside the definer adds and removes nothing. For anon auth.uid() is null and the
-- set is empty, as before. The rewritten policies:
-- * plans_read_active (public): guest browse lists active plans.
-- * plan_items_read (public): guest browse embeds plan_items in each plan.
-- * posts_public_read (anon, authenticated): guest feed reads published posts.
-- * subs_customer_read, quotes_read, bookings_read, kitchen_private_owner_or_admin_read (public):
--   anon has no rows there, but without the rewrite a signed-out read would raise 42501 where it
--   returns no rows today.
-- Not rewritten: experiences_public_read and experience_sessions_public_read read only kitchens.id
-- and kitchens.verification_status, which anon keeps; profiles_select_self_or_public_cook applies to
-- authenticated only; the plan_items insert, update and delete policies apply to writes, which anon
-- cannot make (no INSERT, UPDATE or DELETE grant). A kitchens policy may read owner_id itself: the
-- columns a policy reads on its own table are not checked against the caller's column privileges.
--
-- Rollout: apply on the test project and run supabase/tests/anon_browse_smoke.sql there first.
-- Apply to production last: a published mobile build exists, and only signed-out or expired-session
-- clients could see a permission error.

create or replace function public.owned_kitchen_ids()
returns setof uuid
language sql
stable security definer
set search_path to 'public'
as $function$
  select k.id from public.kitchens k where k.owner_id = (select auth.uid());
$function$;

revoke all on function public.owned_kitchen_ids() from public;
grant execute on function public.owned_kitchen_ids() to anon, authenticated;

-- kitchens
revoke select on public.kitchens from anon;
grant select (
  id, name, slug, cuisine, bio, approx_area, approx_lat, approx_lng, avatar_url, cover_url,
  specialties, years_active, availability, created_at, is_pro, supports_delivery, supports_pickup,
  verification_status
) on public.kitchens to anon;

-- reviews
revoke select on public.reviews from anon;
grant select (id, kitchen_id, rating, body, created_at) on public.reviews to anon;

-- plans
revoke select on public.plans from anon;
grant select (
  id, kitchen_id, name, description, price_cents, fulfillment, goal, selection_model,
  meals_per_delivery, servings, per_meal_cents, per_delivery_cents, service_fee_bps, delivery_days,
  cutoff_hours, lead_time_hours, min_commitment, trial_price_cents, trial_cycles, cadence_weeks,
  rotating, rotation_weeks, status, cover_url, dietary_tags, allergens, created_at
) on public.plans to anon;

-- plan_items
revoke select on public.plan_items from anon;
grant select (id, plan_id, meal_id, qty, week_index) on public.plan_items to anon;

-- policies that read kitchens.owner_id, re-created on the definer helper
drop policy if exists plans_read_active on public.plans;
create policy plans_read_active on public.plans for select using (
  status = 'active' or kitchen_id in (select public.owned_kitchen_ids())
);

drop policy if exists plan_items_read on public.plan_items;
create policy plan_items_read on public.plan_items for select using (
  plan_id in (
    select p.id from public.plans p
    where p.status = 'active' or p.kitchen_id in (select public.owned_kitchen_ids())
  )
);

drop policy if exists posts_public_read on public.posts;
create policy posts_public_read on public.posts for select to anon, authenticated using (
  (status = 'published' and exists (
    select 1 from public.kitchens k
    where k.id = posts.kitchen_id and k.verification_status = 'verified'
  ))
  or kitchen_id in (select public.owned_kitchen_ids())
);

drop policy if exists subs_customer_read on public.subscriptions;
create policy subs_customer_read on public.subscriptions for select using (
  customer_id = (select auth.uid()) or kitchen_id in (select public.owned_kitchen_ids())
);

drop policy if exists quotes_read on public.quotes;
create policy quotes_read on public.quotes for select using (
  request_id in (select sr.id from public.service_requests sr where sr.customer_id = (select auth.uid()))
  or kitchen_id in (select public.owned_kitchen_ids())
);

drop policy if exists bookings_read on public.bookings;
create policy bookings_read on public.bookings for select using (
  customer_id = (select auth.uid()) or kitchen_id in (select public.owned_kitchen_ids())
);

drop policy if exists kitchen_private_owner_or_admin_read on public.kitchen_private;
create policy kitchen_private_owner_or_admin_read on public.kitchen_private for select using (
  public.is_admin() or kitchen_id in (select public.owned_kitchen_ids())
);
