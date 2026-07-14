-- Fixes audit Critical #7: there was no update_meal/pause_meal/archive_meal capability
-- anywhere (app or DB) -- a published meal could never be edited, paused, marked
-- sold-out, or removed by its prepper. create_meal, select_meals, and swap_meal were the
-- only meal-mutating functions in the whole project.
--
-- NOT YET APPLIED to the live project -- prepared for review per the commit/PR/CI gate.

alter type meal_status add value if not exists 'archived';

create or replace function public.update_meal(
  p_meal_id uuid, p_name text, p_description text default null::text,
  p_price_cents integer default null::integer, p_serves integer default null::integer,
  p_tags text[] default null::text[], p_grad text default null::text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $body$
declare
  v_kitchen uuid;
  v_status meal_status;
begin
  select kitchen_id, status into v_kitchen, v_status from meals where id = p_meal_id;
  if v_kitchen is null then raise exception 'meal not found'; end if;
  if not public.is_active_kitchen_owner(v_kitchen) then raise exception 'not your meal'; end if;
  if v_status = 'archived' then raise exception 'this dish is archived — unarchive it first'; end if;
  if length(coalesce(p_name, '')) < 2 then raise exception 'dish name is too short'; end if;
  if p_price_cents is not null and p_price_cents <= 0 then raise exception 'price must be greater than zero'; end if;

  update meals set
    name = p_name,
    description = nullif(p_description, ''),
    price_cents = coalesce(p_price_cents, price_cents),
    serves = greatest(1, coalesce(p_serves, serves)),
    tags = coalesce(p_tags, tags),
    grad = coalesce(nullif(p_grad, ''), grad)
  where id = p_meal_id;

  insert into audit_log (actor_id, action, entity, entity_id)
  values (auth.uid(), 'meal_updated', 'meal', p_meal_id);
end;
$body$;

-- One RPC for every status transition a prepper can make themselves (going live is
-- re-gated by kitchen_payouts_enabled, mirroring create_meal's own gate).
create or replace function public.set_meal_status(p_meal_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $body$
declare
  v_kitchen uuid;
  v_current meal_status;
  v_next meal_status;
begin
  select kitchen_id, status into v_kitchen, v_current from meals where id = p_meal_id;
  if v_kitchen is null then raise exception 'meal not found'; end if;
  if not public.is_active_kitchen_owner(v_kitchen) then raise exception 'not your meal'; end if;

  v_next := p_status::meal_status;
  if v_next = 'live' and not public.kitchen_payouts_enabled(v_kitchen) then
    raise exception 'Finish payout setup before making a dish live.';
  end if;
  if v_next not in ('live', 'paused', 'sold_out', 'archived') then
    raise exception 'invalid status';
  end if;

  update meals set status = v_next where id = p_meal_id;

  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (auth.uid(), 'meal_status_changed', 'meal', p_meal_id, jsonb_build_object('from', v_current, 'to', v_next));
end;
$body$;

revoke all on function public.update_meal(uuid, text, text, integer, integer, text[], text) from public, anon;
revoke all on function public.set_meal_status(uuid, text) from public, anon;
grant execute on function public.update_meal(uuid, text, text, integer, integer, text[], text) to authenticated;
grant execute on function public.set_meal_status(uuid, text) to authenticated;

-- The signed-in prepper's own meals for the "My menu" screen (real query to replace the
-- permanently-empty MY_MEALS mock fixture the client was reading instead).
create or replace function public.my_meals()
returns table(
  id uuid, name text, description text, price_cents integer, serves integer,
  tags text[], grad text, slug text, status text, created_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $body$
  select m.id, m.name, m.description, m.price_cents, m.serves, m.tags, m.grad, m.slug, m.status::text, m.created_at
  from meals m
  join kitchens k on k.id = m.kitchen_id
  where k.owner_id = auth.uid()
  order by m.created_at desc;
$body$;

revoke all on function public.my_meals() from public, anon;
grant execute on function public.my_meals() to authenticated;

-- Fixes audit Critical #8: the My Hub dashboard's headline stat tiles ("Earnings today",
-- "Orders") and "Needs your attention" queue always read as $0/empty/"All caught up"
-- regardless of real activity, because they were driven by permanently-empty mock
-- fixtures (src/data/cook.ts: ORDERS/CATER_INCOMING/MY_BIDS/BALANCE) rather than real
-- ledger/order data. This is the one real query the dashboard needs.
create or replace function public.kitchen_dashboard_summary()
returns table(
  available_cents integer, today_cents integer, today_orders integer,
  week_cents integer, pending_orders integer
)
language plpgsql
stable
security definer
set search_path to 'public'
as $body$
declare
  v_kitchen uuid;
begin
  select id into v_kitchen from kitchens where owner_id = auth.uid() order by created_at desc limit 1;
  if v_kitchen is null then
    available_cents := 0; today_cents := 0; today_orders := 0; week_cents := 0; pending_orders := 0;
    return next;
    return;
  end if;

  select coalesce(sum(amount_cents), 0)::int into available_cents from ledger_entries where kitchen_id = v_kitchen;
  select coalesce(sum(amount_cents), 0)::int into today_cents from ledger_entries
    where kitchen_id = v_kitchen and amount_cents > 0 and created_at >= date_trunc('day', now());
  select coalesce(sum(amount_cents), 0)::int into week_cents from ledger_entries
    where kitchen_id = v_kitchen and amount_cents > 0 and created_at >= now() - interval '7 days';
  select count(*)::int into today_orders from orders
    where kitchen_id = v_kitchen and status <> 'cancelled' and created_at >= date_trunc('day', now());
  select count(*)::int into pending_orders from orders
    where kitchen_id = v_kitchen and status = 'confirmed';

  return next;
end;
$body$;

revoke all on function public.kitchen_dashboard_summary() from public, anon;
grant execute on function public.kitchen_dashboard_summary() to authenticated;
