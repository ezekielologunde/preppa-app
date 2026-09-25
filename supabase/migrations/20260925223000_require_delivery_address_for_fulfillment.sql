-- A delivery order must have an address before a kitchen starts fulfillment.
-- The client also blocks this state, but the RPC remains the authority.
create or replace function public.update_order_status(p_order uuid, p_status text)
returns void
language plpgsql security definer set search_path to 'public'
as $body$
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
  if not public.is_active_kitchen_owner(o.kitchen_id) then
    raise exception 'only the kitchen owner may update this order';
  end if;
  if o.pay_status <> 'paid' then
    raise exception 'payment must be confirmed before fulfillment';
  end if;
  if o.fulfillment = 'delivery' and nullif(btrim(o.delivery_address_text), '') is null then
    raise exception 'delivery address is required before fulfillment';
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
$body$;
