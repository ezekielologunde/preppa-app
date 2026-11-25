-- Web launch task 1.2 (docs/web-launch/DESIGN.md): workers and push resolve the project host from
-- Vault instead of a hardcoded production URL.
--
-- Before this migration, notify()'s push dispatch and six pg_cron workers (stripe-sync-worker,
-- charge-due-cycles, reconcile-payouts, reconcile-cycle-charges, reconcile-booking-balances,
-- auto-payouts) posted to a literal production functions URL, so a test project built from this
-- history would call production. Now every one of them builds its URL at run time from the Vault
-- secret `project_base_url` (value `https://<project-ref>.supabase.co`, no trailing slash) through
-- public.project_function_url(fn), which RAISES when the secret is missing, empty or malformed.
--
-- Loud failure, by design (RED-TEAM-LOOP0 "production-touch / exit-gate gaps"):
-- * Applying this migration on a project with pg_cron RAISES unless `project_base_url` is set and
--   valid, so the migration (one transaction) never lands half-configured. Set the secret first:
--     select vault.create_secret('https://<project-ref>.supabase.co', 'project_base_url');
--   (production: DESIGN 4.2 step 1, by E, before this migration is deployed).
-- * If the secret is later removed, each worker run raises, which cron.job_run_details records as
--   'failed' (picked up by the existing cron_job_failure check), and detect_system_health_issues()
--   now also alerts on the missing secret and on any worker with no successful run in its window.
-- On a fresh local/CI stack (no pg_cron, so no workers are scheduled) the apply-time check is
-- skipped exactly like every other cron.* touch in this history; notify()'s push branch then
-- raises inside its own exception handler, as any push failure always has.
--
-- Jobs are re-registered with cron.schedule(<same name>, ...), which updates an existing job of
-- that name in place (pg_cron upserts on jobname), keeping its jobid and run history so the new
-- "worker not running" check is not fooled by a fresh jobid. Schedules, headers, auth, bodies and
-- timeouts are copied unchanged from each job's latest definition; only the url expression changes.
-- Re-runnable: every function is create or replace and every schedule call is an upsert.

create or replace function public.project_function_url(p_fn text)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_base text;
begin
  if p_fn is null or p_fn !~ '^[a-z0-9][a-z0-9_-]*$' then
    raise exception 'project_function_url: invalid function name';
  end if;

  select decrypted_secret into v_base from vault.decrypted_secrets where name = 'project_base_url';

  if v_base is null or v_base = '' then
    raise exception 'Vault secret project_base_url is missing or empty: set it to https://<project-ref>.supabase.co (no trailing slash) before applying migrations or running workers';
  end if;
  if v_base !~ '^https://[^/[:space:]]+$' then
    raise exception 'Vault secret project_base_url is invalid: it must be https://<project-ref>.supabase.co with no trailing slash, path or whitespace';
  end if;

  return v_base || '/functions/v1/' || p_fn;
end;
$$;

revoke all on function public.project_function_url(text) from public, anon, authenticated;

-- notify(): latest definition (20260808024849_high_fix_notify_push_pass_kind.sql), only the url
-- expression changed. Existing grants are kept by create or replace.
create or replace function public.notify(p_user uuid, p_kind text, p_title text, p_body text default null::text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if p_user is null then return; end if;
  insert into notifications (user_id, kind, title, body) values (p_user, p_kind, p_title, p_body);

  if exists (select 1 from public.push_tokens where user_id = p_user) then
    perform net.http_post(
      url := public.project_function_url('send-push'),
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'stripe_sync_worker_secret'),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('userId', p_user, 'title', p_title, 'body', p_body, 'kind', p_kind)
    );
  end if;
exception when others then
  null; -- never let a notification failure break the caller
end $function$;

-- detect_system_health_issues(): latest definition (20260908030000_system_health_monitoring.sql)
-- with two checks added after the existing ones, in the same issue-row shape (notify_admins plus an
-- audit_log 'anomaly_alerted' row keyed by meta.kind, deduped over 15 minutes):
-- 3. project_base_url missing or invalid (kind 'project_base_url_missing').
-- 4. a worker with no successful run in its window (kind 'worker_not_running'). The five
--    sub-five-minute workers must have succeeded in the last 15 minutes. auto-payouts runs weekly
--    (Mondays 14:00 UTC) and prune_cron_job_run_details keeps only 3 days of history, so it is
--    checked only between 1 hour and 2 days after its latest scheduled run, for a success since then.
--    A job missing from cron.job counts as not running.
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
end;
$$;

revoke all on function public.detect_system_health_issues() from public, anon, authenticated;
grant execute on function public.detect_system_health_issues() to service_role;

do $$
begin
  if to_regnamespace('cron') is not null then
    -- Apply-time check: RAISES (rolling back this whole migration) unless project_base_url is set
    -- and valid. Replaces the old silent skip for a missing host.
    perform public.project_function_url('send-push');

    perform cron.schedule(
      'stripe-sync-worker',
      '*/1 * * * *',
      $job$
        SELECT net.http_post(
          url := public.project_function_url('stripe-worker'),
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'stripe_sync_worker_secret')
          ),
          timeout_milliseconds := 15000
        )
        WHERE NOT EXISTS (
          SELECT 1 FROM vault.decrypted_secrets
          WHERE name = 'stripe_sync_skip_until'
            AND decrypted_secret::timestamptz > NOW()
        )
      $job$
    );

    perform cron.schedule(
      'charge-due-cycles',
      '1,6,11,16,21,26,31,36,41,46,51,56 * * * *',
      $job$
        select net.http_post(
          url := public.project_function_url('charge-due-cycles'),
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='stripe_sync_worker_secret'),
            'Content-Type', 'application/json'),
          body := '{}'::jsonb,
          timeout_milliseconds := 15000
        )
        where exists (select 1 from vault.decrypted_secrets where name='stripe_sync_worker_secret');
      $job$
    );

    perform cron.schedule(
      'reconcile-payouts',
      '3,8,13,18,23,28,33,38,43,48,53,58 * * * *',
      $job$
        select net.http_post(
          url := public.project_function_url('reconcile-payouts'),
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'stripe_sync_worker_secret'),
            'Content-Type', 'application/json'),
          body := '{}'::jsonb,
          timeout_milliseconds := 15000
        )
        where exists (select 1 from vault.decrypted_secrets where name = 'stripe_sync_worker_secret');
      $job$
    );

    perform cron.schedule(
      'reconcile-cycle-charges',
      '4,9,14,19,24,29,34,39,44,49,54,59 * * * *',
      $job$
        select net.http_post(
          url := public.project_function_url('reconcile-cycle-charges'),
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'stripe_sync_worker_secret'),
            'Content-Type', 'application/json'),
          body := '{}'::jsonb,
          timeout_milliseconds := 15000
        ) where exists (select 1 from vault.decrypted_secrets where name = 'stripe_sync_worker_secret');
      $job$
    );

    perform cron.schedule(
      'reconcile-booking-balances',
      '2,7,12,17,22,27,32,37,42,47,52,57 * * * *',
      $job$
        select net.http_post(
          url := public.project_function_url('reconcile-booking-balances'),
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'stripe_sync_worker_secret'),
            'Content-Type', 'application/json'),
          body := '{}'::jsonb,
          timeout_milliseconds := 15000
        ) where exists (select 1 from vault.decrypted_secrets where name = 'stripe_sync_worker_secret');
      $job$
    );

    perform cron.schedule(
      'auto-payouts',
      '0 14 * * 1', -- Mondays 14:00 UTC
      $job$
        select net.http_post(
          url := public.project_function_url('auto-payouts'),
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'stripe_sync_worker_secret'),
            'Content-Type', 'application/json'),
          body := '{}'::jsonb
        )
        where exists (select 1 from vault.decrypted_secrets where name = 'stripe_sync_worker_secret');
      $job$
    );
  end if;
end $$;
