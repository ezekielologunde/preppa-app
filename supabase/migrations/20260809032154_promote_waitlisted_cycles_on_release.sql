CREATE OR REPLACE FUNCTION public.promote_waitlisted_cycles(p_kitchen uuid, p_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  cy record; s record; pl record; v_portions int; v_res uuid; v_week_idx int;
begin
  -- FIFO: oldest-skipped-first, only plan-backed (non-box) cycles for this kitchen/date.
  for cy in
    select * from subscription_cycles
    where kitchen_id = p_kitchen and delivery_date = p_date and status = 'skipped' and not is_box
    order by created_at asc
  loop
    select * into s from subscriptions where id = cy.subscription_id;
    if s.lifecycle <> 'active' then continue; end if;  -- don't promote a cancelled/paused/suspended sub
    select * into pl from plans where id = s.plan_id;
    v_portions := coalesce(pl.meals_per_delivery,1) * coalesce(pl.servings,1);
    v_res := reserve_capacity(p_kitchen, p_date, v_portions, 'cycle', cy.id);
    if v_res is null then exit; end if;  -- still full -- FIFO order means nobody later fits either

    v_week_idx := 0;
    if coalesce(pl.rotating,false) and coalesce(pl.rotation_weeks,1) > 1 and s.billing_anchor is not null then
      v_week_idx := (((p_date - s.billing_anchor) / (7*coalesce(s.cadence_weeks,1)))::int) % pl.rotation_weeks;
    end if;
    if pl.selection_model = 'fixed' then
      insert into subscription_cycle_items(cycle_id, meal_id, qty, kitchen_id, unit_price_cents)
        select cy.id, pi.meal_id, pi.qty, s.kitchen_id, m.price_cents from plan_items pi join meals m on m.id=pi.meal_id
        where pi.plan_id=pl.id and pi.week_index = v_week_idx
        on conflict (cycle_id, meal_id) do nothing;
      if not exists (select 1 from subscription_cycle_items where cycle_id=cy.id) and v_week_idx <> 0 then
        insert into subscription_cycle_items(cycle_id, meal_id, qty, kitchen_id, unit_price_cents)
          select cy.id, pi.meal_id, pi.qty, s.kitchen_id, m.price_cents from plan_items pi join meals m on m.id=pi.meal_id
          where pi.plan_id=pl.id and pi.week_index = 0
          on conflict (cycle_id, meal_id) do nothing;
      end if;
    end if;

    update subscription_cycles
       set status = 'selection_open', skipped = false, payment_status = 'pending', updated_at = now()
     where id = cy.id;
    insert into subscription_events(subscription_id, cycle_id, event, from_status, to_status, actor, meta)
      values(s.id, cy.id, 'capacity_opened', 'skipped', 'selection_open', 'system', jsonb_build_object('delivery_date', p_date));
    perform notify(s.customer_id, 'capacity_opened',
      'A spot opened up!',
      coalesce(pl.name, 'Your meal plan') || ' has room again for ' || to_char(p_date, 'Mon DD') || ' — you''re back in for this delivery.');
  end loop;
end $function$;

CREATE OR REPLACE FUNCTION public.release_capacity(p_source text, p_source_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_kitchen uuid; v_date date;
begin
  select kitchen_id, delivery_date into v_kitchen, v_date
    from capacity_reservations where source = p_source and source_id = p_source_id and not released limit 1;

  update capacity_reservations set released = true
   where source = p_source and source_id = p_source_id and not released;

  if p_source = 'cycle' and v_kitchen is not null then
    perform promote_waitlisted_cycles(v_kitchen, v_date);
  end if;
end $function$;

revoke execute on function public.promote_waitlisted_cycles(uuid, date) from public, anon, authenticated;
