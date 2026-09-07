-- Close the money loop: when the Stripe sync engine records a PaymentIntent as
-- 'succeeded' (via the real-time webhook), map it back to app order state —
-- flip orders.pay_status -> 'paid', payment_intents.status -> 'succeeded', and
-- write the cook's ledger credits (sale = subtotal, tip = 100%). The 10% service
-- fee is added on top (buyer-paid, platform revenue) so it is NOT credited to the
-- kitchen. Idempotent (guarded on pay_status + existing sale row) and wrapped in
-- EXCEPTION so a reconciliation error can never roll back / break Stripe sync.
create or replace function public.reconcile_paid_pi()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  o public.orders%rowtype;
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
    end if;
  exception when others then
    raise warning 'reconcile_paid_pi failed for pi %: %', new.id, sqlerrm;
  end;
  return new;
end
$$;

-- stripe.payment_intents is provided by the hosted project's Stripe Sync Engine
-- wrapper (a Supabase add-on enabled via the dashboard), which does not exist on
-- a fresh local/self-hosted stack -- guard so this migration replays cleanly there.
do $$
begin
  if to_regclass('stripe.payment_intents') is not null then
    drop trigger if exists reconcile_paid_pi_trg on stripe.payment_intents;
    create trigger reconcile_paid_pi_trg
      after insert or update of status on stripe.payment_intents
      for each row execute function public.reconcile_paid_pi();
  end if;
end $$;
