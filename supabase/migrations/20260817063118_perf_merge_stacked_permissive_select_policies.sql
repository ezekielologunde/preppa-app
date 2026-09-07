-- Baseline-readiness pass, performance follow-up: Supabase's advisor flags
-- tables with multiple PERMISSIVE policies for the same {role, command}.
-- Postgres OR's every permissive policy that applies to the executing role
-- together, evaluating each one's predicate per row -- so two policies that
-- always fire as "base visibility OR owner extra visibility" cost the same
-- planner work as one policy with an explicit OR, just spread across two
-- policy evaluations instead of one.
--
-- Nine SELECT-policy pairs found (queried directly rather than trusting the
-- baseline report's "26 tables" count, which hasn't held up on other
-- specifics checked earlier this pass): experience_sessions, experiences,
-- kitchens, meals, posts, stripe_accounts, subscriptions, ticket_messages,
-- tickets. All nine follow the identical shape -- a public/base-visibility
-- policy plus an owner-or-admin extra-visibility policy -- so each pair is
-- merged by literally OR-ing the two existing qual expressions together
-- verbatim into the wider-scoped policy, then dropping the narrower one. No
-- clause was rewritten or simplified by hand: this is a mechanical
-- (qual_a) OR (qual_b) concatenation, which is exactly what Postgres already
-- computes across two separate permissive policies -- so the merge cannot
-- change which rows are visible to which role, only how many separate
-- policy evaluations the planner does per query.
--
-- Every owner-side qual here resolves through auth.uid() (directly or via
-- is_kitchen_owner()/is_admin()), which is NULL for an anon session, so
-- folding an authenticated-only owner clause into a wider {anon,authenticated}
-- policy is safe: the extra clause always evaluates false/NULL for anon,
-- adding zero rows they couldn't already see.

alter policy experience_sessions_public_read on public.experience_sessions
  using (
    (EXISTS ( SELECT 1
       FROM (experiences e JOIN kitchens k ON ((k.id = e.kitchen_id)))
      WHERE ((e.id = experience_sessions.experience_id) AND (e.status = 'published'::text) AND (k.verification_status = 'verified'::verification_status))))
    OR (is_kitchen_owner(kitchen_id) OR is_admin())
  );
drop policy experience_sessions_owner_read on public.experience_sessions;

alter policy experiences_public_read on public.experiences
  using (
    ((status = 'published'::text) AND (EXISTS ( SELECT 1
       FROM kitchens k
      WHERE ((k.id = experiences.kitchen_id) AND (k.verification_status = 'verified'::verification_status)))))
    OR (is_kitchen_owner(kitchen_id) OR is_admin())
  );
drop policy experiences_owner_read on public.experiences;

alter policy kitchens_select_verified_public on public.kitchens
  using (
    (verification_status = 'verified'::verification_status)
    OR (owner_id = (select auth.uid()))
  );
drop policy kitchens_select_own on public.kitchens;

alter policy meals_select_live_public on public.meals
  using (
    ((status = 'live'::meal_status) AND is_kitchen_orderable(kitchen_id))
    OR is_kitchen_owner(kitchen_id)
  );
drop policy meals_select_own on public.meals;

alter policy posts_public_read on public.posts
  using (
    ((status = 'published'::text) AND (EXISTS ( SELECT 1
       FROM kitchens k
      WHERE ((k.id = posts.kitchen_id) AND (k.verification_status = 'verified'::verification_status)))))
    OR (EXISTS ( SELECT 1
       FROM kitchens k
      WHERE ((k.id = posts.kitchen_id) AND (k.owner_id = (select auth.uid())))))
  );
drop policy posts_owner_read on public.posts;

alter policy stripe_accounts_select_own on public.stripe_accounts
  using (
    is_kitchen_owner(kitchen_id)
    OR is_admin()
  );
drop policy stripe_accounts_admin_read on public.stripe_accounts;

alter policy subs_customer_read on public.subscriptions
  using (
    (customer_id = (select auth.uid()))
    OR (kitchen_id IN ( SELECT kitchens.id FROM kitchens WHERE (kitchens.owner_id = (select auth.uid()))))
  );
drop policy subs_cook_read on public.subscriptions;

alter policy tmsg_select_own on public.ticket_messages
  using (
    ((NOT is_internal) AND (EXISTS ( SELECT 1
       FROM tickets t
      WHERE ((t.id = ticket_messages.ticket_id) AND (t.reporter_id = (select auth.uid()))))))
    OR ((NOT is_internal) AND (EXISTS ( SELECT 1
       FROM tickets t
      WHERE ((t.id = ticket_messages.ticket_id) AND t.cook_visible AND is_kitchen_owner(t.kitchen_id)))))
  );
drop policy tmsg_select_cook on public.ticket_messages;

alter policy tickets_select_own on public.tickets
  using (
    (reporter_id = (select auth.uid()))
    OR (cook_visible AND is_kitchen_owner(kitchen_id))
  );
drop policy tickets_select_cook on public.tickets;
