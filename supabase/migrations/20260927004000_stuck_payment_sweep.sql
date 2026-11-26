-- Web launch task 1.12 (docs/web-launch/DESIGN.md): stuck-payment sweep.
--
-- public.reconcile_paid_pi() (latest: 20260808030007_high_wire_cook_pro_fee_discount.sql) marks the
-- order, subscription cycle or booking named in a succeeded PaymentIntent's metadata as paid. It runs
-- inside the stripe.payment_intents trigger and swallows its own errors (raise warning), and it never
-- runs at all if the trigger is missing, so a customer can be charged while Preppa still shows the
-- order unpaid. This sweep is the backstop: every 5 minutes it finds succeeded PaymentIntents whose
-- target is still not marked paid and alerts admins once per PaymentIntent.
--
-- What counts as stuck (same metadata keys and precedence as reconcile_paid_pi):
-- * stripe.payment_intents.status = 'succeeded' and Stripe's `created` (epoch seconds in _raw_data)
--   is more than 5 minutes and less than 30 days ago. The 30-day bound keeps each run cheap; while
--   this job runs, a stuck PI is alerted about 5 minutes after creation, long before it ages out.
-- * metadata order_id (a uuid): stuck unless public.orders.pay_status is 'paid' or 'refunded'
--   (a refunded order was paid first, and Stripe keeps a refunded PI at 'succeeded').
-- * else metadata cycle_id: stuck unless public.subscription_cycles.payment_status is 'paid' or
--   'refunded'.
-- * else metadata booking_id: a balance charge (metadata kind = 'balance', set by complete-booking)
--   is stuck unless public.bookings.balance_charge_status = 'paid'; a deposit is stuck unless
--   public.bookings.confirmed_at is set (reconcile_paid_pi always sets it, even for a booking that
--   was cancelled meanwhile).
-- * a target id that matches no row is stuck too (money taken, nothing to show for it).
-- * PIs with none of the three keys (memberships, invoices) are not this sweep's concern.
--
-- Dedupe: one public.audit_log row per alerted PI (action 'anomaly_alerted', entity 'payment_intent',
-- meta.kind 'stuck_payment', meta.payment_intent_id). A PI with such a row is never alerted again.
-- One notify_admins call per run lists the new PIs (first 20, then a count), so a backlog on first
-- deploy is one alert, not one email per PI. The alert and the audit row hold ids only: the PI id,
-- the target kind and the target uuid. No amount, customer, email or card detail.
--
-- No secrets and no outbound request here: the job is plain SQL. pg_cron only exists on the hosted
-- project, so the schedule is guarded exactly like reap-experience-holds
-- (20260713215837_experiences_e3a_ttl_reaper.sql): unschedule by name if present, then schedule, so
-- re-applying this migration leaves exactly one job. The function returns 0 where stripe.* is absent.

create index if not exists audit_log_stuck_payment_pi_idx
  on public.audit_log ((meta->>'payment_intent_id'))
  where action = 'anomaly_alerted' and entity = 'payment_intent';

create or replace function public.sweep_stuck_payments()
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_count integer;
  v_list text;
begin
  if pg_catalog.to_regclass('stripe.payment_intents') is null then
    return 0; -- the Stripe mirror only exists after stripe-setup has run
  end if;

  -- one sweep at a time, so two overlapping runs cannot both alert the same PI
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('sweep_stuck_payments'));

  with candidates as (
    select pi.id as pi_id,
           case
             when (pi.metadata->>'order_id') ~ '^[0-9a-fA-F-]{36}$' then 'order'
             when (pi.metadata->>'cycle_id') ~ '^[0-9a-fA-F-]{36}$' then 'cycle'
             when (pi.metadata->>'booking_id') ~ '^[0-9a-fA-F-]{36}$' then 'booking'
           end as target,
           case
             when (pi.metadata->>'order_id') ~ '^[0-9a-fA-F-]{36}$' then (pi.metadata->>'order_id')::uuid
             when (pi.metadata->>'cycle_id') ~ '^[0-9a-fA-F-]{36}$' then (pi.metadata->>'cycle_id')::uuid
             when (pi.metadata->>'booking_id') ~ '^[0-9a-fA-F-]{36}$' then (pi.metadata->>'booking_id')::uuid
           end as target_id,
           coalesce(pi.metadata->>'kind', '') = 'balance' as is_balance
    from stripe.payment_intents pi
    where pi.status = 'succeeded'
      and (pi._raw_data->>'created') ~ '^[0-9]{1,12}$'
      and pg_catalog.to_timestamp((pi._raw_data->>'created')::double precision) < pg_catalog.now() - interval '5 minutes'
      and pg_catalog.to_timestamp((pi._raw_data->>'created')::double precision) > pg_catalog.now() - interval '30 days'
  ),
  stuck as (
    select c.pi_id, c.target, c.target_id
    from candidates c
    where c.target is not null
      and not (case c.target
        when 'order' then exists (
          select 1 from public.orders o
          where o.id = c.target_id and o.pay_status in ('paid', 'refunded'))
        when 'cycle' then exists (
          select 1 from public.subscription_cycles sc
          where sc.id = c.target_id and sc.payment_status in ('paid', 'refunded'))
        else exists (
          select 1 from public.bookings b
          where b.id = c.target_id
            and case when c.is_balance then b.balance_charge_status = 'paid' else b.confirmed_at is not null end)
      end)
      and not exists (
        select 1 from public.audit_log a
        where a.action = 'anomaly_alerted' and a.entity = 'payment_intent'
          and a.meta->>'payment_intent_id' = c.pi_id)
  ),
  logged as (
    insert into public.audit_log (actor_id, action, entity, entity_id, meta)
    select null, 'anomaly_alerted', 'payment_intent', s.target_id,
           pg_catalog.jsonb_build_object('kind', 'stuck_payment', 'payment_intent_id', s.pi_id,
                                         'target', s.target, 'target_id', s.target_id)
    from stuck s
    returning meta
  )
  select count(*)::integer,
         string_agg(l.line, '; ' order by l.line) filter (where l.rn <= 20)
    into v_count, v_list
  from (
    select (lg.meta->>'payment_intent_id') || ' (' || (lg.meta->>'target') || ' ' || (lg.meta->>'target_id') || ')' as line,
           row_number() over (order by lg.meta->>'payment_intent_id') as rn
    from logged lg
  ) l;

  if v_count > 0 then
    perform public.notify_admins(
      'admin',
      'Stuck payment',
      v_count || ' succeeded payment(s) not marked paid after 5 minutes: ' || v_list
        || case when v_count > 20 then ' and ' || (v_count - 20) || ' more' else '' end
    );
  end if;

  return v_count;
end;
$$;

revoke all on function public.sweep_stuck_payments() from public, anon, authenticated;
grant execute on function public.sweep_stuck_payments() to service_role;

do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.unschedule('stuck-payment-sweep') where exists (select 1 from cron.job where jobname = 'stuck-payment-sweep');
    perform cron.schedule('stuck-payment-sweep', '*/5 * * * *', 'select public.sweep_stuck_payments()');
  end if;
end $$;
