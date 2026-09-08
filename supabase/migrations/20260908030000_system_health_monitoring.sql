-- System health monitoring (Launch-Plan.md item 15's remaining half). Money/marketplace
-- metrics are already surfaced via admin_dashboard_metrics(); this covers the
-- infrastructure-health side that's actually observable from inside Postgres:
--
-- 1. Cron job failures -- pg_cron's own cron.job_run_details records whether the
--    scheduled SQL statement itself raised (rare, but real: a missing secret, a syntax
--    error introduced by a bad migration, etc).
-- 2. Outbound HTTP failures from ANY pg_net call (reconcile-payouts, auto-payouts,
--    detect-admin-anomalies, notify_admins' push/email/Slack dispatch, stripe-setup-nudge,
--    ...) -- net._http_response records the real HTTP outcome (status code, timeout),
--    which is the actual signal that a scheduled worker's target Edge Function failed,
--    as opposed to job_run_details which only reflects whether `select net.http_post(...)`
--    was queued without error (it always succeeds at the SQL level regardless of what
--    the HTTP call eventually returns).
--
-- Explicitly NOT covered here, and not attempted: Vercel deploy status and Stripe webhook
-- delivery failures live entirely outside this database. Vercel and Stripe both already
-- have their own native alerting (Vercel deployment notifications, Stripe Dashboard webhook
-- failure emails) -- turning those on costs nothing and needs no code. Building a custom
-- poller for either would mean storing a new external API token as a secret for
-- comparatively little gain over what the platform already offers for free.
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
end;
$$;

revoke all on function public.detect_system_health_issues() from public, anon, authenticated;
grant execute on function public.detect_system_health_issues() to service_role;

do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.unschedule('detect-system-health-issues')
      where exists (select 1 from cron.job where jobname = 'detect-system-health-issues');
    perform cron.schedule(
      'detect-system-health-issues',
      '*/15 * * * *',
      $job$ select public.detect_system_health_issues(); $job$
    );
  end if;
end $$;
