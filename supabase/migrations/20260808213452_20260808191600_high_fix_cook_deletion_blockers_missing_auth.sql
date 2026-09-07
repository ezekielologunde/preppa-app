-- HIGH: cook_deletion_blockers is SECURITY DEFINER, granted EXECUTE to anon, and had ZERO
-- authorization check -- any unauthenticated caller could read a kitchen's exact lifetime
-- ledger balance, active-order status, subscriber count, and suspension status for any kitchen
-- id (kitchen ids for verified kitchens are public via storefront pages). Fix: require the
-- caller to be the kitchen's owner or an admin; revoke the anon grant.

CREATE OR REPLACE FUNCTION public.cook_deletion_blockers(p_kitchen_id uuid)
 RETURNS TABLE(has_active_orders boolean, balance_cents integer, active_subscribers integer, is_suspended boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from kitchens where id = p_kitchen_id;
  if v_owner is null then
    raise exception 'kitchen not found' using errcode = 'P0002';
  end if;
  if v_owner is distinct from auth.uid() and not public.is_admin() then
    raise exception 'not your kitchen' using errcode = '42501';
  end if;

  return query
  select
    exists (
      select 1 from orders o
      where o.kitchen_id = p_kitchen_id and o.status in ('confirmed','preparing','ready')
    ),
    coalesce((select sum(amount_cents) from ledger_entries where kitchen_id = p_kitchen_id), 0)::int,
    (select count(*)::int from subscriptions s where s.kitchen_id = p_kitchen_id and s.status in ('active','trialing')),
    (select verification_status = 'suspended' from kitchens where id = p_kitchen_id);
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.cook_deletion_blockers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cook_deletion_blockers(uuid) TO authenticated;
