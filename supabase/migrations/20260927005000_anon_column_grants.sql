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
-- * plans: PLAN_SELECT in src/lib/subscriptions.ts plus created_at (its order by). Withheld (every
--   other column, checked against the plans migrations): interval, stripe_price_id, updated_at
--   (20260711055903), meals_per_week, tax_bps, photo_urls, service_area (20260712020200).
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
-- * subs_customer_read, quotes_read, bookings_read (public): anon has no rows there, but without
--   the rewrite a signed-out read would raise 42501 where it returns no rows today.
-- * kitchen_private_owner_or_admin_read (public): rewritten the same way, but it still calls
--   is_admin(), which anon cannot EXECUTE (revoked in 20260708061142), so a signed-out read of
--   kitchen_private raises 42501 as it did before this migration. Left that way on purpose: the
--   table is owner and admin only, the guest client never reads it, and the error exposes nothing.
--
-- Policies split by role (is_admin() in an anon-facing policy). Postgres checks EXECUTE on every
-- function in a policy when the query starts, whether or not the OR branch is reached, and anon
-- lost EXECUTE on is_admin() in 20260708061142. 20260817063118 merged the owner-or-admin branch into
-- experiences_public_read and experience_sessions_public_read, which apply to anon, so every
-- signed-out read of experiences and experience_sessions has raised 42501 since then (guest browse
-- of experiences is broken today, independent of the column grants). Fixed without granting anon
-- EXECUTE on is_admin():
-- * experiences_public_read, experience_sessions_public_read: re-created to authenticated only,
--   with the exact previous expression (published and verified, or is_kitchen_owner() or
--   is_admin()), so signed-in reads are unchanged.
-- * experiences_anon_read, experience_sessions_anon_read (new, to anon): only the published and
--   verified-kitchen part, the same pure-SQL check 20260713214136 used, with no is_admin(),
--   is_kitchen_owner() or auth.uid() branch (for anon those branches were always false or null).
--   They read kitchens.id and kitchens.verification_status, which anon keeps, and experiences.id,
--   status and kitchen_id (experiences keeps its table grant).
-- Sweep: every other SELECT policy that applies to anon on a table the guest client reads (kitchens,
-- meals, posts, livestreams, reviews, plans, plan_items, and the kitchen_public and kitchen_rating
-- views through them) calls only functions anon can EXECUTE (is_kitchen_owner, is_kitchen_orderable,
-- owned_kitchen_ids) or none. The other policies that call is_admin() or a function revoked from
-- anon (stripe_accounts, feed_events, subscription_cycles and the rest) apply to authenticated only.
--
-- Not rewritten: profiles_select_self_or_public_cook applies to
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

-- experiences and experience_sessions: anon gets the published-and-verified rows without any
-- is_admin() call; authenticated keeps the exact previous expression
drop policy if exists experiences_public_read on public.experiences;
create policy experiences_public_read on public.experiences for select to authenticated using (
  ((status = 'published'::text) and (exists (
    select 1 from public.kitchens k
    where ((k.id = experiences.kitchen_id) and (k.verification_status = 'verified'::public.verification_status))
  )))
  or (public.is_kitchen_owner(kitchen_id) or public.is_admin())
);

drop policy if exists experiences_anon_read on public.experiences;
create policy experiences_anon_read on public.experiences for select to anon using (
  status = 'published' and exists (
    select 1 from public.kitchens k
    where k.id = experiences.kitchen_id and k.verification_status = 'verified'
  )
);

drop policy if exists experience_sessions_public_read on public.experience_sessions;
create policy experience_sessions_public_read on public.experience_sessions for select to authenticated using (
  (exists (
    select 1 from (public.experiences e join public.kitchens k on ((k.id = e.kitchen_id)))
    where ((e.id = experience_sessions.experience_id) and (e.status = 'published'::text)
      and (k.verification_status = 'verified'::public.verification_status))
  ))
  or (public.is_kitchen_owner(kitchen_id) or public.is_admin())
);

drop policy if exists experience_sessions_anon_read on public.experience_sessions;
create policy experience_sessions_anon_read on public.experience_sessions for select to anon using (
  exists (
    select 1 from public.experiences e join public.kitchens k on k.id = e.kitchen_id
    where e.id = experience_sessions.experience_id and e.status = 'published'
      and k.verification_status = 'verified'
  )
);
