
-- Kitchen-owner-scoped order list/detail reads (mirrors admin_list_orders/admin_order_detail pattern)
create or replace function public.kitchen_list_orders()
returns table(
  order_id uuid, buyer_name text, status text, fulfillment text,
  total_cents integer, created_at timestamptz,
  first_item_name text, first_item_qty smallint, item_count bigint
)
language sql
stable security definer
set search_path to 'public'
as $function$
  select o.id, p.display_name, o.status::text, o.fulfillment::text, o.total_cents, o.created_at,
    (select oi.name_snapshot from order_items oi where oi.order_id = o.id order by oi.created_at limit 1),
    (select oi.qty from order_items oi where oi.order_id = o.id order by oi.created_at limit 1),
    (select count(*) from order_items oi where oi.order_id = o.id)
  from orders o
  left join profiles p on p.id = o.customer_id
  where public.is_kitchen_owner(o.kitchen_id) and o.status <> 'pending'
  order by o.created_at desc;
$function$;

create or replace function public.kitchen_order_detail(p_order uuid)
returns table(
  order_id uuid, buyer_name text, status text, fulfillment text, method text,
  subtotal_cents integer, service_fee_cents integer, tip_cents integer, total_cents integer,
  created_at timestamptz, items jsonb
)
language sql
stable security definer
set search_path to 'public'
as $function$
  select o.id, p.display_name, o.status::text, o.fulfillment::text, o.method::text,
    o.subtotal_cents, o.service_fee_cents, o.tip_cents, o.total_cents, o.created_at,
    coalesce((
      select jsonb_agg(jsonb_build_object('name', oi.name_snapshot, 'qty', oi.qty, 'unit_price_cents', oi.unit_price_cents) order by oi.created_at)
      from order_items oi where oi.order_id = o.id
    ), '[]'::jsonb)
  from orders o
  left join profiles p on p.id = o.customer_id
  where public.is_kitchen_owner(o.kitchen_id) and o.id = p_order;
$function$;

-- Cook-driven fulfillment status transitions: single RPC, forward-only, notifies the customer server-side
create or replace function public.update_order_status(p_order uuid, p_status text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  o public.orders%rowtype;
  v_next public.order_status;
  v_allowed boolean := false;
begin
  if auth.uid() is null then
    raise exception 'auth required';
  end if;

  select * into o from public.orders where id = p_order;
  if not found then
    raise exception 'order not found';
  end if;
  if not public.is_kitchen_owner(o.kitchen_id) then
    raise exception 'only the kitchen owner may update this order';
  end if;

  v_next := p_status::public.order_status;

  v_allowed := (o.status = 'confirmed' and v_next = 'preparing')
            or (o.status = 'preparing' and v_next = 'ready')
            or (o.status = 'ready' and v_next = 'completed');
  if not v_allowed then
    raise exception 'invalid status transition from % to %', o.status, v_next;
  end if;

  update public.orders set status = v_next, updated_at = now() where id = p_order;

  perform public.notify(
    o.customer_id,
    'order',
    case v_next
      when 'preparing' then 'Your order is being prepared'
      when 'ready' then case when o.fulfillment = 'pickup' then 'Your order is ready for pickup' else 'Your order is out for delivery' end
      when 'completed' then 'Your order is complete'
      else 'Order update'
    end,
    null
  );
end
$function$;
