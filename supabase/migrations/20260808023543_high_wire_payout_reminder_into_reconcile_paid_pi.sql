-- Wires notify_payout_available() (added in high_add_payout_available_reminder) into the
-- 4 branches of reconcile_paid_pi that credit a kitchen's ledger, right after the existing
-- "new order" notify() call added in high_add_cook_new_order_notification. One extra line
-- per branch; everything else copied verbatim -- see that migration's comment for why this
-- function's full body is always restated rather than diffed.
create or replace function public.reconcile_paid_pi()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order_id uuid; v_booking_id uuid; v_cycle_id uuid;
  o public.orders%rowtype; b public.bookings%rowtype; cyc public.subscription_cycles%rowtype;
  v_stripe_fee int; v_cust uuid; v_ful public.fulfillment; v_box_id uuid; v_child uuid; rec record;
begin
  if coalesce(new.status,'') <> 'succeeded' then return new; end if;
  begin
    if (new.metadata->>'order_id') ~ '^[0-9a-fA-F-]{36}$' then
      v_order_id := (new.metadata->>'order_id')::uuid;
      update public.payment_intents set status='succeeded' where stripe_payment_intent_id=new.id and status is distinct from 'succeeded';
      update public.orders set pay_status='paid', status=case when status='pending' then 'confirmed' else status end, updated_at=now()
        where id=v_order_id and pay_status<>'paid' returning * into o;
      if found and not exists (select 1 from public.ledger_entries where order_id=o.id and kind='sale') then
        insert into public.ledger_entries(kitchen_id,order_id,kind,amount_cents,memo) values (o.kitchen_id,o.id,'sale',o.subtotal_cents,'Order sale '||left(o.id::text,8));
        if o.tip_cents>0 then insert into public.ledger_entries(kitchen_id,order_id,kind,amount_cents,memo) values (o.kitchen_id,o.id,'tip',o.tip_cents,'Tip '||left(o.id::text,8)); end if;
        v_stripe_fee := round(o.total_cents*0.029)::int + 30;
        insert into public.ledger_entries(kitchen_id,order_id,kind,amount_cents,memo) values (o.kitchen_id,o.id,'fee',-v_stripe_fee,'Stripe processing fee '||left(o.id::text,8));
        perform public.notify(
          (select owner_id from public.kitchens where id = o.kitchen_id),
          'order', 'New order received',
          'A customer just paid $'||to_char(o.total_cents/100.0,'FM999999990.00')||' — tap to start preparing.'
        );
        perform public.notify_payout_available(o.kitchen_id);
      end if;

    elsif (new.metadata->>'cycle_id') ~ '^[0-9a-fA-F-]{36}$' then
      v_cycle_id := (new.metadata->>'cycle_id')::uuid;
      select * into cyc from public.subscription_cycles where id=v_cycle_id;
      if not found then
        null;

      elsif cyc.is_box then
        perform pg_advisory_xact_lock(hashtext('recon:box:'||v_cycle_id::text));
        if cyc.box_order_id is null then
          select s.customer_id, coalesce(s.fulfillment,'delivery'::public.fulfillment)
            into v_cust, v_ful from public.subscriptions s where s.id=cyc.subscription_id;
          v_stripe_fee := round(cyc.total_cents*0.029)::int + 30;

          insert into public.box_orders(customer_id, subscription_id, cycle_id, delivery_date,
              subtotal_cents, discount_cents, service_fee_cents, total_cents, stripe_payment_intent_id, idempotency_key)
            values (v_cust, cyc.subscription_id, v_cycle_id, cyc.delivery_date,
              cyc.subtotal_cents, cyc.discount_cents, cyc.service_fee_cents, cyc.total_cents, new.id, 'box_cyc_'||v_cycle_id)
            on conflict (idempotency_key) do nothing returning id into v_box_id;
          if v_box_id is null then select id into v_box_id from public.box_orders where idempotency_key='box_cyc_'||v_cycle_id; end if;

          for rec in
            with k as (
              select kitchen_id, sum(unit_price_cents*qty)::int as sk
              from public.subscription_cycle_items where cycle_id=v_cycle_id group by kitchen_id),
            tot as (select sum(sk)::numeric as s from k),
            raw as (select k.kitchen_id, k.sk, (v_stripe_fee::numeric * k.sk / nullif(t.s,0)) as rawfee from k cross join tot t),
            fl as (select kitchen_id, sk, floor(rawfee)::int as base,
                     row_number() over (order by (rawfee - floor(rawfee)) desc, kitchen_id) as rn from raw),
            rem as (select v_stripe_fee - coalesce(sum(base),0) as leftover from fl)
            select fl.kitchen_id, fl.sk, fl.base + (case when fl.rn <= (select leftover from rem) then 1 else 0 end) as fee_k from fl
          loop
            insert into public.orders(customer_id, kitchen_id, box_order_id, status, method, pay_status, fulfillment,
                subtotal_cents, service_fee_cents, tip_cents, total_cents, idempotency_key)
              values (v_cust, rec.kitchen_id, v_box_id, 'confirmed', 'card', 'paid', v_ful,
                rec.sk, 0, 0, rec.sk, 'cyc_'||v_cycle_id||'_k_'||rec.kitchen_id)
              on conflict (customer_id, idempotency_key) do nothing returning id into v_child;
            if v_child is not null then
              insert into public.order_items(order_id, meal_id, kitchen_id, name_snapshot, unit_price_cents, qty)
                select v_child, ci.meal_id, rec.kitchen_id, m.name, coalesce(ci.unit_price_cents, m.price_cents), ci.qty
                from public.subscription_cycle_items ci join public.meals m on m.id=ci.meal_id
                where ci.cycle_id=v_cycle_id and ci.kitchen_id=rec.kitchen_id;
              insert into public.ledger_entries(kitchen_id, order_id, cycle_id, kind, amount_cents, memo, dedupe_key)
                values (rec.kitchen_id, v_child, v_cycle_id, 'sale', rec.sk, 'Box cycle '||left(v_cycle_id::text,8),
                        'box:'||v_cycle_id||':'||rec.kitchen_id||':sale')
                on conflict (dedupe_key) where dedupe_key is not null do nothing;
              insert into public.ledger_entries(kitchen_id, order_id, cycle_id, kind, amount_cents, memo, dedupe_key)
                values (rec.kitchen_id, v_child, v_cycle_id, 'fee', -rec.fee_k, 'Stripe fee box '||left(v_cycle_id::text,8),
                        'box:'||v_cycle_id||':'||rec.kitchen_id||':fee')
                on conflict (dedupe_key) where dedupe_key is not null do nothing;
              perform public.notify(
                (select owner_id from public.kitchens where id = rec.kitchen_id),
                'order', 'New box order received',
                'Your part of a subscriber''s box just got paid — tap to view.'
              );
              perform public.notify_payout_available(rec.kitchen_id);
            end if;
          end loop;

          update public.subscription_cycles
             set box_order_id=v_box_id, status='order_created', payment_status='paid',
                 stripe_payment_intent_id=coalesce(stripe_payment_intent_id,new.id), updated_at=now()
           where id=v_cycle_id and box_order_id is null;
          insert into public.subscription_events(subscription_id,cycle_id,event,from_status,to_status,actor)
            values (cyc.subscription_id, v_cycle_id, 'box_order_created', cyc.status::text, 'order_created', 'system');
        end if;

      elsif cyc.order_id is null
         and not exists (select 1 from public.orders where idempotency_key='cyc_'||v_cycle_id) then
        insert into public.orders(customer_id, kitchen_id, status, method, pay_status, fulfillment,
            subtotal_cents, service_fee_cents, tip_cents, total_cents, idempotency_key)
          select s.customer_id, cyc.kitchen_id, 'confirmed', 'card', 'paid',
                 coalesce(s.fulfillment, pl.fulfillment, 'delivery'),
                 cyc.subtotal_cents, cyc.service_fee_cents, 0, cyc.total_cents, 'cyc_'||v_cycle_id
          from public.subscriptions s join public.plans pl on pl.id=s.plan_id
          where s.id=cyc.subscription_id
          returning * into o;
        insert into public.order_items(order_id, meal_id, kitchen_id, name_snapshot, unit_price_cents, qty)
          select o.id, ci.meal_id, cyc.kitchen_id, m.name, m.price_cents, ci.qty
          from public.subscription_cycle_items ci join public.meals m on m.id=ci.meal_id
          where ci.cycle_id=v_cycle_id;
        insert into public.ledger_entries(kitchen_id,order_id,kind,amount_cents,memo)
          values (o.kitchen_id, o.id, 'sale', o.subtotal_cents, 'Subscription cycle '||left(v_cycle_id::text,8));
        v_stripe_fee := round(o.total_cents*0.029)::int + 30;
        insert into public.ledger_entries(kitchen_id,order_id,kind,amount_cents,memo)
          values (o.kitchen_id, o.id, 'fee', -v_stripe_fee, 'Stripe processing fee '||left(o.id::text,8));
        update public.subscription_cycles
           set order_id=o.id, status='order_created', payment_status='paid',
               stripe_payment_intent_id=coalesce(stripe_payment_intent_id,new.id), updated_at=now()
         where id=v_cycle_id;
        insert into public.subscription_events(subscription_id,cycle_id,event,from_status,to_status,actor)
          values (cyc.subscription_id, v_cycle_id, 'order_created', cyc.status::text, 'order_created', 'system');
        perform public.notify(
          (select owner_id from public.kitchens where id = o.kitchen_id),
          'order', 'New subscription order received',
          'A subscriber''s weekly order just got paid — tap to start preparing.'
        );
        perform public.notify_payout_available(o.kitchen_id);
      end if;

    elsif (new.metadata->>'booking_id') ~ '^[0-9a-fA-F-]{36}$' then
      v_booking_id := (new.metadata->>'booking_id')::uuid;
      update public.bookings
         set status=case when status='pending_deposit' then 'confirmed' else status end,
             deposit_pi_id=coalesce(deposit_pi_id,new.id), confirmed_at=coalesce(confirmed_at,now())
       where id=v_booking_id returning * into b;
      if found then
        update public.quotes set status='accepted' where id=b.quote_id and status<>'accepted';
        update public.quotes set status='declined' where request_id=b.request_id and id<>b.quote_id and status='pending';
        update public.service_requests set status='accepted' where id=b.request_id and status<>'accepted';
        if not exists (select 1 from public.ledger_entries where booking_id=b.id and kind='sale') then
          insert into public.ledger_entries(kitchen_id,booking_id,kind,amount_cents,memo)
            values (b.kitchen_id,b.id,'sale',greatest(b.deposit_cents-b.service_fee_cents,0),'Booking deposit '||left(b.id::text,8));
          v_stripe_fee := round(b.deposit_cents*0.029)::int + 30;
          insert into public.ledger_entries(kitchen_id,booking_id,kind,amount_cents,memo)
            values (b.kitchen_id,b.id,'fee',-v_stripe_fee,'Stripe processing fee '||left(b.id::text,8));
          perform public.notify(
            (select owner_id from public.kitchens where id = b.kitchen_id),
            'order', 'New booking deposit paid',
            'A customer confirmed a booking and paid their deposit — tap to view.'
          );
          perform public.notify_payout_available(b.kitchen_id);
        end if;
      end if;
    end if;
  exception when others then raise warning 'reconcile_paid_pi failed for pi %: %', new.id, sqlerrm; end;
  return new;
end
$function$;
