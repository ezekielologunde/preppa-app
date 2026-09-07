
-- Performance fix (auth_rls_initplan advisor): these SECURITY DEFINER helper functions are
-- called from ~30+ RLS policies across the schema. Each had a bare `auth.uid()` call inside;
-- wrapping it as `(select auth.uid())` lets Postgres's planner hoist it into a once-per-query
-- InitPlan instead of re-resolving it per row. Pure query-plan optimization — identical logic,
-- identical return values, no behavior change.

create or replace function public.is_kitchen_owner(kid uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from kitchens k
    where k.id = kid and k.owner_id = (select auth.uid()) and k.verification_status = 'verified'
  );
$function$;

create or replace function public.is_active_kitchen_owner(kid uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from kitchens k
    where k.id = kid and k.owner_id = (select auth.uid()) and k.verification_status = 'verified'
  );
$function$;

create or replace function public.is_admin()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (select 1 from profiles where id = (select auth.uid()) and role = 'admin');
$function$;

create or replace function public.owns_subscription(sub_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (select 1 from subscriptions s where s.id = sub_id and s.customer_id = (select auth.uid()));
$function$;

create or replace function public.cook_owns_subscription(sub_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from subscriptions s join kitchens k on k.id = s.kitchen_id
    where s.id = sub_id and k.owner_id = (select auth.uid()));
$function$;

-- is_kitchen_orderable doesn't reference auth.uid() at all (payouts/availability check only) —
-- left unchanged, included here only for completeness of the audit.;
