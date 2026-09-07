-- Phase B m3: extend reconcile_paid_pi with a cycle branch. Order + booking branches
-- are byte-for-byte the existing logic; only the elsif cycle_id block is new.
create or replace function public.reconcile_paid_pi()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_order_id uuid; v_booking_id uuid; v_cycle_id uuid;
  o public.orders%rowtype; b public.bookings%rowtype; cyc public.subscription_cycles%rowtype;
  v_stripe_fee int;
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
      end if;

    elsif (new.metadata->>'cycle_id') ~ '^[0-9a-fA-F-]{36}$' then
      v_cycle_id := (new.metadata->>'cycle_id')::uuid;
      select * into cyc from public.subscription_cycles where id=v_cycle_id;
      if found and cyc.order_id is null
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
        end if;
      end if;
    end if;
  exception when others then raise warning 'reconcile_paid_pi failed for pi %: %', new.id, sqlerrm; end;
  return new;
end
$function$;
