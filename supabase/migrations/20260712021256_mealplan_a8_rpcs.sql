-- Phase A m8: state-mutation RPCs. All SECURITY DEFINER; customer RPCs verify
-- owns_subscription(); capacity RPCs are service-role only.

-- ---- capacity (service-role only) --------------------------------------------
create or replace function reserve_capacity(p_kitchen uuid, p_date date, p_portions int, p_source text, p_source_id uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_cap int; v_used int; v_id uuid; v_day text;
begin
  select id into v_id from capacity_reservations where source = p_source and source_id = p_source_id;
  if v_id is not null then return v_id; end if;                 -- idempotent

  v_day := trim(lower(to_char(p_date, 'day')));
  select max_portions_per_day into v_cap from kitchen_capacity
    where kitchen_id = p_kitchen and delivery_day in (v_day, '')
    order by (delivery_day = v_day) desc limit 1;

  if v_cap is null then                                         -- no cap configured -> unlimited
    insert into capacity_reservations(kitchen_id, delivery_date, source, source_id, portions)
      values (p_kitchen, p_date, p_source, p_source_id, p_portions)
      on conflict (source, source_id) do nothing returning id into v_id;
    return v_id;
  end if;

  perform 1 from kitchen_capacity                              -- serialize concurrent reservations
    where kitchen_id = p_kitchen and delivery_day in (v_day, '')
    order by (delivery_day = v_day) desc limit 1 for update;
  select coalesce(sum(portions),0) into v_used from capacity_reservations
    where kitchen_id = p_kitchen and delivery_date = p_date and not released;
  if v_used + p_portions > v_cap then return null; end if;      -- full

  insert into capacity_reservations(kitchen_id, delivery_date, source, source_id, portions)
    values (p_kitchen, p_date, p_source, p_source_id, p_portions)
    on conflict (source, source_id) do nothing returning id into v_id;
  return v_id;
end $$;

create or replace function release_capacity(p_source text, p_source_id uuid)
returns void language sql security definer set search_path to 'public' as $$
  update capacity_reservations set released = true
   where source = p_source and source_id = p_source_id and not released;
$$;

-- ---- meal selection (customer) -----------------------------------------------
create or replace function select_meals(p_cycle_id uuid, p_items jsonb)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_sub uuid; v_kitchen uuid; rec record;
begin
  select subscription_id, kitchen_id into v_sub, v_kitchen from subscription_cycles where id = p_cycle_id;
  if v_sub is null then raise exception 'cycle not found'; end if;
  if not owns_subscription(v_sub) then raise exception 'not authorized'; end if;
  delete from subscription_cycle_items where cycle_id = p_cycle_id;   -- window enforced by trigger
  for rec in select (e->>'meal_id')::uuid as meal_id, coalesce((e->>'qty')::int,1) as qty
             from jsonb_array_elements(p_items) e loop
    if not exists (select 1 from meals m where m.id = rec.meal_id and m.kitchen_id = v_kitchen) then
      raise exception 'meal % not offered by this kitchen', rec.meal_id;
    end if;
    insert into subscription_cycle_items(cycle_id, meal_id, qty) values (p_cycle_id, rec.meal_id, rec.qty)
      on conflict (cycle_id, meal_id) do update set qty = excluded.qty;
  end loop;
  insert into subscription_events(subscription_id, cycle_id, event, actor)
    values (v_sub, p_cycle_id, 'meals_selected', 'customer');
end $$;

create or replace function swap_meal(p_cycle_id uuid, p_from_meal uuid, p_to_meal uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_sub uuid; v_kitchen uuid; v_qty int;
begin
  select subscription_id, kitchen_id into v_sub, v_kitchen from subscription_cycles where id = p_cycle_id;
  if v_sub is null then raise exception 'cycle not found'; end if;
  if not owns_subscription(v_sub) then raise exception 'not authorized'; end if;
  if not exists (select 1 from meals m where m.id = p_to_meal and m.kitchen_id = v_kitchen) then
    raise exception 'meal % not offered by this kitchen', p_to_meal;
  end if;
  select qty into v_qty from subscription_cycle_items where cycle_id = p_cycle_id and meal_id = p_from_meal;
  if v_qty is null then raise exception 'meal % not in this cycle', p_from_meal; end if;
  delete from subscription_cycle_items where cycle_id = p_cycle_id and meal_id = p_from_meal;
  insert into subscription_cycle_items(cycle_id, meal_id, qty) values (p_cycle_id, p_to_meal, v_qty)
    on conflict (cycle_id, meal_id) do update set qty = subscription_cycle_items.qty + excluded.qty;
  insert into subscription_events(subscription_id, cycle_id, event, actor, meta)
    values (v_sub, p_cycle_id, 'meal_swapped', 'customer', jsonb_build_object('from', p_from_meal, 'to', p_to_meal));
end $$;

-- ---- skip (customer) ---------------------------------------------------------
create or replace function skip_cycle(p_cycle_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_sub uuid; v_status cycle_status; v_deadline timestamptz;
begin
  select subscription_id, status, selection_deadline into v_sub, v_status, v_deadline
    from subscription_cycles where id = p_cycle_id for update;
  if v_sub is null then raise exception 'cycle not found'; end if;
  if not owns_subscription(v_sub) then raise exception 'not authorized'; end if;
  if v_status not in ('scheduled','selection_open') then
    raise exception 'cycle can no longer be skipped (status=%)', v_status;
  end if;
  if now() >= v_deadline then raise exception 'past the skip cutoff'; end if;
  update subscription_cycles
     set status='skipped', skipped=true, payment_status='skipped',
         subtotal_cents=0, service_fee_cents=0, tax_cents=0, total_cents=0, updated_at=now()
   where id = p_cycle_id;
  perform release_capacity('cycle', p_cycle_id);
  insert into subscription_events(subscription_id, cycle_id, event, from_status, to_status, actor)
    values (v_sub, p_cycle_id, 'cycle_skipped', v_status::text, 'skipped', 'customer');
end $$;

-- ---- pause / resume / cancel (customer) --------------------------------------
create or replace function pause_subscription(p_sub_id uuid, p_cycles int default null, p_until date default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_life subscription_status;
begin
  if not owns_subscription(p_sub_id) then raise exception 'not authorized'; end if;
  select lifecycle into v_life from subscriptions where id = p_sub_id for update;
  if v_life <> 'active' then raise exception 'only an active subscription can be paused (lifecycle=%)', v_life; end if;
  update subscriptions
     set lifecycle='paused', paused_cycles_remaining=p_cycles, pause_until=p_until, updated_at=now()
   where id = p_sub_id;
  insert into subscription_events(subscription_id, event, from_status, to_status, actor, meta)
    values (p_sub_id, 'paused', v_life::text, 'paused', 'customer', jsonb_build_object('cycles', p_cycles, 'until', p_until));
end $$;

create or replace function resume_subscription(p_sub_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_life subscription_status;
begin
  if not owns_subscription(p_sub_id) then raise exception 'not authorized'; end if;
  select lifecycle into v_life from subscriptions where id = p_sub_id for update;
  if v_life <> 'paused' then raise exception 'only a paused subscription can be resumed (lifecycle=%)', v_life; end if;
  update subscriptions
     set lifecycle='active', paused_cycles_remaining=null, pause_until=null,
         next_cycle_date = greatest(coalesce(next_cycle_date, current_date), current_date), updated_at=now()
   where id = p_sub_id;
  insert into subscription_events(subscription_id, event, from_status, to_status, actor)
    values (p_sub_id, 'resumed', v_life::text, 'active', 'customer');
end $$;

create or replace function cancel_subscription(p_sub_id uuid, p_immediate boolean default false)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_life subscription_status; v_to subscription_status;
begin
  if not owns_subscription(p_sub_id) then raise exception 'not authorized'; end if;
  select lifecycle into v_life from subscriptions where id = p_sub_id for update;
  if v_life in ('cancelled','completed') then raise exception 'subscription already ended (lifecycle=%)', v_life; end if;
  if p_immediate then
    v_to := 'cancelled';
    update subscriptions set lifecycle='cancelled', cancel_at_cycle_end=true,
        cancellation_scheduled_at=now(), next_cycle_date=null, updated_at=now() where id = p_sub_id;
    -- void un-charged future cycles + release their capacity (charged cycles are honored)
    perform release_capacity('cycle', c.id) from subscription_cycles c
      where c.subscription_id = p_sub_id and c.order_id is null
        and c.status in ('scheduled','selection_open','selection_closed');
    update subscription_cycles set status='skipped', skipped=true, payment_status='skipped',
        subtotal_cents=0, service_fee_cents=0, tax_cents=0, total_cents=0, updated_at=now()
      where subscription_id = p_sub_id and order_id is null
        and status in ('scheduled','selection_open','selection_closed');
  else
    v_to := 'cancellation_scheduled';
    update subscriptions set lifecycle='cancellation_scheduled', cancel_at_cycle_end=true,
        cancellation_scheduled_at=now(), updated_at=now() where id = p_sub_id;
  end if;
  insert into subscription_events(subscription_id, event, from_status, to_status, actor, meta)
    values (p_sub_id, 'cancel_requested', v_life::text, v_to::text, 'customer', jsonb_build_object('immediate', p_immediate));
end $$;

-- ---- preferences (customer) --------------------------------------------------
create or replace function update_preferences(
  p_sub_id uuid, p_dietary text[] default '{}', p_allergies text[] default '{}',
  p_dislikes text[] default '{}', p_serving int default null, p_spice int default null,
  p_preferred_day text default null, p_household int default null, p_notes text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not owns_subscription(p_sub_id) then raise exception 'not authorized'; end if;
  insert into subscription_preferences
    (subscription_id, dietary_tags, allergies, dislikes, serving_size, spice_level, preferred_day, household_size, notes, updated_at)
  values (p_sub_id, p_dietary, p_allergies, p_dislikes, p_serving, p_spice, p_preferred_day, p_household, p_notes, now())
  on conflict (subscription_id) do update set
    dietary_tags=excluded.dietary_tags, allergies=excluded.allergies, dislikes=excluded.dislikes,
    serving_size=excluded.serving_size, spice_level=excluded.spice_level, preferred_day=excluded.preferred_day,
    household_size=excluded.household_size, notes=excluded.notes, updated_at=now();
end $$;

-- ---- grants ------------------------------------------------------------------
grant execute on function owns_subscription(uuid)      to anon, authenticated;
grant execute on function cook_owns_subscription(uuid) to anon, authenticated;

revoke all on function reserve_capacity(uuid,date,int,text,uuid) from public;
revoke all on function release_capacity(text,uuid)              from public;
grant execute on function reserve_capacity(uuid,date,int,text,uuid) to service_role;
grant execute on function release_capacity(text,uuid)              to service_role;

revoke all on function select_meals(uuid,jsonb)                 from public;
revoke all on function swap_meal(uuid,uuid,uuid)                from public;
revoke all on function skip_cycle(uuid)                         from public;
revoke all on function pause_subscription(uuid,int,date)        from public;
revoke all on function resume_subscription(uuid)                from public;
revoke all on function cancel_subscription(uuid,boolean)        from public;
revoke all on function update_preferences(uuid,text[],text[],text[],int,int,text,int,text) from public;
grant execute on function select_meals(uuid,jsonb)                 to authenticated, service_role;
grant execute on function swap_meal(uuid,uuid,uuid)                to authenticated, service_role;
grant execute on function skip_cycle(uuid)                         to authenticated, service_role;
grant execute on function pause_subscription(uuid,int,date)        to authenticated, service_role;
grant execute on function resume_subscription(uuid)               to authenticated, service_role;
grant execute on function cancel_subscription(uuid,boolean)       to authenticated, service_role;
grant execute on function update_preferences(uuid,text[],text[],text[],int,int,text,int,text) to authenticated, service_role;
