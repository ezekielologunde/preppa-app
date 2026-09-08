-- Launch dashboard (Launch-Plan.md item 15): money + marketplace health metrics that were
-- previously queryable but not surfaced anywhere. Follows the existing admin_* RPC pattern
-- (SECURITY DEFINER, pinned search_path, gated on public.is_admin() so non-admins get zero
-- rows) -- see 20260708061225_admin_read_rpcs.sql / 20260710073954_admin_ops_read_rpcs.sql.
--
-- Written as plpgsql (not the usual plain-sql RPC) because the Stripe-sync mirror tables
-- (stripe.charges, stripe.refunds) only exist on the hosted project, never in local/CI --
-- same guard pattern as detect_admin_anomalies() (20260907190000_admin_anomaly_detection...):
-- to_regclass(...) check + dynamic `execute` so this function is a harmless no-op for the
-- Stripe-derived fields (payment success rate, refund volume) when that schema is absent,
-- while every DB-native metric (orders, payouts, ledger, kitchens, meals) still works
-- everywhere the same way. System-health metrics (Vercel/edge-function/cron uptime) are
-- deliberately NOT included here -- those live outside Postgres and need separate
-- monitoring, not a SQL RPC; see docs/obsidian/Launch-Plan.md item 15 for the remaining gap.
create or replace function public.admin_dashboard_metrics(p_days int default 7)
returns table(
  period_days int,
  orders_count bigint,
  gmv_cents bigint,
  fulfillment_rate_pct numeric,
  payment_success_rate_pct numeric,
  refund_count bigint,
  refund_amount_cents bigint,
  payouts_pending_count bigint,
  payouts_needs_review_count bigint,
  payouts_paid_amount_cents bigint,
  ledger_unpaid_balance_cents bigint,
  active_cooks bigint,
  live_meals_count bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_days int := greatest(1, coalesce(p_days, 7));
  v_completed bigint;
  v_cancelled bigint;
  v_pay_success bigint;
  v_pay_failed bigint;
begin
  if not public.is_admin() then
    return;
  end if;

  select count(*) filter (where status = 'completed'), count(*) filter (where status = 'cancelled')
    into v_completed, v_cancelled
  from orders where created_at > now() - (v_days || ' days')::interval;

  if to_regclass('stripe.charges') is not null then
    execute format(
      $q$select count(*) filter (where status = 'succeeded'), count(*) filter (where status = 'failed')
         from stripe.charges where to_timestamp(created) > now() - interval '%s days'$q$, v_days
    ) into v_pay_success, v_pay_failed;
  end if;

  return query
  select
    v_days,
    (select count(*) from orders where created_at > now() - (v_days || ' days')::interval),
    (select coalesce(sum(total_cents), 0) from orders
       where status = 'completed' and created_at > now() - (v_days || ' days')::interval),
    case when (v_completed + v_cancelled) > 0
      then round(100.0 * v_completed / (v_completed + v_cancelled), 1) else null end,
    case when (v_pay_success + v_pay_failed) > 0
      then round(100.0 * v_pay_success / (v_pay_success + v_pay_failed), 1) else null end,
    case when to_regclass('stripe.refunds') is not null then (
      select count(*) from stripe.refunds where to_timestamp(created) > now() - (v_days || ' days')::interval
    ) else null end,
    case when to_regclass('stripe.refunds') is not null then (
      select coalesce(sum(amount), 0) from stripe.refunds where to_timestamp(created) > now() - (v_days || ' days')::interval
    ) else null end,
    (select count(*) from payouts where status = 'pending'),
    (select count(*) from payouts where status = 'needs_review'),
    (select coalesce(sum(amount_cents), 0) from payouts
       where status = 'paid' and created_at > now() - (v_days || ' days')::interval),
    (select coalesce(sum(amount_cents), 0) from ledger_entries),
    (select count(*) from kitchens where verification_status = 'verified'),
    (select count(*) from meals where status = 'live');
end;
$$;

revoke all on function public.admin_dashboard_metrics(int) from public, anon;
grant execute on function public.admin_dashboard_metrics(int) to authenticated;
