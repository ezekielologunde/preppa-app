-- Real data for /hub/analytics, which today renders ANALYTICS/MY_PLANS -- static empty
-- constants in src/data/cook.ts -- so every cook sees a permanently blank dashboard
-- regardless of actual sales. Wires the trackable half (everything derivable from
-- orders/order_items) to real numbers. Deliberately does NOT include profile views or
-- view->order conversion -- nothing in this schema tracks page views, so faking those
-- would be worse than the current blank state; that needs real instrumentation as a
-- separate, later feature.
--
-- Available to ALL cooks (not Pro-gated) -- this is the baseline free dashboard, distinct
-- from cook_pro_sales_summary's more curated Pro-exclusive 30-day snapshot.
create or replace function public.cook_analytics_summary(p_kitchen_id uuid)
returns table(
  weekly_revenue_cents integer[],
  orders_this_month bigint,
  avg_order_cents numeric,
  repeat_customer_pct numeric,
  new_customers_30d bigint,
  top_meals jsonb
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

  return query
  with weeks as (
    select generate_series(0, 7) as w
  ),
  week_bounds as (
    select w,
      date_trunc('week', now()) - ((7 - w) * interval '7 days') as start_at,
      date_trunc('week', now()) - ((6 - w) * interval '7 days') as end_at
    from weeks
  ),
  weekly as (
    select wb.w, coalesce(sum(o.total_cents), 0)::int as cents
    from week_bounds wb
    left join orders o on o.kitchen_id = p_kitchen_id and o.pay_status = 'paid'
      and o.created_at >= wb.start_at and o.created_at < wb.end_at
    group by wb.w
    order by wb.w
  ),
  month_orders as (
    select o.id, o.total_cents, o.customer_id
    from orders o
    where o.kitchen_id = p_kitchen_id and o.pay_status = 'paid'
      and o.created_at > now() - interval '30 days'
  ),
  all_customers as (
    select o.customer_id, count(*) as n, min(o.created_at) as first_order
    from orders o
    where o.kitchen_id = p_kitchen_id and o.pay_status = 'paid'
    group by o.customer_id
  ),
  top as (
    select oi.name_snapshot, sum(oi.qty)::bigint as qty
    from order_items oi
    join orders o on o.id = oi.order_id
    where oi.kitchen_id = p_kitchen_id and o.pay_status = 'paid'
      and o.created_at > now() - interval '90 days'
    group by oi.name_snapshot
    order by qty desc
    limit 5
  ),
  top_with_pct as (
    select name_snapshot, qty,
      case when max(qty) over () = 0 then 0 else round(100.0 * qty / max(qty) over ())::int end as pct
    from top
  )
  select
    (select array_agg(cents order by w) from weekly),
    (select count(*) from month_orders)::bigint,
    coalesce((select avg(total_cents) from month_orders), 0)::numeric,
    coalesce((select round(100.0 * count(*) filter (where n > 1) / nullif(count(*), 0), 1) from all_customers), 0)::numeric,
    coalesce((select count(*) from all_customers where first_order > now() - interval '30 days'), 0)::bigint,
    coalesce((select jsonb_agg(jsonb_build_object('name', name_snapshot, 'sold', qty, 'pct', pct)) from top_with_pct), '[]'::jsonb);
end;
$function$;

revoke all on function public.cook_analytics_summary(uuid) from public;
grant execute on function public.cook_analytics_summary(uuid) to authenticated;
