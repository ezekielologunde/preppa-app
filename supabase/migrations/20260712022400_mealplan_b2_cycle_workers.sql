-- Phase B m2: advance_cycles() (materialize/open/close, pure SQL, cron-direct) +
-- concurrency-safe claim/mark RPCs used by the charge-due-cycles edge fn.

-- ---- advance_cycles: the no-Stripe cycle lifecycle worker --------------------
create or replace function advance_cycles()
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  s record; pl record; c record;
  v_delivery date; v_deadline timestamptz; v_cycle uuid; v_res uuid; v_portions int;
  v_subtotal int; v_fee int; v_tax int; v_total int;
begin
  -- (0) reaper: un-stick cycles claimed for charge that never got a PI (crash between claim and Stripe)
  update subscription_cycles
     set payment_status='pending', updated_at=now()
   where payment_status='charging' and stripe_payment_intent_id is null
     and updated_at < now() - interval '15 minutes';

  -- (1) auto-resume paused subs whose pause window elapsed
  update subscriptions
     set lifecycle='active', paused_cycles_remaining=null, pause_until=null,
         next_cycle_date=greatest(coalesce(next_cycle_date,current_date),current_date), updated_at=now()
   where lifecycle='paused' and pause_until is not null and pause_until <= current_date;

  -- (2) materialize the next cycle for active subs with no in-flight cycle, within a 10-day horizon
  for s in
    select sub.* from subscriptions sub
    where sub.lifecycle='active' and sub.next_cycle_date is not null
      and sub.next_cycle_date <= current_date + 10
      and not exists (
        select 1 from subscription_cycles c2
        where c2.subscription_id=sub.id
          and c2.status in ('scheduled','selection_open','selection_closed','charging','charged'))
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
      -- fixed plans: pre-fill items now (service_role bypasses the selection-window trigger)
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

  -- (3) closeout: snapshot amount + lock selections once the deadline passes
  for c in
    select cy.* from subscription_cycles cy
    where cy.status='selection_open' and now() >= cy.selection_deadline and not cy.skipped
  loop
    select * into s  from subscriptions where id=c.subscription_id;
    select * into pl from plans where id=s.plan_id;
    -- customer_choice with nothing selected -> fall back to the plan's default set
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

  -- (4) complete cancellation-scheduled subs once no live cycles remain
  update subscriptions sub set lifecycle='cancelled', updated_at=now()
   where sub.lifecycle='cancellation_scheduled'
     and not exists (select 1 from subscription_cycles c3 where c3.subscription_id=sub.id
                     and c3.status in ('scheduled','selection_open','selection_closed','charging','charged'));
end $$;

-- ---- claim: advisory-locked, SKIP LOCKED, flips to 'charging' ----------------
create or replace function claim_cycles_for_charge(p_limit int default 50)
returns table(cycle_id uuid, subscription_id uuid, kitchen_id uuid, total_cents int,
              stripe_customer_id text, stripe_payment_method_id text)
language plpgsql security definer set search_path to 'public' as $$
declare v_ids uuid[];
begin
  if not pg_try_advisory_xact_lock(hashtext('charge-due-cycles')) then return; end if;
  with due as (
    select c.id from subscription_cycles c
    join subscriptions s on s.id=c.subscription_id
    where c.status='selection_closed' and c.skipped=false and c.total_cents>0
      and c.billing_date <= current_date
      and c.payment_status in ('pending','failed')
      and (c.next_retry_at is null or c.next_retry_at <= now())
      and s.lifecycle in ('active','cancellation_scheduled')
    order by c.billing_date
    for update of c skip locked
    limit p_limit
  )
  select array_agg(id) into v_ids from due;
  if v_ids is null then return; end if;
  update subscription_cycles set payment_status='charging', updated_at=now() where id = any(v_ids);
  return query
    select c.id, c.subscription_id, c.kitchen_id, c.total_cents, p.stripe_customer_id, s.stripe_payment_method_id
    from subscription_cycles c
    join subscriptions s on s.id=c.subscription_id
    join profiles p on p.id=s.customer_id
    where c.id = any(v_ids);
end $$;

create or replace function mark_cycle_charged(p_cycle uuid, p_pi text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_sub uuid;
begin
  update subscription_cycles
     set status='charged', stripe_payment_intent_id=p_pi,
         payment_status = case when payment_status='charging' then 'pending' else payment_status end,
         last_payment_error=null, next_retry_at=null, updated_at=now()
   where id=p_cycle returning subscription_id into v_sub;
  update subscriptions set failed_charge_count=0,
         lifecycle = case when lifecycle in ('payment_failed','suspended') then 'active' else lifecycle end,
         updated_at=now()
   where id=v_sub;
  insert into subscription_events(subscription_id,cycle_id,event,to_status,actor)
    values(v_sub, p_cycle, 'charged', 'charged', 'system');
end $$;

create or replace function mark_cycle_action_required(p_cycle uuid, p_pi text, p_err text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_sub uuid; v_cust uuid;
begin
  update subscription_cycles
     set payment_status='action_required', stripe_payment_intent_id=p_pi, last_payment_error=p_err, updated_at=now()
   where id=p_cycle returning subscription_id into v_sub;
  select customer_id into v_cust from subscriptions where id=v_sub;
  insert into notifications(user_id, kind, title, body)
    values(v_cust, 'subscription_action_required', 'Confirm your payment',
           'Your meal-plan payment needs confirmation to keep this week''s delivery.');
  insert into subscription_events(subscription_id,cycle_id,event,to_status,actor,meta)
    values(v_sub, p_cycle, 'payment_action_required', 'action_required', 'system', jsonb_build_object('error', p_err));
end $$;

create or replace function mark_cycle_failed(p_cycle uuid, p_err text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_sub uuid; v_cust uuid; v_count int;
begin
  update subscription_cycles set payment_status='failed', last_payment_error=p_err, updated_at=now()
   where id=p_cycle returning subscription_id into v_sub;
  update subscriptions set failed_charge_count=failed_charge_count+1, updated_at=now()
   where id=v_sub returning failed_charge_count, customer_id into v_count, v_cust;
  if v_count >= 3 then
    update subscription_cycles set status='failed', updated_at=now() where id=p_cycle;
    update subscriptions set lifecycle='suspended', updated_at=now() where id=v_sub;
    perform release_capacity('cycle', p_cycle);
    insert into notifications(user_id, kind, title, body)
      values(v_cust, 'subscription_suspended', 'Subscription paused',
             'We couldn''t process payment after several tries. Update your card to resume.');
    insert into subscription_events(subscription_id,cycle_id,event,to_status,actor,meta)
      values(v_sub, p_cycle, 'suspended', 'suspended', 'system', jsonb_build_object('error', p_err, 'attempts', v_count));
  else
    update subscription_cycles
       set next_retry_at = now() + (case v_count when 1 then interval '1 day'
                                                 when 2 then interval '3 days'
                                                 else interval '5 days' end)
     where id=p_cycle;
    insert into notifications(user_id, kind, title, body)
      values(v_cust, 'subscription_payment_failed', 'Payment didn''t go through',
             'We''ll retry your meal-plan payment shortly. You can also update your card.');
    insert into subscription_events(subscription_id,cycle_id,event,to_status,actor,meta)
      values(v_sub, p_cycle, 'charge_failed', 'failed', 'system', jsonb_build_object('error', p_err, 'attempt', v_count));
  end if;
end $$;

-- grants: workers are service-role only
revoke all on function advance_cycles()                       from public, anon, authenticated;
revoke all on function claim_cycles_for_charge(int)           from public, anon, authenticated;
revoke all on function mark_cycle_charged(uuid,text)          from public, anon, authenticated;
revoke all on function mark_cycle_action_required(uuid,text,text) from public, anon, authenticated;
revoke all on function mark_cycle_failed(uuid,text)           from public, anon, authenticated;
grant execute on function advance_cycles()                       to service_role;
grant execute on function claim_cycles_for_charge(int)           to service_role;
grant execute on function mark_cycle_charged(uuid,text)          to service_role;
grant execute on function mark_cycle_action_required(uuid,text,text) to service_role;
grant execute on function mark_cycle_failed(uuid,text)           to service_role;
