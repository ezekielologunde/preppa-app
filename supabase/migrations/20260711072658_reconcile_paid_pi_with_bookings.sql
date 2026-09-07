-- Extend the sync-engine reconcile trigger to also handle service-booking deposits.
-- A booking PI carries metadata.booking_id; on paid, credit the cook (sale = deposit minus the
-- 15% service fee Preppa keeps; fee = the Stripe processing fee, borne by the cook), idempotently,
-- and confirm the booking. Order handling is unchanged.
create or replace function public.reconcile_paid_pi()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order_id uuid;
  v_booking_id uuid;
  o public.orders%rowtype;
  b public.bookings%rowtype;
  v_stripe_fee int;
begin
  if coalesce(new.status, '') <> 'succeeded' then
    return new;
  end if;
  begin
    -- ---- One-off order path (unchanged) ----
    if (new.metadata->>'order_id') ~ '^[0-9a-fA-F-]{36}$' then
      v_order_id := (new.metadata->>'order_id')::uuid;

      update public.payment_intents set status = 'succeeded'
       where stripe_payment_intent_id = new.id and status is distinct from 'succeeded';

      update public.orders
         set pay_status = 'paid',
             status = case when status = 'pending' then 'confirmed' else status end,
             updated_at = now()
       where id = v_order_id and pay_status <> 'paid'
       returning * into o;

      if found and not exists (select 1 from public.ledger_entries where order_id = o.id and kind = 'sale') then
        insert into public.ledger_entries (kitchen_id, order_id, kind, amount_cents, memo)
          values (o.kitchen_id, o.id, 'sale', o.subtotal_cents, 'Order sale ' || left(o.id::text, 8));
        if o.tip_cents > 0 then
          insert into public.ledger_entries (kitchen_id, order_id, kind, amount_cents, memo)
            values (o.kitchen_id, o.id, 'tip', o.tip_cents, 'Tip ' || left(o.id::text, 8));
        end if;
        v_stripe_fee := round(o.total_cents * 0.029)::int + 30;
        insert into public.ledger_entries (kitchen_id, order_id, kind, amount_cents, memo)
          values (o.kitchen_id, o.id, 'fee', -v_stripe_fee, 'Stripe processing fee ' || left(o.id::text, 8));
      end if;

    -- ---- Service-booking deposit path ----
    elsif (new.metadata->>'booking_id') ~ '^[0-9a-fA-F-]{36}$' then
      v_booking_id := (new.metadata->>'booking_id')::uuid;

      update public.bookings
         set status = case when status = 'pending_deposit' then 'confirmed' else status end,
             deposit_pi_id = coalesce(deposit_pi_id, new.id),
             confirmed_at = coalesce(confirmed_at, now())
       where id = v_booking_id
       returning * into b;

      if found and not exists (select 1 from public.ledger_entries where booking_id = b.id and kind = 'sale') then
        -- cook's share of the deposit (Preppa keeps the 15% service fee)
        insert into public.ledger_entries (kitchen_id, booking_id, kind, amount_cents, memo)
          values (b.kitchen_id, b.id, 'sale', greatest(b.deposit_cents - b.service_fee_cents, 0), 'Booking deposit ' || left(b.id::text, 8));
        v_stripe_fee := round(b.deposit_cents * 0.029)::int + 30;
        insert into public.ledger_entries (kitchen_id, booking_id, kind, amount_cents, memo)
          values (b.kitchen_id, b.id, 'fee', -v_stripe_fee, 'Stripe processing fee ' || left(b.id::text, 8));
      end if;
    end if;
  exception when others then
    raise warning 'reconcile_paid_pi failed for pi %: %', new.id, sqlerrm;
  end;
  return new;
end
$function$;
