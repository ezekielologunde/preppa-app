-- Self-review catch: the previous fix (critical_fix_kitchen_is_pro_self_grantable) used
-- `auth.role() IS DISTINCT FROM 'service_role'` as the block condition, which is TRUE both
-- for a real client (correct) AND for a completely empty JWT context (WRONG) -- verified via
-- a rolled-back test that this broke sync_cook_pro_membership's legitimate kitchens.is_pro
-- write when triggered from a raw, non-PostgREST database connection (exactly how
-- stripe-worker's SUPABASE_DB_URL connection and pg_cron operate -- no request.jwt.claims at
-- all, not even role=anon).
--
-- Fix: only block when a role claim is EXPLICITLY present and is not service_role. A real
-- PostgREST request (from any client, authenticated or not) always gets SOME role set by
-- PostgREST itself (anon or authenticated) -- an external attacker can never present a
-- genuinely empty JWT context, so treating "no claims at all" as trusted is safe. Only a
-- true internal caller (superuser SQL session, a worker's raw DB connection, or a nested
-- SECURITY DEFINER call originating from either) can have auth.role() return NULL.
-- Applies the same corrected condition to both guard triggers for consistency.
create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if auth.role() is not null and auth.role() <> 'service_role'
     and coalesce(current_setting('app.privileged', true), 'off') <> 'on' then
    if new.role is distinct from old.role
       or new.verification_status is distinct from old.verification_status
       or new.stripe_customer_id is distinct from old.stripe_customer_id then
      raise exception 'role/verification_status/stripe_customer_id are not client-writable';
    end if;
  end if;
  return new;
end $function$;

create or replace function public.guard_kitchen_privileged_columns()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if auth.role() is not null and auth.role() <> 'service_role'
     and coalesce(current_setting('app.privileged', true), 'off') <> 'on' then
    if new.verification_status is distinct from old.verification_status
       or new.approved_at is distinct from old.approved_at
       or new.cod_enabled is distinct from old.cod_enabled
       or new.cod_paused is distinct from old.cod_paused
       or new.is_pro is distinct from old.is_pro then
      raise exception 'kitchen verification/COD/membership flags are platform-controlled, not client-writable';
    end if;
  end if;
  return new;
end $function$;
