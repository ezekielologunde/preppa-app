
-- Internal helper: write a real notification. SECURITY DEFINER + exception-safe so a
-- notification failure can never break the triggering action. Not client-callable.
create or replace function public.notify(p_user uuid, p_kind text, p_title text, p_body text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if p_user is null then return; end if;
  insert into notifications (user_id, kind, title, body) values (p_user, p_kind, p_title, p_body);
exception when others then
  null; -- never let a notification failure break the caller
end $$;
revoke execute on function public.notify(uuid,text,text,text) from public, anon, authenticated;

-- approve_kitchen: notify the owner they're verified
create or replace function public.approve_kitchen(p_kitchen uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_owner uuid;
  v_caller_role user_role;
begin
  select role into v_caller_role from profiles where id = auth.uid();
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role'
     and coalesce(v_caller_role, 'customer') <> 'admin' then
    raise exception 'only an admin may approve a kitchen';
  end if;

  perform set_config('app.privileged', 'on', true);

  update kitchens
     set verification_status = 'verified', approved_at = now()
   where id = p_kitchen and verification_status = 'pending'
   returning owner_id into v_owner;
  if v_owner is null then
    raise exception 'kitchen is not pending review (already decided or not found)';
  end if;

  update profiles set role = 'prepper', verification_status = 'verified' where id = v_owner;

  update verifications
     set status = 'verified', reviewed_by = auth.uid(), reviewed_at = now()
   where subject_id = v_owner and kind = 'kitchen' and status = 'pending';

  insert into audit_log (actor_id, action, entity, entity_id)
  values (auth.uid(), 'kitchen_approved', 'kitchen', p_kitchen);

  perform notify(v_owner, 'kitchen', 'Kitchen approved 🎉',
                 'Your kitchen is verified — you can start listing meals in My Hub.');
end $function$;

-- reject_kitchen: notify the owner with the reason
create or replace function public.reject_kitchen(p_kitchen uuid, p_reason text)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_owner uuid;
  v_caller_role user_role;
begin
  select role into v_caller_role from profiles where id = auth.uid();
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role'
     and coalesce(v_caller_role, 'customer') <> 'admin' then
    raise exception 'only an admin may reject a kitchen';
  end if;

  if coalesce(length(btrim(p_reason)), 0) < 3 then
    raise exception 'a rejection reason is required';
  end if;

  perform set_config('app.privileged', 'on', true);

  update kitchens
     set verification_status = 'rejected', rejection_reason = p_reason
   where id = p_kitchen and verification_status = 'pending'
   returning owner_id into v_owner;
  if v_owner is null then
    raise exception 'kitchen is not pending review (already decided or not found)';
  end if;

  update verifications
     set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
   where subject_id = v_owner and kind = 'kitchen' and status = 'pending';

  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (auth.uid(), 'kitchen_rejected', 'kitchen', p_kitchen, jsonb_build_object('reason', p_reason));

  perform notify(v_owner, 'kitchen', 'Application needs changes', p_reason);
end $function$;

-- advance_order_status: notify the buyer of the new status
create or replace function public.advance_order_status(p_order uuid, p_to order_status)
 returns orders language plpgsql security definer set search_path to 'public'
as $function$
declare
  cur orders;
  legal boolean;
begin
  select * into cur from orders where id = p_order for update;
  if not found then raise exception 'order not found'; end if;

  if not is_kitchen_owner(cur.kitchen_id)
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
end $function$;

-- decline_order: notify the buyer
create or replace function public.decline_order(p_order uuid)
 returns orders language plpgsql security definer set search_path to 'public'
as $function$
declare
  cur orders;
begin
  select * into cur from orders where id = p_order for update;
  if not found then raise exception 'order not found'; end if;

  if not is_kitchen_owner(cur.kitchen_id)
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
end $function$;
