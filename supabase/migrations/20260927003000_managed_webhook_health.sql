-- Web launch DESIGN 1.11 (part B): alert admins when the managed Stripe webhook is gone or silent.
--
-- The stripe-sync webhook is the only path by which Stripe events reach the stripe.* mirror and,
-- through the reconcile triggers, mark orders paid. stripe-setup records it in
-- stripe._managed_webhooks. If that table is empty (the endpoint was never registered, or was
-- deleted as orphaned by another environment's stripe-setup, see RED-TEAM-LOOP0), or every row in
-- it is disabled, customers are charged and orders stay unpaid with nothing reported.
--
-- detect_system_health_issues() gains two checks, each re-alerting at most hourly:
--   stripe_managed_webhook_missing  stripe._managed_webhooks exists and has no row whose status is
--                                   other than 'disabled' (empty, or all disabled).
--   stripe_mirror_stale             card orders were created between 24 hours and 15 minutes ago,
--                                   and no stripe.* mirror table has a row with _updated_at inside
--                                   the last 24 hours. The 15 minute lag leaves a just-placed order
--                                   time for its first webhook event before it counts.
-- Both are skipped where the stripe.* mirror does not exist (stripe-setup has not run), as the 1.4
-- reconcile-trigger check is. The mirror tables scanned are the stripe.* tables with an
-- _updated_at column, excluding the sync engine's metadata tables (names starting with '_') and
-- stripe.accounts, which the worker touches on every run whether or not any event arrived.
--
-- The Stripe dashboard setting that emails on failing webhook deliveries (DESIGN 1.11 part E) is
-- an owner step on the live account and is not part of this migration.
--
-- Latest definition copied unchanged from 20260927002000_install_stripe_reconcile_triggers.sql
-- (which carries the 20260908030000_system_health_monitoring.sql checks, the 1.2
-- project_base_url_missing and worker_not_running checks, and the 1.4
-- stripe_reconcile_triggers_missing check) with the two checks above added at the end. Same
-- signature, security definer, search_path and grants.
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
  v_webhook_rows int;
  v_webhook_enabled int;
  v_mirror_table regclass;
  v_mirror_tables int := 0;
  v_mirror_fresh boolean := false;
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

  -- DESIGN 1.11: no enabled stripe-sync webhook is registered, so Stripe events never reach the
  -- mirror and paid orders never reconcile. Re-alerts at most hourly while the condition persists.
  if to_regclass('stripe._managed_webhooks') is not null then
    select count(*), count(*) filter (where coalesce(w.status, 'enabled') <> 'disabled')
      into v_webhook_rows, v_webhook_enabled
    from stripe._managed_webhooks w;

    if v_webhook_enabled = 0 and not exists (
      select 1 from audit_log
      where action = 'anomaly_alerted' and entity = 'platform' and meta->>'kind' = 'stripe_managed_webhook_missing'
        and created_at > now() - interval '1 hour'
    ) then
      perform notify_admins('admin', 'Stripe webhook missing',
        case when v_webhook_rows = 0
             then 'stripe._managed_webhooks is empty: no stripe-sync webhook is registered'
             else v_webhook_rows || ' managed webhook(s) registered, all disabled'
        end
        || ', so Stripe events do not reach the mirror and paid orders do not reconcile.'
        || ' Run stripe-setup on this project with its own Stripe key, then check the endpoint in the Stripe dashboard.');
      insert into audit_log (actor_id, action, entity, entity_id, meta)
      values (null, 'anomaly_alerted', 'platform', null,
        jsonb_build_object('kind', 'stripe_managed_webhook_missing', 'rows', v_webhook_rows));
    end if;
  end if;

  -- DESIGN 1.11: card orders were placed but no stripe.* mirror row was written in 24 hours, so the
  -- webhook is silent even if it is registered. Re-alerts at most hourly while the condition persists.
  if not exists (
    select 1 from audit_log
    where action = 'anomaly_alerted' and entity = 'platform' and meta->>'kind' = 'stripe_mirror_stale'
      and created_at > now() - interval '1 hour'
  ) and exists (
    select 1 from orders o
    where o.method = 'card'
      and o.created_at > now() - interval '24 hours'
      and o.created_at <= now() - interval '15 minutes'
  ) then
    for v_mirror_table in
      select c.oid::regclass
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      join pg_catalog.pg_attribute a on a.attrelid = c.oid
      where n.nspname = 'stripe'
        and c.relkind in ('r', 'p')
        and c.relname not like '\_%'
        and c.relname <> 'accounts'
        and a.attname = '_updated_at'
        and not a.attisdropped
      order by c.relname
    loop
      v_mirror_tables := v_mirror_tables + 1;
      execute format('select exists (select 1 from %s where _updated_at > $1)', v_mirror_table)
        into v_mirror_fresh
        using now() - interval '24 hours';
      exit when v_mirror_fresh;
    end loop;

    if v_mirror_tables > 0 and not v_mirror_fresh then
      perform notify_admins('admin', 'Stripe mirror stale',
        'Card orders were placed in the last 24 hours but no stripe.* mirror row was written in that time.'
        || ' The stripe-sync webhook is not delivering: check its endpoint and recent deliveries in the Stripe dashboard.');
      insert into audit_log (actor_id, action, entity, entity_id, meta)
      values (null, 'anomaly_alerted', 'platform', null,
        jsonb_build_object('kind', 'stripe_mirror_stale', 'tables', v_mirror_tables));
    end if;
  end if;
end;
$$;

revoke all on function public.detect_system_health_issues() from public, anon, authenticated;
grant execute on function public.detect_system_health_issues() to service_role;
