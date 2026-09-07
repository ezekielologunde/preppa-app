-- The window guard must let the SYSTEM (cron running advance_cycles as postgres, no JWT)
-- pre-fill/close cycles, while still enforcing the window for customer RPCs. Use an
-- explicit GUC that only advance_cycles sets — customer RPCs never set it, so their
-- edits remain window-checked. service_role (edge/PostgREST) also bypasses as before.
create or replace function enforce_selection_window()
returns trigger language plpgsql set search_path to 'public' as $$
declare c subscription_cycles;
begin
  if current_setting('app.system_write', true) = 'on'
     or coalesce(auth.role(), '') = 'service_role' then
    return coalesce(NEW, OLD);
  end if;
  select * into c from subscription_cycles where id = coalesce(NEW.cycle_id, OLD.cycle_id);
  if c.status is null then raise exception 'cycle not found'; end if;
  if c.status <> 'selection_open' then
    raise exception 'cycle % is not open for selection (status=%)', c.id, c.status;
  end if;
  if now() >= c.selection_deadline then
    raise exception 'selection deadline has passed for cycle %', c.id;
  end if;
  return coalesce(NEW, OLD);
end $$;

-- advance_cycles marks itself a system writer (txn-local) so its own item inserts pass the guard.
create or replace function advance_cycles()
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  s record; pl record; c record;
  v_delivery date; v_deadline timestamptz; v_cycle uuid; v_res uuid; v_portions int;
  v_subtotal int; v_fee int; v_tax int; v_total int;
begin
  perform set_config('app.system_write', 'on', true);

  update subscription_cycles
     set payment_status='pending', updated_at=now()
   where payment_status='charging' and stripe_payment_intent_id is null
     and updated_at < now() - interval '15 minutes';

  update subscriptions
     set lifecycle='active', paused_cycles_remaining=null, pause_until=null,
         next_cycle_date=greatest(coalesce(next_cycle_date,current_date),current_date), updated_at=now()
   where lifecycle='paused' and pause_until is not null and pause_until <= current_date;

  for s in
    select sub.* from subscriptions sub
    where sub.lifecycle='active' and sub.next_cycle_date is not null
      and sub.next_cycle_date <= current_date + 10
      and not exists (
        select 1 from subscription_cycles c2
        where c2.subscription_id=sub.id
          and c2.status in ('scheduled','selection_open','selection_closed','charged'))
  loop
    select * into pl from plans where id=s.plan_id;
    v_delivery := s.next_cycle_date;
    v_deadline := (v_delivery::timestamp - make_interval(hours => coalesce(pl.cutoff_hours,48)));
    insert into subscription_cycles(subscription_id,kitchen_id,cycle_start,cycle_end,delivery_date,
        billing_date,selection_deadline,status)
      values(s.id, s.kitchen_id, v_delivery, v_delivery + (7*coalesce(s.cadence_weeks,1) - 1),
             v_delivery, v_deadline::date, v_deadline, 'selection_open')
      on conflict (subscription_id, cycle_start) do nothing
      returning id into v_cycle;
    if v_cycle is null then continue; end if;

    v_portions := coalesce(pl.meals_per_delivery,1) * coalesce(pl.servings,1);
    v_res := reserve_capacity(s.kitchen_id, v_delivery, v_portions, 'cycle', v_cycle);
    if v_res is null then
      update subscription_cycles set status='skipped', skipped=true, payment_status='skipped',
             total_cents=0, updated_at=now() where id=v_cycle;
      insert into subscription_events(subscription_id,cycle_id,event,to_status,actor,meta)
        values(s.id, v_cycle, 'capacity_full', 'skipped', 'system',
               jsonb_build_object('delivery_date', v_delivery, 'portions', v_portions));
    else
      if pl.selection_model='fixed' then
        insert into subscription_cycle_items(cycle_id, meal_id, qty)
          select v_cycle, pi.meal_id, pi.qty from plan_items pi where pi.plan_id=pl.id
          on conflict (cycle_id, meal_id) do nothing;
      end if;
      insert into subscription_events(subscription_id,cycle_id,event,to_status,actor)
        values(s.id, v_cycle, 'cycle_opened', 'selection_open', 'cron');
    end if;

    update subscriptions set next_cycle_date = v_delivery + (7*coalesce(s.cadence_weeks,1)),
           updated_at=now() where id=s.id;
  end loop;

  for c in
    select cy.* from subscription_cycles cy
    where cy.status='selection_open' and now() >= cy.selection_deadline and not cy.skipped
  loop
    select * into s  from subscriptions where id=c.subscription_id;
    select * into pl from plans where id=s.plan_id;
    if not exists (select 1 from subscription_cycle_items where cycle_id=c.id) then
      insert into subscription_cycle_items(cycle_id, meal_id, qty)
        select c.id, pi.meal_id, pi.qty from plan_items pi where pi.plan_id=pl.id
        on conflict (cycle_id, meal_id) do nothing;
    end if;
    select coalesce(sum(m.price_cents * ci.qty),0) into v_subtotal
      from subscription_cycle_items ci join meals m on m.id=ci.meal_id where ci.cycle_id=c.id;

    if coalesce(s.trial_cycles_remaining,0) > 0 and pl.trial_price_cents is not null then
      v_subtotal := pl.trial_price_cents; v_fee := 0; v_tax := 0; v_total := pl.trial_price_cents;
      update subscriptions set trial_cycles_remaining = trial_cycles_remaining - 1 where id=s.id;
    else
      v_subtotal := v_subtotal + coalesce(pl.per_delivery_cents,0);
      v_fee := round(v_subtotal * coalesce(pl.service_fee_bps,1000) / 10000.0)::int;
      v_tax := round(v_subtotal * coalesce(pl.tax_bps,0) / 10000.0)::int;
      v_total := v_subtotal + v_fee + v_tax;
    end if;

    update subscription_cycles
       set subtotal_cents=v_subtotal, service_fee_cents=v_fee, tax_cents=v_tax, total_cents=v_total,
           status='selection_closed', updated_at=now()
     where id=c.id;
    insert into subscription_events(subscription_id,cycle_id,event,from_status,to_status,actor,meta)
      values(s.id, c.id, 'selection_closed', 'selection_open', 'selection_closed', 'cron',
             jsonb_build_object('total_cents', v_total));
  end loop;

  update subscriptions sub set lifecycle='cancelled', updated_at=now()
   where sub.lifecycle='cancellation_scheduled'
     and not exists (select 1 from subscription_cycles c3 where c3.subscription_id=sub.id
                     and c3.status in ('scheduled','selection_open','selection_closed','charged'));
end $$;
