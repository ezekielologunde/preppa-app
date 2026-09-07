drop function if exists public.cook_deletion_blockers(uuid);

create function public.cook_deletion_blockers(p_kitchen_id uuid)
returns table(has_active_orders boolean, balance_cents integer, active_subscribers integer, is_suspended boolean)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    exists (
      select 1 from orders o
      where o.kitchen_id = p_kitchen_id and o.status in ('confirmed','preparing','ready')
    ),
    coalesce((select sum(amount_cents) from ledger_entries where kitchen_id = p_kitchen_id), 0)::int,
    (select count(*)::int from subscriptions s where s.kitchen_id = p_kitchen_id and s.status in ('active','trialing')),
    (select verification_status = 'suspended' from kitchens where id = p_kitchen_id);
$function$;

revoke all on function public.cook_deletion_blockers(uuid) from public;
grant execute on function public.cook_deletion_blockers(uuid) to service_role;
