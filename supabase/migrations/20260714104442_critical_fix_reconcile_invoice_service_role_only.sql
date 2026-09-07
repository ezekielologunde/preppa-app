-- CRITICAL: reconcile_invoice() is SECURITY DEFINER, had zero authorization checks, and was
-- directly EXECUTE-granted to anon + authenticated. Any client could call it with a guessed/known
-- stripe_subscription_id to fabricate a paid order + a 'sale' ledger credit with $0 real payment
-- collected, which feeds kitchen_balance_cents()/reserve_payout() -> real Stripe Connect payout.
-- This function is service-role-only by design (invoked from a webhook/reconciliation worker with
-- the service key) - it never needed anon/authenticated access at all. It had zero presence in
-- git/migration history prior to this file (created live outside vendored migrations) - this also
-- backfills that gap so the repo reflects live schema.

revoke all on function public.reconcile_invoice(text, text, bigint) from public, anon, authenticated;
grant execute on function public.reconcile_invoice(text, text, bigint) to service_role;

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
  -- Belt-and-suspenders: even though the grant above now restricts this to service_role,
  -- require it explicitly in the body too (matches admin_set_user_role's inline-check idiom),
  -- so a future grant mistake can't silently reopen this hole.
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'reconcile_invoice: service_role only' using errcode = '42501';
  end if;

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

  -- cook credit: sale (+) and the Stripe processing fee (-), same split as one-off orders
  insert into public.ledger_entries (kitchen_id, order_id, kind, amount_cents, memo)
    values (s.kitchen_id, v_order_id, 'sale', pl.price_cents, 'Plan sale ' || left(v_order_id::text, 8));
  v_stripe_fee := round(v_total * 0.029)::int + 30;
  insert into public.ledger_entries (kitchen_id, order_id, kind, amount_cents, memo)
    values (s.kitchen_id, v_order_id, 'fee', -v_stripe_fee, 'Stripe processing fee ' || left(v_order_id::text, 8));
end
$function$;
