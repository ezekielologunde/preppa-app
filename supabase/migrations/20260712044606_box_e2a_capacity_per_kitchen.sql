-- A box reserves capacity at N kitchens for ONE cycle, so reservations must be unique per
-- (kitchen, source, source_id), not just (source, source_id). Single-kitchen cycles are
-- unaffected (one kitchen per cycle). reserve_capacity becomes idempotent per-kitchen.
alter table capacity_reservations drop constraint if exists capacity_reservations_source_source_id_key;
create unique index if not exists ux_capacity_res_kitchen_source
  on capacity_reservations(kitchen_id, source, source_id);

create or replace function reserve_capacity(p_kitchen uuid, p_date date, p_portions int, p_source text, p_source_id uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_cap int; v_used int; v_id uuid; v_day text;
begin
  select id into v_id from capacity_reservations
    where kitchen_id = p_kitchen and source = p_source and source_id = p_source_id;
  if v_id is not null then return v_id; end if;                 -- idempotent per kitchen

  v_day := trim(lower(to_char(p_date, 'day')));
  select max_portions_per_day into v_cap from kitchen_capacity
    where kitchen_id = p_kitchen and delivery_day in (v_day, '')
    order by (delivery_day = v_day) desc limit 1;

  if v_cap is null then
    insert into capacity_reservations(kitchen_id, delivery_date, source, source_id, portions)
      values (p_kitchen, p_date, p_source, p_source_id, p_portions)
      on conflict (kitchen_id, source, source_id) do nothing returning id into v_id;
    return v_id;
  end if;

  perform 1 from kitchen_capacity
    where kitchen_id = p_kitchen and delivery_day in (v_day, '')
    order by (delivery_day = v_day) desc limit 1 for update;
  select coalesce(sum(portions),0) into v_used from capacity_reservations
    where kitchen_id = p_kitchen and delivery_date = p_date and not released;
  if v_used + p_portions > v_cap then return null; end if;      -- full

  insert into capacity_reservations(kitchen_id, delivery_date, source, source_id, portions)
    values (p_kitchen, p_date, p_source, p_source_id, p_portions)
    on conflict (kitchen_id, source, source_id) do nothing returning id into v_id;
  return v_id;
end $$;
