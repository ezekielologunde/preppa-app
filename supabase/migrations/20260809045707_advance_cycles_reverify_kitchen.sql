CREATE OR REPLACE FUNCTION public.advance_cycles()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s record; pl record; c record;
  v_delivery date; v_deadline timestamptz; v_cycle uuid; v_res uuid; v_portions int;
  v_subtotal int; v_fee int; v_tax int; v_total int; v_qty int; v_disc int; v_k uuid;
  v_member boolean; v_week_idx int; v_verified boolean;
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

  -- (2) materialize next cycle
  for s in
    select sub.* from subscriptions sub
    where sub.lifecycle='active' and sub.next_cycle_date is not null
      and sub.next_cycle_date <= current_date + 10
      and not exists (select 1 from subscription_cycles c2 where c2.subscription_id=sub.id
                      and c2.status in ('scheduled','selection_open','selection_closed','charged'))
  loop
    v_delivery := s.next_cycle_date;

    if s.kind = 'box' then
      v_deadline := (v_delivery::timestamp - make_interval(hours => 48));
      insert into subscription_cycles(subscription_id, kitchen_id, cycle_start, cycle_end, delivery_date,
          billing_date, selection_deadline, status, is_box)
        values(s.id, null, v_delivery, v_delivery + (7*coalesce(s.cadence_weeks,1) - 1),
               v_delivery, v_deadline::date, v_deadline, 'selection_open', true)
        on conflict (subscription_id, cycle_start) do nothing returning id into v_cycle;
      if v_cycle is null then continue; end if;
      -- snapshot the standing box selection onto the cycle (fresh kitchen_id + price from meals)
      insert into subscription_cycle_items(cycle_id, meal_id, qty, kitchen_id, unit_price_cents)
        select v_cycle, bi.meal_id, bi.qty, m.kitchen_id, m.price_cents
        from subscription_box_items bi join meals m on m.id=bi.meal_id
        where bi.subscription_id = s.id
        on conflict (cycle_id, meal_id) do nothing;
      -- reserve capacity per kitchen; drop any full OR no-longer-verified kitchen's items
      -- (drop-and-reprice) -- a kitchen can be suspended after a customer subscribed, and the
      -- box loop previously kept billing/crediting it every cycle with no re-check.
      for v_k in select distinct kitchen_id from subscription_cycle_items where cycle_id=v_cycle loop
        select coalesce(sum(qty),0) into v_portions from subscription_cycle_items where cycle_id=v_cycle and kitchen_id=v_k;
        select (verification_status = 'verified') into v_verified from kitchens where id = v_k;
        if not coalesce(v_verified, false) then
          delete from subscription_cycle_items where cycle_id=v_cycle and kitchen_id=v_k;
          insert into subscription_events(subscription_id, cycle_id, event, actor, meta)
            values(s.id, v_cycle, 'box_kitchen_unverified', 'system', jsonb_build_object('kitchen_id', v_k, 'delivery_date', v_delivery));
        elsif reserve_capacity(v_k, v_delivery, v_portions, 'cycle', v_cycle) is null then
          delete from subscription_cycle_items where cycle_id=v_cycle and kitchen_id=v_k;
          insert into subscription_events(subscription_id, cycle_id, event, actor, meta)
            values(s.id, v_cycle, 'box_kitchen_full', 'system', jsonb_build_object('kitchen_id', v_k, 'delivery_date', v_delivery));
          perform notify(s.customer_id, 'box_kitchen_full',
            'A cook in your box is full',
            'One kitchen in your weekly box reached capacity for ' || to_char(v_delivery, 'Mon DD') || ' — its items were dropped from that delivery and your total was adjusted.');
        end if;
      end loop;
      insert into subscription_events(subscription_id, cycle_id, event, to_status, actor)
        values(s.id, v_cycle, 'cycle_opened', 'selection_open', 'cron');
      update subscriptions set next_cycle_date = v_delivery + (7*coalesce(s.cadence_weeks,1)), updated_at=now() where id=s.id;
      continue;
    end if;

    -- non-box (plan-backed) path
    select * into pl from plans where id=s.plan_id;
    v_deadline := (v_delivery::timestamp - make_interval(hours => coalesce(pl.cutoff_hours,48)));
    insert into subscription_cycles(subscription_id,kitchen_id,cycle_start,cycle_end,delivery_date,
        billing_date,selection_deadline,status)
      values(s.id, s.kitchen_id, v_delivery, v_delivery + (7*coalesce(s.cadence_weeks,1) - 1),
             v_delivery, v_deadline::date, v_deadline, 'selection_open')
      on conflict (subscription_id, cycle_start) do nothing returning id into v_cycle;
    if v_cycle is null then continue; end if;

    select (verification_status = 'verified') into v_verified from kitchens where id = s.kitchen_id;
    if not coalesce(v_verified, false) then
      -- Kitchen was suspended/unverified after this customer subscribed -- stop accruing new
      -- paid cycles for it (mirrors the capacity_full skip below; no charge, no items, retries
      -- next cycle in case the kitchen gets reinstated. If it never does, the subscription just
      -- keeps skipping silently-to-the-customer's-wallet -- an admin should still cancel it,
      -- this only stops new money from moving).
      update subscription_cycles set status='skipped', skipped=true, payment_status='skipped', total_cents=0, updated_at=now() where id=v_cycle;
      insert into subscription_events(subscription_id,cycle_id,event,to_status,actor,meta)
        values(s.id, v_cycle, 'kitchen_unverified', 'skipped', 'system', jsonb_build_object('delivery_date', v_delivery));
      perform notify(s.customer_id, 'cycle_skipped',
        'This week''s delivery was skipped',
        coalesce(pl.name, 'Your meal plan') || ' is temporarily unavailable for ' || to_char(v_delivery, 'Mon DD') || ' — you were not charged.');
      update subscriptions set next_cycle_date = v_delivery + (7*coalesce(s.cadence_weeks,1)), updated_at=now() where id=s.id;
      continue;
    end if;

    v_portions := coalesce(pl.meals_per_delivery,1) * coalesce(pl.servings,1);
    v_res := reserve_capacity(s.kitchen_id, v_delivery, v_portions, 'cycle', v_cycle);
    if v_res is null then
      update subscription_cycles set status='skipped', skipped=true, payment_status='skipped', total_cents=0, updated_at=now() where id=v_cycle;
      insert into subscription_events(subscription_id,cycle_id,event,to_status,actor,meta)
        values(s.id, v_cycle, 'capacity_full', 'skipped', 'system', jsonb_build_object('delivery_date', v_delivery, 'portions', v_portions));
      perform notify(s.customer_id, 'cycle_skipped',
        'This week''s delivery was skipped',
        coalesce(pl.name, 'Your meal plan') || ' is at capacity for ' || to_char(v_delivery, 'Mon DD') || ' — you were not charged. Delivery resumes next cycle.');
    else
      if pl.selection_model='fixed' then
        v_week_idx := 0;
        if coalesce(pl.rotating,false) and coalesce(pl.rotation_weeks,1) > 1 and s.billing_anchor is not null then
          v_week_idx := (((v_delivery - s.billing_anchor) / (7*coalesce(s.cadence_weeks,1)))::int) % pl.rotation_weeks;
        end if;
        insert into subscription_cycle_items(cycle_id, meal_id, qty, kitchen_id, unit_price_cents)
          select v_cycle, pi.meal_id, pi.qty, s.kitchen_id, m.price_cents from plan_items pi join meals m on m.id=pi.meal_id
          where pi.plan_id=pl.id and pi.week_index = v_week_idx
          on conflict (cycle_id, meal_id) do nothing;
        if not exists (select 1 from subscription_cycle_items where cycle_id=v_cycle) and v_week_idx <> 0 then
          insert into subscription_cycle_items(cycle_id, meal_id, qty, kitchen_id, unit_price_cents)
            select v_cycle, pi.meal_id, pi.qty, s.kitchen_id, m.price_cents from plan_items pi join meals m on m.id=pi.meal_id
            where pi.plan_id=pl.id and pi.week_index = 0
            on conflict (cycle_id, meal_id) do nothing;
        end if;
      end if;
      insert into subscription_events(subscription_id,cycle_id,event,to_status,actor)
        values(s.id, v_cycle, 'cycle_opened', 'selection_open', 'cron');
    end if;
    update subscriptions set next_cycle_date = v_delivery + (7*coalesce(s.cadence_weeks,1)), updated_at=now() where id=s.id;
  end loop;

  -- (3) closeout: snapshot amount at the deadline
  for c in
    select cy.* from subscription_cycles cy
    where cy.status='selection_open' and now() >= cy.selection_deadline and not cy.skipped
  loop
    select * into s from subscriptions where id=c.subscription_id;
    v_member := is_prepplus_member(s.customer_id);  -- PrepPlus: waive Preppa's fee, locked at snapshot

    if c.is_box then
      select coalesce(sum(unit_price_cents * qty),0) into v_subtotal from subscription_cycle_items where cycle_id=c.id;
      v_disc  := round(v_subtotal * coalesce(s.discount_bps,0) / 10000.0)::int;
      v_fee   := round(v_subtotal * (case when v_member then 0 else coalesce(s.service_fee_bps,1500) end) / 10000.0)::int;
      v_total := v_subtotal - v_disc + v_fee;
      update subscription_cycles
         set subtotal_cents=v_subtotal, discount_cents=v_disc, service_fee_cents=v_fee, tax_cents=0,
             total_cents=v_total, fee_waived=v_member, status='selection_closed', updated_at=now()
       where id=c.id;
      insert into subscription_events(subscription_id,cycle_id,event,from_status,to_status,actor,meta)
        values(s.id, c.id, 'selection_closed', 'selection_open', 'selection_closed', 'cron',
               jsonb_build_object('total_cents', v_total, 'discount_cents', v_disc, 'fee_waived', v_member));
      continue;
    end if;

    select * into pl from plans where id=s.plan_id;
    if not exists (select 1 from subscription_cycle_items where cycle_id=c.id) then
      insert into subscription_cycle_items(cycle_id, meal_id, qty, kitchen_id, unit_price_cents)
        select c.id, pi.meal_id, pi.qty, s.kitchen_id, m.price_cents from plan_items pi join meals m on m.id=pi.meal_id where pi.plan_id=pl.id and pi.week_index=0
        on conflict (cycle_id, meal_id) do nothing;
    end if;

    if coalesce(s.trial_cycles_remaining,0) > 0 and pl.trial_price_cents is not null then
      v_subtotal := pl.trial_price_cents; v_fee := 0; v_tax := 0; v_total := pl.trial_price_cents;
      update subscriptions set trial_cycles_remaining = trial_cycles_remaining - 1 where id=s.id;
    else
      if pl.selection_model = 'fixed' then
        v_subtotal := coalesce(pl.price_cents,0);
      elsif pl.per_meal_cents is not null then
        select coalesce(sum(ci.qty),0) into v_qty from subscription_cycle_items ci where ci.cycle_id=c.id;
        v_subtotal := pl.per_meal_cents * v_qty;
      else
        select coalesce(sum(m.price_cents * ci.qty),0) into v_subtotal
          from subscription_cycle_items ci join meals m on m.id=ci.meal_id where ci.cycle_id=c.id;
      end if;
      v_subtotal := v_subtotal + coalesce(pl.per_delivery_cents,0);
      v_fee := round(v_subtotal * (case when v_member then 0 else coalesce(pl.service_fee_bps,1000) end) / 10000.0)::int;
      v_tax := round(v_subtotal * coalesce(pl.tax_bps,0) / 10000.0)::int;
      v_total := v_subtotal + v_fee + v_tax;
    end if;

    update subscription_cycles
       set subtotal_cents=v_subtotal, service_fee_cents=v_fee, tax_cents=v_tax, total_cents=v_total,
           fee_waived=v_member, status='selection_closed', updated_at=now()
     where id=c.id;
    insert into subscription_events(subscription_id,cycle_id,event,from_status,to_status,actor,meta)
      values(s.id, c.id, 'selection_closed', 'selection_open', 'selection_closed', 'cron', jsonb_build_object('total_cents', v_total, 'fee_waived', v_member));
  end loop;

  update subscriptions sub set lifecycle='cancelled', updated_at=now()
   where sub.lifecycle='cancellation_scheduled'
     and not exists (select 1 from subscription_cycles c3 where c3.subscription_id=sub.id
                     and c3.status in ('scheduled','selection_open','selection_closed','charged'));
end $function$;
