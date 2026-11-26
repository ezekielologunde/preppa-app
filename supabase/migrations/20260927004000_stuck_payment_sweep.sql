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
--   is more than 5 minutes ago.
-- * metadata order_id: stuck unless public.orders.pay_status is 'paid' or 'refunded'
--   (a refunded order was paid first, and Stripe keeps a refunded PI at 'succeeded').
-- * else metadata cycle_id: stuck unless public.subscription_cycles.payment_status is 'paid' or
--   'refunded'.
-- * else metadata booking_id: a balance charge (metadata kind = 'balance', set by complete-booking)
--   is stuck unless public.bookings.balance_charge_status = 'paid'; a deposit is stuck unless
--   public.bookings.confirmed_at is set (reconcile_paid_pi always sets it, even for a booking that
--   was cancelled meanwhile).
-- * a target id that matches no row is stuck too (money taken, nothing to show for it). The key is
--   chosen with reconcile's loose 36-character check, but cast to uuid only when it is a well-formed
--   uuid; a malformed id (for example 36 hex digits) stays null, matches no row and is reported as
--   stuck instead of aborting the whole run on a cast error.
-- * PIs with none of the three keys (memberships, invoices) are not this sweep's concern.
--
-- Scan window: public.stuck_payment_sweep_state (one row, RLS on, no policy, no anon or authenticated
-- grant) holds the time of the last successful run. A run looks back to that time minus 5 minutes, but
-- never less than 30 days; the very first run (no row) scans every succeeded PI once. A run that alerts
-- nobody does not move it.
--
-- Delivery before dedupe: the run counts the profiles notify_admins() reaches (its own predicate:
-- profiles joined to auth.users with role 'admin', 20260908010000_admin_alerts_via_resend_email.sql)
-- and, after the call, confirms that this call created a notification row for at least one of them
-- (same kind, title and body, created at this transaction's now()). Only then does it write the dedupe
-- rows: one public.audit_log row per alerted PI (action 'anomaly_alerted', entity 'payment_intent',
-- meta.kind 'stuck_payment', meta.payment_intent_id). Otherwise it writes no dedupe row, leaves the
-- scan window alone and returns status 'no_recipients' (no admin) or 'not_delivered' (no row created),
-- so the next 5 minute run tries again. notify_admins() itself is unchanged.
--
-- One notify_admins call per run is a digest: the first 20 PI ids, then a count of the rest (all of
-- them are in audit_log), so a backlog or leftover test payments are one alert, not one per PI. The
-- alert and the audit row hold ids only: the PI id, the target kind and the target id from metadata.
-- No amount, customer, email or card detail.
--
-- Returns jsonb {status, count}: status is 'no_stripe_mirror', 'nothing_stuck', 'alerted',
-- 'no_recipients' or 'not_delivered'; count is the number of stuck PIs found in this run.
--
-- No secrets and no outbound request here: the job is plain SQL. pg_cron only exists on the hosted
-- project, so the schedule is guarded exactly like reap-experience-holds
-- (20260713215837_experiences_e3a_ttl_reaper.sql): unschedule by name if present, then schedule, so
-- re-applying this migration leaves exactly one job.
--
-- Executable check: supabase/tests/stuck_payment_sweep_smoke.sql runs the function against throwaway
-- fixtures in a transaction that always rolls back, and prints PASS or FAIL per case (no admin, one
-- admin and one stuck PI, a repeat run, a malformed metadata id, the scan window). CI runs it after
-- `supabase start`. To run it against a project, after this migration is applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/stuck_payment_sweep_smoke.sql
-- It exits non-zero if any case fails. It creates a stub stripe.payment_intents only where the mirror
-- is absent, and its fixtures (one auth user, PIs whose metadata ids match no row) never commit.

create index if not exists audit_log_stuck_payment_pi_idx
  on public.audit_log ((meta->>'payment_intent_id'))
  where action = 'anomaly_alerted' and entity = 'payment_intent';

create table if not exists public.stuck_payment_sweep_state (
  id boolean primary key default true check (id),
  last_success_at timestamptz not null
);
alter table public.stuck_payment_sweep_state enable row level security;
revoke all on table public.stuck_payment_sweep_state from public, anon, authenticated;

-- the first version returned integer; a return type cannot change under create or replace
drop function if exists public.sweep_stuck_payments();

create or replace function public.sweep_stuck_payments()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_last timestamptz;
  v_since timestamptz;
  v_stuck jsonb;
  v_count integer;
  v_list text;
  v_body text;
  v_recipients integer;
  v_before integer;
  v_after integer;
begin
  if pg_catalog.to_regclass('stripe.payment_intents') is null then
    -- the Stripe mirror only exists after stripe-setup has run
    return pg_catalog.jsonb_build_object('status', 'no_stripe_mirror', 'count', 0);
  end if;

  -- one sweep at a time, so two overlapping runs cannot both alert the same PI
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('sweep_stuck_payments'));

  -- back to the last successful run (less the 5 minute age gate), never less than 30 days; first run: all
  select st.last_success_at into v_last from public.stuck_payment_sweep_state st;
  if v_last is not null then
    v_since := least(v_last - interval '5 minutes', pg_catalog.now() - interval '30 days');
  end if;

  with mirrored as (
    select pi.id as pi_id,
           case
             when (pi.metadata->>'order_id') ~ '^[0-9a-fA-F-]{36}$' then 'order'
             when (pi.metadata->>'cycle_id') ~ '^[0-9a-fA-F-]{36}$' then 'cycle'
             when (pi.metadata->>'booking_id') ~ '^[0-9a-fA-F-]{36}$' then 'booking'
           end as target,
           case
             when (pi.metadata->>'order_id') ~ '^[0-9a-fA-F-]{36}$' then pi.metadata->>'order_id'
             when (pi.metadata->>'cycle_id') ~ '^[0-9a-fA-F-]{36}$' then pi.metadata->>'cycle_id'
             when (pi.metadata->>'booking_id') ~ '^[0-9a-fA-F-]{36}$' then pi.metadata->>'booking_id'
           end as target_ref,
           coalesce(pi.metadata->>'kind', '') = 'balance' as is_balance
    from stripe.payment_intents pi
    where pi.status = 'succeeded'
      and (pi._raw_data->>'created') ~ '^[0-9]{1,12}$'
      and pg_catalog.to_timestamp((pi._raw_data->>'created')::double precision) < pg_catalog.now() - interval '5 minutes'
      and (v_since is null or pg_catalog.to_timestamp((pi._raw_data->>'created')::double precision) >= v_since)
  ),
  candidates as (
    -- cast only a well-formed uuid: one malformed metadata id must not abort the whole run
    select r.pi_id, r.target, r.target_ref, r.is_balance,
           case
             when r.target_ref ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
             then r.target_ref::uuid
           end as target_id
    from mirrored r
    where r.target is not null
  ),
  stuck as (
    select c.pi_id, c.target, c.target_ref, c.target_id
    from candidates c
    where not (case c.target
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
  )
  select pg_catalog.jsonb_agg(
           pg_catalog.jsonb_build_object('payment_intent_id', s.pi_id, 'target', s.target,
                                         'target_id', s.target_ref, 'entity_id', s.target_id)
           order by s.pi_id)
    into v_stuck
  from stuck s;

  v_count := coalesce(pg_catalog.jsonb_array_length(v_stuck), 0);

  if v_count = 0 then
    insert into public.stuck_payment_sweep_state (id, last_success_at) values (true, pg_catalog.now())
      on conflict (id) do update set last_success_at = excluded.last_success_at;
    return pg_catalog.jsonb_build_object('status', 'nothing_stuck', 'count', 0);
  end if;

  select string_agg(l.line, '; ' order by l.rn) filter (where l.rn <= 20)
    into v_list
  from (
    select (e.item->>'payment_intent_id') || ' (' || (e.item->>'target') || ' ' || (e.item->>'target_id') || ')' as line,
           e.rn
    from pg_catalog.jsonb_array_elements(v_stuck) with ordinality as e(item, rn)
  ) l;

  v_body := v_count || ' succeeded payment(s) not marked paid after 5 minutes: ' || v_list
    || case when v_count > 20 then ' and ' || (v_count - 20) || ' more (all in audit_log, kind stuck_payment)' else '' end;

  -- the profiles notify_admins() would reach, by its own predicate
  select count(*)::integer into v_recipients
  from public.profiles p join auth.users u on u.id = p.id where p.role = 'admin';

  if v_recipients = 0 then
    raise warning 'sweep_stuck_payments: % stuck payment(s) not alerted, no admin recipient', v_count;
    return pg_catalog.jsonb_build_object('status', 'no_recipients', 'count', v_count);
  end if;

  select count(*)::integer into v_before
  from public.notifications n
  where n.kind = 'admin' and n.title = 'Stuck payment' and n.body = v_body and n.created_at = pg_catalog.now()
    and n.user_id in (select p.id from public.profiles p join auth.users u on u.id = p.id where p.role = 'admin');

  perform public.notify_admins('admin', 'Stuck payment', v_body);

  select count(*)::integer into v_after
  from public.notifications n
  where n.kind = 'admin' and n.title = 'Stuck payment' and n.body = v_body and n.created_at = pg_catalog.now()
    and n.user_id in (select p.id from public.profiles p join auth.users u on u.id = p.id where p.role = 'admin');

  if v_after <= v_before then
    raise warning 'sweep_stuck_payments: % stuck payment(s) not alerted, notify_admins created no notification', v_count;
    return pg_catalog.jsonb_build_object('status', 'not_delivered', 'count', v_count);
  end if;

  -- delivered to at least one admin: only now mark these PIs alerted
  insert into public.audit_log (actor_id, action, entity, entity_id, meta)
  select null::uuid, 'anomaly_alerted', 'payment_intent', s.entity_id,
         pg_catalog.jsonb_build_object('kind', 'stuck_payment', 'payment_intent_id', s.payment_intent_id,
                                       'target', s.target, 'target_id', s.target_id)
  from pg_catalog.jsonb_to_recordset(v_stuck) as s(payment_intent_id text, target text, target_id text, entity_id uuid);

  insert into public.stuck_payment_sweep_state (id, last_success_at) values (true, pg_catalog.now())
    on conflict (id) do update set last_success_at = excluded.last_success_at;

  return pg_catalog.jsonb_build_object('status', 'alerted', 'count', v_count);
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
