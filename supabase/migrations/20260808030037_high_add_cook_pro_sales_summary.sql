-- Preppa Pro benefit #2: a real sales-insights summary, gated to members only (raises for
-- non-members rather than silently returning empty -- this is a genuine paid perk, not a UI-
-- only gate the client could bypass). Kept intentionally modest in scope (last 30 days,
-- revenue/orders/top meals) rather than a full BI build.
create or replace function public.cook_pro_sales_summary(p_kitchen_id uuid)
returns table(
  revenue_cents bigint,
  order_count bigint,
  avg_order_cents numeric,
  top_meal_name text,
  top_meal_qty bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not is_kitchen_owner(p_kitchen_id) then
    raise exception 'only the kitchen owner may view this';
  end if;
  if not is_cook_pro_member(p_kitchen_id) then
    raise exception 'Preppa Pro required' using errcode = 'P0003';
  end if;

  return query
  with recent as (
    select o.id, o.total_cents, o.created_at
    from orders o
    where o.kitchen_id = p_kitchen_id and o.pay_status = 'paid' and o.created_at > now() - interval '30 days'
  ),
  items as (
    select oi.name_snapshot, sum(oi.qty)::bigint as qty
    from order_items oi
    where oi.kitchen_id = p_kitchen_id
      and oi.order_id in (select id from recent)
    group by oi.name_snapshot
    order by qty desc
    limit 1
  )
  select
    coalesce((select sum(total_cents) from recent), 0)::bigint,
    coalesce((select count(*) from recent), 0)::bigint,
    coalesce((select avg(total_cents) from recent), 0)::numeric,
    (select name_snapshot from items),
    (select qty from items);
end;
$function$;

revoke all on function public.cook_pro_sales_summary(uuid) from public;
grant execute on function public.cook_pro_sales_summary(uuid) to authenticated;
