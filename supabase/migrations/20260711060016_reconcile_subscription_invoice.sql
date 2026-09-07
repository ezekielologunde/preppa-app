-- Turns a paid subscription invoice into a real order + cook-ledger credit, mirroring
-- reconcile_paid_pi for one-off orders. Shared by the stripe.invoices trigger (renewals)
-- and create-subscription (immediate first charge). Idempotent per invoice.
create or replace function public.reconcile_invoice(p_invoice_id text, p_subscription text, p_amount_paid bigint)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s public.subscriptions%rowtype;
  pl public.plans%rowtype;
  v_order_id uuid;
  v_service_fee int;
  v_total int;
  v_stripe_fee int;
begin
  if p_subscription is null or p_invoice_id is null then return; end if;

  select * into s from public.subscriptions where stripe_subscription_id = p_subscription;
  if not found then return; end if;

  -- idempotency: exactly one order per invoice
  if exists (select 1 from public.orders where idempotency_key = 'inv_' || p_invoice_id) then
    return;
  end if;

  select * into pl from public.plans where id = s.plan_id;
  if not found then return; end if;

  v_service_fee := round(pl.price_cents * 0.10)::int;              -- 10% platform service fee
  v_total := coalesce(nullif(p_amount_paid, 0)::int, pl.price_cents + v_service_fee);

  insert into public.orders (customer_id, kitchen_id, status, method, pay_status, fulfillment,
                             subtotal_cents, service_fee_cents, tip_cents, total_cents, idempotency_key)
    values (s.customer_id, s.kitchen_id, 'confirmed', 'card', 'paid', pl.fulfillment,
            pl.price_cents, v_service_fee, 0, v_total, 'inv_' || p_invoice_id)
    returning id into v_order_id;

  -- box contents (informational; snapshot name/price from the meals)
  insert into public.order_items (order_id, meal_id, kitchen_id, name_snapshot, unit_price_cents, qty)
    select v_order_id, m.id, s.kitchen_id, m.name, m.price_cents, pit.qty
      from public.plan_items pit join public.meals m on m.id = pit.meal_id
     where pit.plan_id = pl.id;

  -- cook credit: sale (+) and the Stripe processing fee (−), same split as one-off orders
  insert into public.ledger_entries (kitchen_id, order_id, kind, amount_cents, memo)
    values (s.kitchen_id, v_order_id, 'sale', pl.price_cents, 'Plan sale ' || left(v_order_id::text, 8));
  v_stripe_fee := round(v_total * 0.029)::int + 30;
  insert into public.ledger_entries (kitchen_id, order_id, kind, amount_cents, memo)
    values (s.kitchen_id, v_order_id, 'fee', -v_stripe_fee, 'Stripe processing fee ' || left(v_order_id::text, 8));
end
$function$;

-- Only edge fns (service role) may call it directly; clients cannot fabricate orders.
revoke all on function public.reconcile_invoice(text, text, bigint) from public;
grant execute on function public.reconcile_invoice(text, text, bigint) to service_role;

-- Trigger on the synced invoice mirror: fire when a subscription invoice is paid.
create or replace function public.reconcile_paid_invoice()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if coalesce(new.status, '') = 'paid' and new.subscription is not null then
    begin
      perform public.reconcile_invoice(new.id, new.subscription, coalesce(new.amount_paid, new.total, 0));
    exception when others then
      raise warning 'reconcile_paid_invoice failed for invoice %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end
$function$;

-- stripe.invoices is provided by the hosted project's Stripe Sync Engine wrapper
-- (a Supabase add-on enabled via the dashboard), which does not exist on a fresh
-- local/self-hosted stack -- guard so this migration replays cleanly there.
do $$
begin
  if to_regclass('stripe.invoices') is not null then
    drop trigger if exists reconcile_paid_invoice_trg on stripe.invoices;
    create trigger reconcile_paid_invoice_trg
      after insert or update of status on stripe.invoices
      for each row execute function public.reconcile_paid_invoice();
  end if;
end $$;
