-- CRITICAL: confirmed exploitable (rolled-back simulation as the real "I made Kitchen" owner):
-- kitchens_update_own lets any kitchen owner UPDATE their own row, and is_pro was NOT among
-- the columns guard_kitchen_privileged_columns protects (only verification_status/approved_at/
-- cod_enabled/cod_paused were). Any cook could self-grant Preppa Pro's fee discount, priority
-- placement, and badge for free, with no Stripe subscription, directly undermining the
-- membership feature shipped this session. Also fixes the same deprecated-GUC detection bug
-- as guard_profile_privileged_columns / check_rate_limit, using auth.role() instead so the
-- fix is consistent and doesn't depend on the accidental "always blocks" side effect of the
-- old broken check.
create or replace function public.guard_kitchen_privileged_columns()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if auth.role() is distinct from 'service_role'
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
