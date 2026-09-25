-- Preserve the cook's cancellation reason in the customer notification while keeping
-- cancellation, refund-state update, and ledger reversal in one locked transaction.
drop function if exists public.finalize_order_cancel(uuid, boolean);

create function public.finalize_order_cancel(p_order_id uuid, p_refunded boolean, p_reason text default null)
returns orders
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  o orders%rowtype;
  v_reversal int;
  v_reason text := nullif(left(trim(p_reason), 240), '');
  v_body text;
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

  v_body := case when p_refunded
    then 'The kitchen couldn''t fulfill this order. Your payment was refunded.'
    else 'The kitchen couldn''t fulfill this order.'
  end;
  if v_reason is not null then v_body := v_body || ' Reason: ' || v_reason; end if;

  perform notify(
    o.customer_id,
    'order',
    case when p_refunded then 'Your order was cancelled - refunded' else 'Your order was cancelled' end,
    v_body
  );
  return o;
end $function$;

revoke execute on function public.finalize_order_cancel(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.finalize_order_cancel(uuid, boolean, text) to service_role;
