-- Regression tests for the 2026-08 stabilization/hardening pass.
--
-- Plain SQL assertions (RAISE EXCEPTION on failure), not pgTAP -- no extra
-- extension dependency, and every check here was validated directly against
-- the live project before being written down, so this file encodes checks
-- already proven true, not aspirational ones.
--
-- Run via: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/regressions.sql
-- (or through `supabase test db` against a local stack with migrations applied)
--
-- Wrapped in one transaction that ALWAYS rolls back at the end -- nothing
-- here persists, so it's safe to point at any environment including a real
-- project, though CI should run it against a fresh local instance.
begin;

do $$
begin
  if has_function_privilege('authenticated', 'public.notify(uuid,text,text,text)', 'execute') then
    raise exception 'REGRESSION: authenticated can call notify() directly -- notification spoofing/spam vector reopened';
  end if;
  if has_function_privilege('anon', 'public.notify(uuid,text,text,text)', 'execute') then
    raise exception 'REGRESSION: anon can call notify() directly';
  end if;
end $$;

do $$
begin
  if has_function_privilege('authenticated', 'public.kitchen_broadcast_audience(uuid)', 'execute') then
    raise exception 'REGRESSION: authenticated can call kitchen_broadcast_audience() directly -- subscriber-list enumeration leak reopened';
  end if;
  if has_function_privilege('anon', 'public.kitchen_broadcast_audience(uuid)', 'execute') then
    raise exception 'REGRESSION: anon can call kitchen_broadcast_audience() directly';
  end if;
end $$;

do $$
begin
  if has_function_privilege('authenticated', 'public.notify_experience_waitlist(uuid)', 'execute') then
    raise exception 'REGRESSION: authenticated can call notify_experience_waitlist() directly';
  end if;
end $$;

-- The legitimate wrappers around the two locked-down functions above must
-- keep working -- this guards against a future "fix" that revokes too much.
do $$
begin
  if not has_function_privilege('authenticated', 'public.my_broadcast_audience_count()', 'execute') then
    raise exception 'REGRESSION: authenticated lost access to my_broadcast_audience_count() -- broadcast audience preview is broken';
  end if;
  if not has_function_privilege('authenticated', 'public.send_kitchen_broadcast(text,text)', 'execute') then
    raise exception 'REGRESSION: authenticated lost access to send_kitchen_broadcast() -- kitchen broadcast feature is broken';
  end if;
end $$;

-- reconcile_paid_invoice and reconcile_paid_pi must stay symmetric
-- (service_role/postgres only) -- one was historically broader than the
-- other and got tightened to match.
do $$
declare v_invoice_acl aclitem[]; v_pi_acl aclitem[];
begin
  select proacl into v_invoice_acl from pg_proc where oid = 'public.reconcile_paid_invoice'::regproc;
  select proacl into v_pi_acl from pg_proc where oid = 'public.reconcile_paid_pi'::regproc;
  if v_invoice_acl is distinct from v_pi_acl then
    raise exception 'REGRESSION: reconcile_paid_invoice and reconcile_paid_pi grants have drifted apart again (invoice=%, pi=%)', v_invoice_acl, v_pi_acl;
  end if;
end $$;

-- No RLS policy in public should call auth.uid()/auth.jwt()/auth.role() bare
-- -- every call must be wrapped in a scalar subquery so Postgres evaluates
-- it once per query instead of once per row (auth_rls_initplan fix).
do $$
declare v_count int;
begin
  select count(*) into v_count
  from pg_policies
  where schemaname = 'public'
    and (
      (qual is not null and qual ~ '(?<!SELECT )auth\.(uid|jwt|role)\(\)')
      or
      (with_check is not null and with_check ~ '(?<!SELECT )auth\.(uid|jwt|role)\(\)')
    );
  if v_count > 0 then
    raise exception 'REGRESSION: % RLS polic(y/ies) in public call auth.uid()/jwt()/role() unwrapped again (auth_rls_initplan)', v_count;
  end if;
end $$;

-- No table should have multiple PERMISSIVE policies effectively applying to
-- the same role for the same command (multiple_permissive_policies) --
-- Postgres ORs them all together and evaluates every predicate per row.
do $$
declare v_count int;
begin
  with expanded as (
    select tablename, cmd,
      (roles && '{public,authenticated}'::name[]) as applies_to_authenticated,
      (roles && '{public,anon}'::name[]) as applies_to_anon
    from pg_policies
    where schemaname = 'public' and permissive = 'PERMISSIVE'
  ),
  stacked as (
    select tablename, cmd from expanded where applies_to_authenticated group by tablename, cmd having count(*) > 1
    union all
    select tablename, cmd from expanded where applies_to_anon group by tablename, cmd having count(*) > 1
  )
  select count(*) into v_count from stacked;
  if v_count > 0 then
    raise exception 'REGRESSION: % table/command pair(s) have stacked permissive policies again (multiple_permissive_policies)', v_count;
  end if;
end $$;

-- kitchen_public must stay security_invoker so it can never silently bypass
-- RLS on `kitchens` if either the view or the underlying policy changes.
do $$
declare v_opts text[];
begin
  select reloptions into v_opts from pg_class where oid = 'public.kitchen_public'::regclass;
  if v_opts is null or not ('security_invoker=true' = any(v_opts)) then
    raise exception 'REGRESSION: public.kitchen_public lost security_invoker=true';
  end if;
end $$;

-- The one-time manual-repair backup table must stay gone.
do $$
begin
  if to_regclass('public.data_repair_backup_20260710') is not null then
    raise exception 'REGRESSION: public.data_repair_backup_20260710 exists again -- should have been dropped as dead';
  end if;
end $$;

-- is_kitchen_owner() must keep checking verification_status, not just
-- owner_id -- a suspended/rejected owner should not retain access via this
-- helper (used by messaging + financial-summary RPCs).
do $$
declare v_src text;
begin
  select prosrc into v_src from pg_proc where oid = 'public.is_kitchen_owner(uuid)'::regprocedure;
  if v_src !~* 'verification_status' then
    raise exception 'REGRESSION: is_kitchen_owner() no longer checks verification_status';
  end if;
end $$;

rollback;

select 'all regression checks passed' as result;
