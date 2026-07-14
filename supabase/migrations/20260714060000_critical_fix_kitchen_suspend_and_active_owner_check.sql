-- Fixes audit Critical #10 (no suspend/deactivate capability for a verified kitchen exists
-- anywhere, despite the Cook Agreement promising Preppa can pause/suspend/remove a kitchen)
-- and the related High finding (rejected/pending prepper applicants retain full
-- ownership-based access to Prepper-only RPCs because is_kitchen_owner() never checks
-- verification_status -- rejection/suspension didn't revoke capability).
--
-- NOT YET APPLIED to the live project -- prepared for review per the commit/PR/CI gate.

alter type verification_status add value if not exists 'suspended';

alter table kitchens add column if not exists suspension_reason text;

-- Active-owner check: like is_kitchen_owner(), but also requires the kitchen to currently
-- be verified (excludes pending/rejected/suspended). Used for capability-bearing writes and
-- prepper-only management RPCs; deliberately NOT used for read-only historical access
-- (ledger/payouts/tickets/messages) so a suspended cook can still see their own past
-- earnings and support history.
create or replace function public.is_active_kitchen_owner(kid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $body$
  select exists (
    select 1 from kitchens k
    where k.id = kid and k.owner_id = auth.uid() and k.verification_status = 'verified'
  );
$body$;

revoke all on function public.is_active_kitchen_owner(uuid) from public;
grant execute on function public.is_active_kitchen_owner(uuid) to authenticated, anon;

-- admin_suspend_kitchen / admin_reinstate_kitchen: the missing capability itself.
create or replace function public.admin_suspend_kitchen(p_kitchen uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $body$
declare
  v_caller_role user_role;
  v_owner uuid;
begin
  select role into v_caller_role from profiles where id = auth.uid();
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role'
     and coalesce(v_caller_role, 'customer') <> 'admin' then
    raise exception 'only an admin may suspend a kitchen';
  end if;
  if length(coalesce(p_reason, '')) < 3 then
    raise exception 'a reason is required';
  end if;

  perform set_config('app.privileged', 'on', true);

  update kitchens
     set verification_status = 'suspended', suspension_reason = p_reason
   where id = p_kitchen and verification_status = 'verified'
   returning owner_id into v_owner;
  if v_owner is null then
    raise exception 'kitchen is not currently verified (already suspended, not approved, or not found)';
  end if;

  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (auth.uid(), 'kitchen_suspended', 'kitchen', p_kitchen, jsonb_build_object('reason', p_reason));

  perform notify(v_owner, 'kitchen', 'Your kitchen has been suspended', p_reason);
end;
$body$;

create or replace function public.admin_reinstate_kitchen(p_kitchen uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $body$
declare
  v_caller_role user_role;
  v_owner uuid;
begin
  select role into v_caller_role from profiles where id = auth.uid();
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role'
     and coalesce(v_caller_role, 'customer') <> 'admin' then
    raise exception 'only an admin may reinstate a kitchen';
  end if;

  perform set_config('app.privileged', 'on', true);

  update kitchens
     set verification_status = 'verified', suspension_reason = null
   where id = p_kitchen and verification_status = 'suspended'
   returning owner_id into v_owner;
  if v_owner is null then
    raise exception 'kitchen is not currently suspended';
  end if;

  insert into audit_log (actor_id, action, entity, entity_id)
  values (auth.uid(), 'kitchen_reinstated', 'kitchen', p_kitchen);

  perform notify(v_owner, 'kitchen', 'Your kitchen has been reinstated',
                 'You''re verified again and can resume taking orders.');
end;
$body$;

revoke all on function public.admin_suspend_kitchen(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_reinstate_kitchen(uuid) from public, anon, authenticated;
grant execute on function public.admin_suspend_kitchen(uuid, text) to authenticated; -- role re-checked inside
grant execute on function public.admin_reinstate_kitchen(uuid) to authenticated;

-- Swap the transactable/management surfaces from is_kitchen_owner -> is_active_kitchen_owner.
-- (Read-only historical policies -- ledger, payouts, tickets, message threads, orders_select_party,
-- stripe_accounts -- are intentionally left as-is; losing verification shouldn't erase your own history.)

drop policy if exists meals_write_own on meals;
create policy meals_write_own on meals for all
  using (is_active_kitchen_owner(kitchen_id))
  with check (is_active_kitchen_owner(kitchen_id));

drop policy if exists capacity_owner_write on kitchen_capacity;
create policy capacity_owner_write on kitchen_capacity for all
  using (is_active_kitchen_owner(kitchen_id))
  with check (is_active_kitchen_owner(kitchen_id));

create or replace function public.kitchen_list_orders()
returns table(order_id uuid, buyer_name text, status text, fulfillment text, total_cents integer, created_at timestamptz, first_item_name text, first_item_qty smallint, item_count bigint)
language sql stable security definer set search_path to 'public'
as $body$
  select o.id, p.display_name, o.status::text, o.fulfillment::text, o.total_cents, o.created_at,
    (select oi.name_snapshot from order_items oi where oi.order_id = o.id order by oi.created_at limit 1),
    (select oi.qty from order_items oi where oi.order_id = o.id order by oi.created_at limit 1),
    (select count(*) from order_items oi where oi.order_id = o.id)
  from orders o
  left join profiles p on p.id = o.customer_id
  where public.is_active_kitchen_owner(o.kitchen_id) and o.status <> 'pending'
  order by o.created_at desc;
$body$;

create or replace function public.kitchen_order_detail(p_order uuid)
returns table(order_id uuid, buyer_name text, status text, fulfillment text, method text, subtotal_cents integer, service_fee_cents integer, tip_cents integer, total_cents integer, created_at timestamptz, items jsonb)
language sql stable security definer set search_path to 'public'
as $body$
  select o.id, p.display_name, o.status::text, o.fulfillment::text, o.method::text,
    o.subtotal_cents, o.service_fee_cents, o.tip_cents, o.total_cents, o.created_at,
    coalesce((
      select jsonb_agg(jsonb_build_object('name', oi.name_snapshot, 'qty', oi.qty, 'unit_price_cents', oi.unit_price_cents) order by oi.created_at)
      from order_items oi where oi.order_id = o.id
    ), '[]'::jsonb)
  from orders o
  left join profiles p on p.id = o.customer_id
  where public.is_active_kitchen_owner(o.kitchen_id) and o.id = p_order;
$body$;

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

create or replace function public.cook_prep_rollup()
returns table(delivery_date date, meal_id uuid, meal_name text, total_portions integer, subscriber_count integer)
language sql security definer set search_path to 'public'
as $body$
  select cy.delivery_date, ci.meal_id, m.name,
         sum(ci.qty * coalesce(m.serves,1))::int as total_portions,
         count(distinct cy.subscription_id)::int as subscriber_count
  from subscription_cycles cy
  join subscription_cycle_items ci on ci.cycle_id = cy.id
  join meals m on m.id = ci.meal_id
  join kitchens k on k.id = ci.kitchen_id
  where k.owner_id = auth.uid() and k.verification_status = 'verified'
    and cy.status in ('selection_closed','charged','order_created')
    and not cy.skipped
    and cy.delivery_date >= current_date - 1
  group by cy.delivery_date, ci.meal_id, m.name
  order by cy.delivery_date, m.name;
$body$;

create or replace function public.cook_subscribers()
returns table(subscription_id uuid, customer_name text, plan_name text, lifecycle text, price_cents integer, preferred_day text, created_at timestamptz)
language sql security definer set search_path to 'public'
as $body$
  select s.id, coalesce(p.display_name,'Customer'), pl.name, s.lifecycle::text, pl.price_cents, s.preferred_day, s.created_at
  from subscriptions s
  join kitchens k on k.id = s.kitchen_id and k.owner_id = auth.uid() and k.verification_status = 'verified'
  join plans pl on pl.id = s.plan_id
  join profiles p on p.id = s.customer_id
  where s.lifecycle not in ('cancelled','completed','draft')
  order by s.created_at desc;
$body$;

create or replace function public.my_broadcast_audience_count()
returns integer
language plpgsql stable security definer set search_path to 'public'
as $body$
declare v_kitchen uuid;
begin
  select id into v_kitchen from kitchens where owner_id = auth.uid() and verification_status = 'verified' order by created_at limit 1;
  if v_kitchen is null then return 0; end if;
  return (select count(*)::int from kitchen_broadcast_audience(v_kitchen));
end $body$;

create or replace function public.send_kitchen_broadcast(p_body text, p_idempotency_key text default null::text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $body$
declare
  v_kitchen uuid; v_sender uuid := auth.uid(); v_bid uuid; v_body text := btrim(p_body);
  v_count int := 0; v_recent int; v_audience int; v_tid uuid; r record; v_existing message_broadcasts;
begin
  if v_sender is null then raise exception 'auth required'; end if;
  if char_length(v_body) < 1 or char_length(v_body) > 2000 then raise exception 'message must be 1 to 2000 characters'; end if;
  select id into v_kitchen from kitchens where owner_id = v_sender and verification_status = 'verified' order by created_at limit 1;
  if v_kitchen is null then raise exception 'no kitchen'; end if;

  if p_idempotency_key is not null then
    select * into v_existing from message_broadcasts where kitchen_id = v_kitchen and idempotency_key = p_idempotency_key;
    if v_existing.id is not null then
      return jsonb_build_object('broadcastId', v_existing.id, 'recipientCount', v_existing.recipient_count, 'deduped', true);
    end if;
  end if;

  select count(*) into v_recent from message_broadcasts where kitchen_id = v_kitchen and created_at > now() - interval '24 hours';
  if v_recent >= 3 then raise exception 'rate_limit: you can send up to 3 broadcasts per day'; end if;

  select count(*) into v_audience from kitchen_broadcast_audience(v_kitchen);
  if v_audience > 5000 then raise exception 'audience too large'; end if;

  insert into message_broadcasts(kitchen_id, sender_id, body, recipient_count, idempotency_key)
    values (v_kitchen, v_sender, v_body, 0, p_idempotency_key) returning id into v_bid;

  for r in select customer_id from kitchen_broadcast_audience(v_kitchen) loop
    insert into message_threads(customer_id, kitchen_id, context_type)
      values (r.customer_id, v_kitchen, 'broadcast') on conflict (customer_id, kitchen_id) do nothing;
    select id into v_tid from message_threads where customer_id = r.customer_id and kitchen_id = v_kitchen;
    if exists (select 1 from message_blocks b where b.thread_id = v_tid and b.active) then continue; end if;
    insert into messages(thread_id, sender_id, sender_role, kind, body, broadcast_id)
      values (v_tid, v_sender, 'kitchen', 'broadcast', v_body, v_bid);
    v_count := v_count + 1;
  end loop;

  update message_broadcasts set recipient_count = v_count where id = v_bid;
  return jsonb_build_object('broadcastId', v_bid, 'recipientCount', v_count);
end $body$;

-- Admin needs the kitchen id to call admin_suspend_kitchen/admin_reinstate_kitchen from the
-- Users screen (it previously only returned kitchen_name, not enough to act on).
create or replace function public.admin_list_users()
returns table(user_id uuid, display_name text, role text, verification_status text, kitchen_id uuid, kitchen_name text, created_at timestamptz)
language sql stable security definer set search_path to 'public'
as $body$
  select p.id, p.display_name, p.role::text, p.verification_status::text,
         (select k.id from kitchens k where k.owner_id = p.id order by k.created_at limit 1),
         (select k.name from kitchens k where k.owner_id = p.id order by k.created_at limit 1),
         p.created_at
  from profiles p
  where public.is_admin()
  order by p.created_at desc;
$body$;
