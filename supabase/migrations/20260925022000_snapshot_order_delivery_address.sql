-- Delivery orders need an immutable fulfillment address that remains available to the
-- assigned kitchen even if the customer later edits or deletes the saved address.
alter table public.orders
  add column if not exists delivery_address_text text;

drop function if exists public.kitchen_order_detail(uuid);

create function public.kitchen_order_detail(p_order uuid)
returns table(
  order_id uuid,
  buyer_id uuid,
  buyer_name text,
  status text,
  fulfillment text,
  delivery_address_text text,
  method text,
  subtotal_cents integer,
  service_fee_cents integer,
  tip_cents integer,
  total_cents integer,
  created_at timestamptz,
  items jsonb
)
language sql stable security definer set search_path to 'public'
as $body$
  select o.id, o.customer_id, p.display_name, o.status::text, o.fulfillment::text,
    o.delivery_address_text, o.method::text,
    o.subtotal_cents, o.service_fee_cents, o.tip_cents, o.total_cents, o.created_at,
    coalesce((
      select jsonb_agg(jsonb_build_object('name', oi.name_snapshot, 'qty', oi.qty, 'unit_price_cents', oi.unit_price_cents) order by oi.created_at)
      from order_items oi where oi.order_id = o.id
    ), '[]'::jsonb)
  from orders o
  left join profiles p on p.id = o.customer_id
  where public.is_active_kitchen_owner(o.kitchen_id) and o.id = p_order;
$body$;

revoke execute on function public.kitchen_order_detail(uuid) from public, anon;
grant execute on function public.kitchen_order_detail(uuid) to authenticated;
