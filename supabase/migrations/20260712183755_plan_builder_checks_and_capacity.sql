-- Belt-and-suspenders: bad plan config fails even outside the edge fn.
alter table plans
  add constraint plans_choice_needs_permeal check (selection_model <> 'customer_choice' or per_meal_cents is not null) not valid,
  add constraint plans_trial_needs_price   check (coalesce(trial_cycles,0) = 0 or trial_price_cents is not null) not valid;
alter table plans validate constraint plans_choice_needs_permeal;
alter table plans validate constraint plans_trial_needs_price;

-- Capacity is per-KITCHEN (not per-plan): a simple owner-only setter. delivery_day='' = all-days cap.
-- Unit = meal portions/day (matches reserve_capacity, which reserves meals_per_delivery×servings per cycle).
create or replace function set_kitchen_capacity(p_max int, p_day text default '')
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_kitchen uuid;
begin
  select id into v_kitchen from kitchens where owner_id = auth.uid() order by created_at limit 1;
  if v_kitchen is null then raise exception 'no kitchen for caller'; end if;
  if p_max is null then
    delete from kitchen_capacity where kitchen_id = v_kitchen and delivery_day = coalesce(p_day,'');
  else
    if p_max < 0 then raise exception 'capacity must be >= 0'; end if;
    insert into kitchen_capacity(kitchen_id, delivery_day, max_portions_per_day)
      values(v_kitchen, coalesce(p_day,''), p_max)
      on conflict (kitchen_id, delivery_day) do update set max_portions_per_day = excluded.max_portions_per_day, updated_at = now();
  end if;
end $$;
revoke all on function set_kitchen_capacity(int, text) from public, anon;
grant execute on function set_kitchen_capacity(int, text) to authenticated, service_role;
