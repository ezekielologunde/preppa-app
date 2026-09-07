CREATE OR REPLACE FUNCTION public.finalize_order_cancel(p_order_id uuid, p_refunded boolean)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  o orders%rowtype;
  v_reversal int;
begin
  perform pg_advisory_xact_lock(hashtext('cancel_order:' || p_order_id::text));
  select * into o from orders where id = p_order_id for update;
  if o.id is null then raise exception 'order not found'; end if;
  if o.status = 'cancelled' then return o; end if;

  if p_refunded then
    v_reversal := coalesce(o.subtotal_cents, 0) + coalesce(o.tip_cents, 0);
    if v_reversal > 0 then
      insert into ledger_entries (kitchen_id, order_id, kind, amount_cents, memo)
        values (o.kitchen_id, p_order_id, 'refund', -v_reversal, 'Order refund ' || left(p_order_id::text, 8));
    end if;
    update orders set status = 'cancelled', pay_status = 'refunded', updated_at = now() where id = p_order_id returning * into o;
  else
    update orders set status = 'cancelled', updated_at = now() where id = p_order_id returning * into o;
  end if;

  insert into audit_log (actor_id, action, entity, entity_id)
    values (auth.uid(), 'order_cancelled', 'order', p_order_id);

  if p_refunded then
    perform notify(o.customer_id, 'order', 'Your order was cancelled — refunded', 'The kitchen couldn''t fulfill this order. Your payment was refunded.');
  else
    perform notify(o.customer_id, 'order', 'Your order was cancelled', 'The kitchen couldn''t fulfill this order.');
  end if;

  return o;
end $function$;

revoke execute on function public.finalize_order_cancel(uuid, boolean) from public, anon, authenticated;
grant execute on function public.finalize_order_cancel(uuid, boolean) to service_role;
