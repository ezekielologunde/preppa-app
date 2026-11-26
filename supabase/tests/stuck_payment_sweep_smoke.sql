-- Smoke test for public.sweep_stuck_payments() (web launch 1.12,
-- supabase/migrations/20260927004000_stuck_payment_sweep.sql). It executes the function, which the
-- static checks in tests/stuckPaymentSweep.test.ts cannot.
--
-- Run (after the migration is applied):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/stuck_payment_sweep_smoke.sql
-- CI runs it against the fresh `supabase start` stack, after regressions.sql.
--
-- Everything happens inside one transaction that always rolls back, so nothing here persists:
-- * a stub stripe.payment_intents (generated id, status and metadata over _raw_data, the shape
--   stripe-setup creates) only where the Stripe mirror is absent;
-- * PaymentIntents whose metadata ids are random uuids that match no row, so reconcile_paid_pi() (if
--   its trigger is installed) touches nothing and the sweep reports them as stuck;
-- * every existing admin is demoted for the "no admin" case, then one throwaway auth user is made
--   the only admin. notify_admins() may queue an email or webhook through pg_net; the queue row is
--   rolled back with everything else, so nothing is sent.
--
-- Prints PASS or FAIL per case as a NOTICE, then raises (non-zero exit under ON_ERROR_STOP) if any
-- case failed. A setup step that errors aborts the script with that error.
begin;

select pg_catalog.set_config('app.privileged', 'on', true);

create temp table smoke_result (
  n serial primary key,
  name text not null,
  ok boolean not null,
  detail text
) on commit drop;

create temp table smoke_ctx (account_id text, admin_id uuid) on commit drop;
insert into smoke_ctx default values;

-- setup: Stripe mirror (stub if absent), an account id for the real mirror's foreign key, no admin,
-- and no sweep state, so the first sweep below is a first run
do $$
declare
  v_acct text;
begin
  if pg_catalog.to_regclass('stripe.payment_intents') is null then
    create schema if not exists stripe;
    create table stripe.payment_intents (
      _raw_data jsonb not null,
      _account_id text,
      id text generated always as ((_raw_data->>'id')::text) stored primary key,
      status text generated always as ((_raw_data->>'status')::text) stored,
      metadata jsonb generated always as ((_raw_data->'metadata')::jsonb) stored
    );
  end if;

  if pg_catalog.to_regclass('stripe.accounts') is not null then
    execute 'select id from stripe.accounts order by id limit 1' into v_acct;
    if v_acct is null then
      execute $q$insert into stripe.accounts (_raw_data) values ('{"id": "acct_smoke_1_12", "object": "account"}'::jsonb) returning id$q$
        into v_acct;
    end if;
  end if;
  update pg_temp.smoke_ctx set account_id = v_acct;

  update public.profiles set role = 'customer' where role = 'admin';
  delete from public.stuck_payment_sweep_state;
end $$;

-- a succeeded PI created p_age ago with the given metadata
create function pg_temp.smoke_pi(p_id text, p_meta jsonb, p_age interval)
returns void
language sql
as $f$
  insert into stripe.payment_intents (_raw_data, _account_id)
  select pg_catalog.jsonb_build_object(
           'id', p_id, 'object', 'payment_intent', 'status', 'succeeded', 'metadata', p_meta,
           'created', pg_catalog.floor(extract(epoch from pg_catalog.now() - p_age))::bigint),
         (select c.account_id from pg_temp.smoke_ctx c);
$f$;

-- dedupe rows the sweep wrote for one PI
create function pg_temp.smoke_alerted(p_id text)
returns integer
language sql
as $f$
  select count(*)::integer from public.audit_log a
  where a.action = 'anomaly_alerted' and a.entity = 'payment_intent' and a.meta->>'payment_intent_id' = p_id;
$f$;

-- stuck-payment notifications the throwaway admin has received
create function pg_temp.smoke_admin_alerts()
returns integer
language sql
as $f$
  select count(*)::integer from public.notifications n
  where n.user_id = (select c.admin_id from pg_temp.smoke_ctx c)
    and n.kind = 'admin' and n.title = 'Stuck payment';
$f$;

create function pg_temp.smoke_record(p_name text, p_ok boolean, p_detail text)
returns void
language sql
as $f$
  insert into pg_temp.smoke_result (name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail);
$f$;

select pg_temp.smoke_pi('pi_0smoke112_a', pg_catalog.jsonb_build_object('order_id', gen_random_uuid()::text), interval '1 hour');

-- case 1: no admin. Nobody can be told, so no dedupe row and no state, and the result says why.
do $$
declare
  r jsonb;
begin
  r := public.sweep_stuck_payments();
  perform pg_temp.smoke_record(
    'no admin: result no_recipients, no dedupe row, scan window not advanced',
    r->>'status' = 'no_recipients'
      and pg_temp.smoke_alerted('pi_0smoke112_a') = 0
      and not exists (select 1 from public.stuck_payment_sweep_state),
    r::text);
exception when others then
  perform pg_temp.smoke_record('no admin: result no_recipients, no dedupe row, scan window not advanced', false, sqlerrm);
end $$;

-- setup: one admin, the throwaway user (handle_new_user makes the profile; insert it if that trigger is absent)
do $$
declare
  v_admin uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  values (v_admin, 'sweep-smoke-1-12@example.invalid', 'authenticated', 'authenticated',
          '{"display_name": "sweep smoke"}'::jsonb);
  insert into public.profiles (id, display_name) values (v_admin, 'sweep smoke') on conflict (id) do nothing;
  update public.profiles set role = 'admin' where id = v_admin;
  update pg_temp.smoke_ctx set admin_id = v_admin;
end $$;

-- case 2: one admin, one stuck PI. One alert, one dedupe row, scan window recorded.
do $$
declare
  r jsonb;
begin
  r := public.sweep_stuck_payments();
  perform pg_temp.smoke_record(
    'one admin and one stuck payment: one alert, one dedupe row',
    r->>'status' = 'alerted'
      and pg_temp.smoke_alerted('pi_0smoke112_a') = 1
      and pg_temp.smoke_admin_alerts() = 1
      and exists (select 1 from public.notifications n
                  where n.user_id = (select c.admin_id from pg_temp.smoke_ctx c)
                    and n.title = 'Stuck payment' and n.body like '%pi_0smoke112_a (order %')
      and (select st.last_success_at from public.stuck_payment_sweep_state st) = pg_catalog.now(),
    r::text);
exception when others then
  perform pg_temp.smoke_record('one admin and one stuck payment: one alert, one dedupe row', false, sqlerrm);
end $$;

-- case 3: the same run again alerts nobody a second time.
do $$
declare
  r jsonb;
begin
  r := public.sweep_stuck_payments();
  perform pg_temp.smoke_record(
    'same run again: no second alert',
    r->>'status' = 'nothing_stuck'
      and pg_temp.smoke_alerted('pi_0smoke112_a') = 1
      and pg_temp.smoke_admin_alerts() = 1,
    r::text);
exception when others then
  perform pg_temp.smoke_record('same run again: no second alert', false, sqlerrm);
end $$;

-- case 4: 36 hex digits pass reconcile's loose check but are not a uuid. The sweep must complete and
-- report that PI as stuck instead of failing on the cast.
do $$
declare
  r jsonb;
begin
  perform pg_temp.smoke_pi('pi_0smoke112_b', '{"order_id": "0123456789abcdef0123456789abcdef0123"}'::jsonb, interval '1 hour');
  r := public.sweep_stuck_payments();
  perform pg_temp.smoke_record(
    'malformed metadata id: sweep completes and reports it',
    r->>'status' = 'alerted'
      and pg_temp.smoke_alerted('pi_0smoke112_b') = 1
      and pg_temp.smoke_admin_alerts() = 2
      and exists (select 1 from public.audit_log a
                  where a.action = 'anomaly_alerted' and a.entity = 'payment_intent'
                    and a.meta->>'payment_intent_id' = 'pi_0smoke112_b' and a.entity_id is null
                    and a.meta->>'target_id' = '0123456789abcdef0123456789abcdef0123'),
    r::text);
exception when others then
  perform pg_temp.smoke_record('malformed metadata id: sweep completes and reports it', false, sqlerrm);
end $$;

-- case 5: scan window. After a recent successful run a 40-day-old PI is outside the 30 day floor;
-- with no state (first run) it is scanned. A PI younger than 5 minutes is never alerted.
do $$
declare
  r1 jsonb;
  r2 jsonb;
  v_skipped boolean;
begin
  perform pg_temp.smoke_pi('pi_0smoke112_c', pg_catalog.jsonb_build_object('cycle_id', gen_random_uuid()::text), interval '40 days');
  perform pg_temp.smoke_pi('pi_0smoke112_d', pg_catalog.jsonb_build_object('booking_id', gen_random_uuid()::text), interval '1 minute');
  update public.stuck_payment_sweep_state set last_success_at = pg_catalog.now() - interval '1 hour';
  r1 := public.sweep_stuck_payments();
  v_skipped := pg_temp.smoke_alerted('pi_0smoke112_c') = 0;
  delete from public.stuck_payment_sweep_state;
  r2 := public.sweep_stuck_payments();
  perform pg_temp.smoke_record(
    'scan window: 30 day floor after a recent run, everything on the first run, nothing under 5 minutes',
    v_skipped
      and r2->>'status' = 'alerted'
      and pg_temp.smoke_alerted('pi_0smoke112_c') = 1
      and pg_temp.smoke_alerted('pi_0smoke112_d') = 0,
    r1::text || ' then ' || r2::text);
exception when others then
  perform pg_temp.smoke_record('scan window: 30 day floor after a recent run, everything on the first run, nothing under 5 minutes', false, sqlerrm);
end $$;

-- case 6: a backlog of 25 is one digest alert listing 20 ids plus a count of the rest.
do $$
declare
  r jsonb;
  v_before integer := pg_temp.smoke_admin_alerts();
begin
  perform pg_temp.smoke_pi('pi_0smoke112_e' || pg_catalog.lpad(g::text, 2, '0'),
                           pg_catalog.jsonb_build_object('order_id', gen_random_uuid()::text), interval '1 hour')
  from pg_catalog.generate_series(1, 25) g;
  r := public.sweep_stuck_payments();
  perform pg_temp.smoke_record(
    'backlog of 25: one digest alert, 20 ids and a count',
    r->>'status' = 'alerted'
      and (r->>'count')::integer = 25
      and pg_temp.smoke_admin_alerts() = v_before + 1
      and (select count(*) from public.audit_log a
           where a.action = 'anomaly_alerted' and a.entity = 'payment_intent'
             and a.meta->>'payment_intent_id' like 'pi_0smoke112_e%') = 25
      and exists (select 1 from public.notifications n
                  where n.user_id = (select c.admin_id from pg_temp.smoke_ctx c)
                    and n.title = 'Stuck payment' and n.body like '25 succeeded payment(s)%and 5 more%'),
    r::text);
exception when others then
  perform pg_temp.smoke_record('backlog of 25: one digest alert, 20 ids and a count', false, sqlerrm);
end $$;

do $$
declare
  r record;
  v_failed integer;
begin
  for r in select * from pg_temp.smoke_result order by n loop
    raise notice '% %: %', case when r.ok then 'PASS' else 'FAIL' end, r.name, coalesce(r.detail, '');
  end loop;
  select count(*) into v_failed from pg_temp.smoke_result where not ok;
  if v_failed > 0 or (select count(*) from pg_temp.smoke_result) <> 6 then
    raise exception 'stuck_payment_sweep smoke: % of % case(s) failed', v_failed, (select count(*) from pg_temp.smoke_result);
  end if;
  raise notice 'stuck_payment_sweep smoke: all 6 cases passed';
end $$;

rollback;
