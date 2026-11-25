-- Web launch DESIGN 1.4: one re-runnable installer for the stripe.* mirror triggers that drive
-- paid-order and membership reconciliation, plus a check that reports any that are missing.
--
-- The stripe.* mirror tables are created at runtime by the stripe-setup edge function (Stripe
-- Sync Engine), not by a migration. Four earlier migrations create triggers on them inside
-- `if to_regclass(...) is not null` guards, so on a project where those migrations ran before
-- stripe-setup the triggers were silently never created and paid orders never reconcile:
--   20260710195031  reconcile_paid_pi_trg         stripe.payment_intents
--   20260711060016  reconcile_paid_invoice_trg    stripe.invoices
--   20260713234329  sync_prepplus_membership_trg  stripe.subscriptions
--   20260808025920  sync_cook_pro_membership_trg  stripe.subscriptions
-- Those migrations are applied and are not edited. This migration supersedes their guarded
-- blocks with public.install_stripe_reconcile_triggers(), which creates the same four triggers
-- (same timing, events and functions) and raises instead of skipping.
--
-- Operator step: after stripe-setup has created the stripe.* tables on a project, run
--   select public.install_stripe_reconcile_triggers();
-- (DESIGN L1 checklist step 8). It is safe to run again at any time.
--
-- This migration calls the installer itself only when at least one stripe.* mirror table
-- already exists (stripe-setup has run). On a fresh database, where stripe-setup has not run,
-- it defines the functions and installs nothing, because the installer would raise there.
-- detect_system_health_issues() alerts admins while the mirror exists but any trigger is
-- missing, so a skipped install does not stay silent.

-- Returns one entry per missing reconcile trigger, formatted '<trigger> on <schema.table>'.
-- A trigger counts as missing when its table is absent, when no trigger of that name on that
-- table calls the expected function, or when the trigger is disabled. Empty when all present.
create or replace function public.check_stripe_reconcile_triggers()
returns text[]
language sql
stable
security invoker
set search_path to ''
as $function$
  select coalesce(array_agg(s.trigger_name || ' on ' || s.table_name order by s.ord), '{}'::text[])
  from (values
    (1, 'reconcile_paid_pi_trg',        'stripe.payment_intents', 'public.reconcile_paid_pi()'),
    (2, 'reconcile_paid_invoice_trg',   'stripe.invoices',        'public.reconcile_paid_invoice()'),
    (3, 'sync_prepplus_membership_trg', 'stripe.subscriptions',   'public.sync_prepplus_membership()'),
    (4, 'sync_cook_pro_membership_trg', 'stripe.subscriptions',   'public.sync_cook_pro_membership()')
  ) as s(ord, trigger_name, table_name, function_sig)
  where not exists (
    select 1
    from pg_catalog.pg_trigger t
    where t.tgrelid = pg_catalog.to_regclass(s.table_name)
      and t.tgname = s.trigger_name
      and t.tgfoid = pg_catalog.to_regprocedure(s.function_sig)
      and not t.tgisinternal
      and t.tgenabled <> 'D'
  );
$function$;

revoke all on function public.check_stripe_reconcile_triggers() from public, anon, authenticated;
grant execute on function public.check_stripe_reconcile_triggers() to service_role;

-- Creates (drop if exists + create) all four reconcile triggers. Every prerequisite is checked
-- first: if any target table or trigger function is missing it raises one exception naming
-- every trigger that cannot be installed, and creates nothing. It raises again if any trigger
-- is still missing afterwards, so a successful return means all four are in place.
create or replace function public.install_stripe_reconcile_triggers()
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_blocked text[] := '{}'::text[];
  v_missing text[];
begin
  if pg_catalog.to_regclass('stripe.payment_intents') is null then
    v_blocked := v_blocked || 'reconcile_paid_pi_trg (table stripe.payment_intents missing)';
  end if;
  if pg_catalog.to_regprocedure('public.reconcile_paid_pi()') is null then
    v_blocked := v_blocked || 'reconcile_paid_pi_trg (function public.reconcile_paid_pi() missing)';
  end if;
  if pg_catalog.to_regclass('stripe.invoices') is null then
    v_blocked := v_blocked || 'reconcile_paid_invoice_trg (table stripe.invoices missing)';
  end if;
  if pg_catalog.to_regprocedure('public.reconcile_paid_invoice()') is null then
    v_blocked := v_blocked || 'reconcile_paid_invoice_trg (function public.reconcile_paid_invoice() missing)';
  end if;
  if pg_catalog.to_regclass('stripe.subscriptions') is null then
    v_blocked := v_blocked || 'sync_prepplus_membership_trg (table stripe.subscriptions missing)';
    v_blocked := v_blocked || 'sync_cook_pro_membership_trg (table stripe.subscriptions missing)';
  end if;
  if pg_catalog.to_regprocedure('public.sync_prepplus_membership()') is null then
    v_blocked := v_blocked || 'sync_prepplus_membership_trg (function public.sync_prepplus_membership() missing)';
  end if;
  if pg_catalog.to_regprocedure('public.sync_cook_pro_membership()') is null then
    v_blocked := v_blocked || 'sync_cook_pro_membership_trg (function public.sync_cook_pro_membership() missing)';
  end if;

  if pg_catalog.cardinality(v_blocked) > 0 then
    raise exception 'install_stripe_reconcile_triggers: cannot install % trigger(s): %. Run stripe-setup on this project first, then select public.install_stripe_reconcile_triggers();',
      pg_catalog.cardinality(v_blocked), pg_catalog.array_to_string(v_blocked, '; ');
  end if;

  drop trigger if exists reconcile_paid_pi_trg on stripe.payment_intents;
  create trigger reconcile_paid_pi_trg
    after insert or update of status on stripe.payment_intents
    for each row execute function public.reconcile_paid_pi();

  drop trigger if exists reconcile_paid_invoice_trg on stripe.invoices;
  create trigger reconcile_paid_invoice_trg
    after insert or update of status on stripe.invoices
    for each row execute function public.reconcile_paid_invoice();

  drop trigger if exists sync_prepplus_membership_trg on stripe.subscriptions;
  create trigger sync_prepplus_membership_trg
    after insert or update on stripe.subscriptions
    for each row execute function public.sync_prepplus_membership();

  drop trigger if exists sync_cook_pro_membership_trg on stripe.subscriptions;
  create trigger sync_cook_pro_membership_trg
    after insert or update on stripe.subscriptions
    for each row execute function public.sync_cook_pro_membership();

  v_missing := public.check_stripe_reconcile_triggers();
  if pg_catalog.cardinality(v_missing) > 0 then
    raise exception 'install_stripe_reconcile_triggers: still missing after install: %',
      pg_catalog.array_to_string(v_missing, '; ');
  end if;
end;
$function$;

revoke all on function public.install_stripe_reconcile_triggers() from public, anon, authenticated;
grant execute on function public.install_stripe_reconcile_triggers() to service_role;

-- Latest definition copied unchanged from 20260927000000_vault_base_url_for_workers.sql (which
-- carries the 20260908030000_system_health_monitoring.sql checks plus project_base_url_missing and
-- worker_not_running) with one check added at the end: alert when any stripe.* mirror table exists
-- but a reconcile trigger is missing (check_stripe_reconcile_triggers() non-empty).
create or replace function public.detect_system_health_issues()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_job_failures int;
  v_job_detail text;
  v_http_failures int;
  v_http_detail text;
  v_base_url_problem text;
  v_stale_workers text;
  v_auto_payouts_due timestamptz;
  v_missing_triggers text[];
begin
  if to_regnamespace('cron') is null then
    return; -- pg_cron only exists on the hosted project; guarded no-op locally/CI
  end if;

  select count(*), string_agg(distinct j.jobname || ': ' || left(coalesce(r.return_message, 'no message'), 120), '; ')
    into v_job_failures, v_job_detail
  from cron.job_run_details r
  join cron.job j on j.jobid = r.jobid
  where r.status = 'failed' and r.start_time > now() - interval '15 minutes';

  if v_job_failures > 0 and not exists (
    select 1 from audit_log
    where action = 'anomaly_alerted' and entity = 'platform' and meta->>'kind' = 'cron_job_failure'
      and created_at > now() - interval '15 minutes'
  ) then
    perform notify_admins('admin', 'Cron job failure', v_job_failures || ' scheduled job run(s) failed: ' || v_job_detail);
    insert into audit_log (actor_id, action, entity, entity_id, meta)
    values (null, 'anomaly_alerted', 'platform', null, jsonb_build_object('kind', 'cron_job_failure', 'count', v_job_failures));
  end if;

  select count(*), string_agg(distinct coalesce(status_code::text, 'timeout/no response') || coalesce(': ' || left(error_msg, 100), ''), '; ')
    into v_http_failures, v_http_detail
  from net._http_response
  where created > now() - interval '15 minutes'
    and (status_code is null or status_code >= 500 or timed_out);

  if v_http_failures > 0 and not exists (
    select 1 from audit_log
    where action = 'anomaly_alerted' and entity = 'platform' and meta->>'kind' = 'outbound_http_failure'
      and created_at > now() - interval '15 minutes'
  ) then
    perform notify_admins('admin', 'Outbound request failures', v_http_failures || ' outbound request(s) failed in the last 15 minutes: ' || v_http_detail);
    insert into audit_log (actor_id, action, entity, entity_id, meta)
    values (null, 'anomaly_alerted', 'platform', null, jsonb_build_object('kind', 'outbound_http_failure', 'count', v_http_failures));
  end if;

  begin
    perform public.project_function_url('stripe-worker');
  exception when others then
    v_base_url_problem := sqlerrm;
  end;

  if v_base_url_problem is not null and not exists (
    select 1 from audit_log
    where action = 'anomaly_alerted' and entity = 'platform' and meta->>'kind' = 'project_base_url_missing'
      and created_at > now() - interval '15 minutes'
  ) then
    perform notify_admins('admin', 'Functions base URL missing', 'Workers and push cannot reach Edge Functions: ' || v_base_url_problem);
    insert into audit_log (actor_id, action, entity, entity_id, meta)
    values (null, 'anomaly_alerted', 'platform', null, jsonb_build_object('kind', 'project_base_url_missing'));
  end if;

  v_auto_payouts_due := (date_trunc('week', now() at time zone 'UTC') + interval '14 hours') at time zone 'UTC';
  if v_auto_payouts_due > now() then
    v_auto_payouts_due := v_auto_payouts_due - interval '7 days';
  end if;

  select string_agg(w.jobname, ', ' order by w.jobname)
    into v_stale_workers
  from (
    values
      ('stripe-sync-worker', now() - interval '15 minutes'),
      ('charge-due-cycles', now() - interval '15 minutes'),
      ('reconcile-payouts', now() - interval '15 minutes'),
      ('reconcile-cycle-charges', now() - interval '15 minutes'),
      ('reconcile-booking-balances', now() - interval '15 minutes'),
      ('auto-payouts', case when now() between v_auto_payouts_due + interval '1 hour' and v_auto_payouts_due + interval '2 days'
                            then v_auto_payouts_due end)
  ) as w(jobname, succeeded_since)
  where w.succeeded_since is not null
    and not exists (
      select 1
      from cron.job j
      join cron.job_run_details r on r.jobid = j.jobid
      where j.jobname = w.jobname and r.status = 'succeeded' and r.start_time >= w.succeeded_since
    );

  if v_stale_workers is not null and not exists (
    select 1 from audit_log
    where action = 'anomaly_alerted' and entity = 'platform' and meta->>'kind' = 'worker_not_running'
      and created_at > now() - interval '15 minutes'
  ) then
    perform notify_admins('admin', 'Worker not running', 'No successful run in its window for: ' || v_stale_workers);
    insert into audit_log (actor_id, action, entity, entity_id, meta)
    values (null, 'anomaly_alerted', 'platform', null, jsonb_build_object('kind', 'worker_not_running', 'jobs', v_stale_workers));
  end if;

  -- DESIGN 1.4: reconcile triggers missing while the stripe.* mirror exists means paid orders
  -- and memberships stop reconciling. Re-alerts at most hourly while the condition persists.
  if to_regclass('stripe.payment_intents') is not null
     or to_regclass('stripe.invoices') is not null
     or to_regclass('stripe.subscriptions') is not null then
    v_missing_triggers := check_stripe_reconcile_triggers();
    if cardinality(v_missing_triggers) > 0 and not exists (
      select 1 from audit_log
      where action = 'anomaly_alerted' and entity = 'platform' and meta->>'kind' = 'stripe_reconcile_triggers_missing'
        and created_at > now() - interval '1 hour'
    ) then
      perform notify_admins('admin', 'Stripe reconcile triggers missing',
        cardinality(v_missing_triggers) || ' reconcile trigger(s) missing: ' || array_to_string(v_missing_triggers, '; ')
        || '. Run select public.install_stripe_reconcile_triggers();');
      insert into audit_log (actor_id, action, entity, entity_id, meta)
      values (null, 'anomaly_alerted', 'platform', null,
        jsonb_build_object('kind', 'stripe_reconcile_triggers_missing', 'count', cardinality(v_missing_triggers)));
    end if;
  end if;
end;
$$;

revoke all on function public.detect_system_health_issues() from public, anon, authenticated;
grant execute on function public.detect_system_health_issues() to service_role;

-- Install now only where stripe-setup has already created the mirror; see header.
do $$
begin
  if to_regclass('stripe.payment_intents') is not null
     or to_regclass('stripe.invoices') is not null
     or to_regclass('stripe.subscriptions') is not null then
    perform public.install_stripe_reconcile_triggers();
  else
    raise notice 'stripe.* mirror tables absent: reconcile triggers not installed. After stripe-setup run select public.install_stripe_reconcile_triggers();';
  end if;
end $$;
