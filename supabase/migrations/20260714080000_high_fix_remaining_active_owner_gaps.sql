-- Fixes the remainder of the red-team-confirmed High finding: several Prepper-only RPCs
-- still used bare is_kitchen_owner()/owner_id=auth.uid() with no verification_status check,
-- so a rejected or now-suspended kitchen owner retained capability. The main batch
-- (critical_fix_kitchen_suspend_and_active_owner_check) already fixed kitchen_list_orders,
-- kitchen_order_detail, update_order_status, cook_prep_rollup, cook_subscribers,
-- my_broadcast_audience_count, send_kitchen_broadcast, and the meals/kitchen_capacity RLS
-- policies. This closes the rest found in the same red-team pass: decline_order,
-- advance_order_status, set_kitchen_capacity, prepper_incoming_requests.
--
-- set_kitchen_geo is deliberately left alone -- it only lets an owner set their OWN
-- (possibly not-yet-approved) kitchen's lat/lng, which has no visible effect until the
-- kitchen is separately verified, so there's no real capability to revoke there.

create or replace function public.decline_order(p_order uuid)
returns orders
language plpgsql
security definer
set search_path to 'public'
as $body$
declare
  cur orders;
begin
  select * into cur from orders where id = p_order for update;
  if not found then raise exception 'order not found'; end if;

  if not is_active_kitchen_owner(cur.kitchen_id)
     and current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'only the owning kitchen may decline this order';
  end if;

  if cur.status <> 'confirmed' then
    raise exception 'only a new (confirmed) order can be declined';
  end if;

  update orders set status = 'cancelled' where id = p_order returning * into cur;
  insert into audit_log (actor_id, action, entity, entity_id)
  values (auth.uid(), 'order_declined', 'order', p_order);

  perform notify(cur.customer_id, 'order', 'Your order was declined',
                 'The kitchen couldn''t take this order.');

  return cur;
end $body$;

create or replace function public.advance_order_status(p_order uuid, p_to order_status)
returns orders
language plpgsql
security definer
set search_path to 'public'
as $body$
declare
  cur orders;
  legal boolean;
begin
  select * into cur from orders where id = p_order for update;
  if not found then raise exception 'order not found'; end if;

  if not is_active_kitchen_owner(cur.kitchen_id)
     and current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'only the owning kitchen may advance this order';
  end if;

  legal := case cur.status
    when 'confirmed' then p_to in ('preparing', 'cancelled')
    when 'preparing' then p_to in ('ready', 'cancelled')
    when 'ready'     then p_to in ('completed', 'cancelled')
    else false
  end;
  if not legal then
    raise exception 'illegal order transition % -> %', cur.status, p_to;
  end if;

  update orders set status = p_to where id = p_order returning * into cur;

  perform notify(cur.customer_id, 'order',
    case p_to
      when 'preparing' then 'Your order is being prepared'
      when 'ready'     then 'Your order is ready'
      when 'completed' then 'Order completed'
      when 'cancelled' then 'Your order was cancelled'
      else 'Order update'
    end, null);

  return cur;
end $body$;

create or replace function public.set_kitchen_capacity(p_max integer, p_day text default ''::text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $body$
declare v_kitchen uuid;
begin
  select id into v_kitchen from kitchens where owner_id = auth.uid() and verification_status = 'verified' order by created_at limit 1;
  if v_kitchen is null then raise exception 'no kitchen for caller'; end if;
  if p_max is null then
    delete from kitchen_capacity where kitchen_id = v_kitchen and delivery_day = coalesce(p_day,'');
  else
    if p_max < 0 then raise exception 'capacity must be >= 0'; end if;
    insert into kitchen_capacity(kitchen_id, delivery_day, max_portions_per_day)
      values(v_kitchen, coalesce(p_day,''), p_max)
      on conflict (kitchen_id, delivery_day) do update set max_portions_per_day = excluded.max_portions_per_day, updated_at = now();
  end if;
end $body$;

create or replace function public.prepper_incoming_requests()
returns table(request_id uuid, kitchen_id uuid, category service_category, event_date date, event_time time without time zone, approx_area text, guests integer, budget_cents integer, details text, status service_req_status, my_quote_id uuid, my_quote_status quote_status, my_amount_cents integer, created_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $body$
  select sr.id, t.kitchen_id, sr.category, sr.event_date, sr.event_time,
         sr.approx_area, sr.guests, sr.budget_cents, sr.details, sr.status,
         q.id, q.status, q.amount_cents, sr.created_at
  from public.service_request_targets t
  join public.kitchens k on k.id = t.kitchen_id and k.owner_id = auth.uid() and k.verification_status = 'verified'
  join public.service_requests sr on sr.id = t.request_id
  left join public.quotes q on q.request_id = sr.id and q.kitchen_id = t.kitchen_id
  where sr.status in ('open','quoted')
  order by sr.created_at desc;
$body$;
