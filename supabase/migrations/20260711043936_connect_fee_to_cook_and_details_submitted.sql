
-- Track whether the cook finished Stripe Connect onboarding (KYC/ID submitted).
alter table public.stripe_accounts add column if not exists details_submitted boolean not null default false;

-- Cook bears Stripe's processing fee: on a paid order, in addition to crediting the
-- cook's sale + tip, record a NEGATIVE `fee` ledger entry (~2.9% + 30c of the total).
-- The money stays in Preppa's balance (which paid Stripe), so Preppa is whole and the
-- cook's payout nets the fee. Estimate now; exact per-charge fee is a later refinement.
create or replace function public.reconcile_paid_pi()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_order_id uuid;
  o public.orders%rowtype;
  v_stripe_fee int;
begin
  if coalesce(new.status, '') <> 'succeeded' then
    return new;
  end if;
  begin
    if (new.metadata->>'order_id') !~ '^[0-9a-fA-F-]{36}$' then
      return new;
    end if;
    v_order_id := (new.metadata->>'order_id')::uuid;

    update public.payment_intents
       set status = 'succeeded'
     where stripe_payment_intent_id = new.id
       and status is distinct from 'succeeded';

    update public.orders
       set pay_status = 'paid',
           status = case when status = 'pending' then 'confirmed' else status end,
           updated_at = now()
     where id = v_order_id
       and pay_status <> 'paid'
     returning * into o;

    if found and not exists (select 1 from public.ledger_entries where order_id = o.id and kind = 'sale') then
      insert into public.ledger_entries (kitchen_id, order_id, kind, amount_cents, memo)
        values (o.kitchen_id, o.id, 'sale', o.subtotal_cents, 'Order sale ' || left(o.id::text, 8));
      if o.tip_cents > 0 then
        insert into public.ledger_entries (kitchen_id, order_id, kind, amount_cents, memo)
          values (o.kitchen_id, o.id, 'tip', o.tip_cents, 'Tip ' || left(o.id::text, 8));
      end if;
      -- Stripe processing fee borne by the cook (negative).
      v_stripe_fee := round(o.total_cents * 0.029)::int + 30;
      insert into public.ledger_entries (kitchen_id, order_id, kind, amount_cents, memo)
        values (o.kitchen_id, o.id, 'fee', -v_stripe_fee, 'Stripe processing fee ' || left(o.id::text, 8));
    end if;
  exception when others then
    raise warning 'reconcile_paid_pi failed for pi %: %', new.id, sqlerrm;
  end;
  return new;
end
$function$;
