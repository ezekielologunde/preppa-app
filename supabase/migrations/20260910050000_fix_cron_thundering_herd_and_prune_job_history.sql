-- Fixes a real incident: two "[Preppa admin] Outbound request failures" alerts fired
-- 2026-09-09 16:00 and 16:15 UTC (a genuine pg_net "Timeout of 5000 ms reached"). Root-caused
-- by reading cron.job_run_details directly rather than guessing:
--
-- 1. detect-admin-anomalies and detect-system-health-issues were both scheduled '*/15 * * * *',
--    landing on the exact same tick as four other jobs already scheduled '*/5 * * * *'
--    (advance-cycles, charge-due-cycles, reap-experience-holds, reconcile-payouts) plus
--    stripe-sync-worker's every-minute run -- up to 6 jobs firing net.http_post calls in the
--    same instant every 15 minutes. All of those jobs' own runs succeeded both times
--    (confirmed in cron.job_run_details); the timeout landed on one of notify_admins()'s own
--    dispatch calls getting queued behind the burst, not a real business-logic failure.
--    Fix: offset both detection jobs to minutes 7/22/37/52, clear of every */5 and */1 job.
--
-- 2. cron.job_run_details has accumulated 112,000+ rows since 2026-07-07 with zero retention
--    (pg_cron does not prune this table itself -- a documented gotcha, not a Preppa-specific
--    bug). detect_system_health_issues() queries it every run; an index would be the normal
--    fix but the project role does not own the table (confirmed: `must be owner of table
--    job_run_details`), so pruning old rows is the only fix available at this privilege level.
--    Adds a daily cleanup job -- good hygiene regardless of whether it was the primary cause
--    of the timeout above.
create or replace function public.prune_cron_job_run_details(p_days int default 3)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if to_regnamespace('cron') is null then
    return; -- guarded no-op locally/CI, matching every other cron.* touch in this codebase
  end if;
  delete from cron.job_run_details where start_time < now() - (greatest(1, coalesce(p_days, 3)) || ' days')::interval;
end;
$$;

revoke all on function public.prune_cron_job_run_details(int) from public, anon, authenticated;
grant execute on function public.prune_cron_job_run_details(int) to service_role;

do $$
begin
  if to_regnamespace('cron') is not null then
    -- Re-align the two detection jobs off the every-5-minute/every-minute jobs' tick.
    perform cron.unschedule('detect-admin-anomalies')
      where exists (select 1 from cron.job where jobname = 'detect-admin-anomalies');
    perform cron.schedule('detect-admin-anomalies', '7,22,37,52 * * * *', $job$ select public.detect_admin_anomalies(); $job$);

    perform cron.unschedule('detect-system-health-issues')
      where exists (select 1 from cron.job where jobname = 'detect-system-health-issues');
    perform cron.schedule('detect-system-health-issues', '7,22,37,52 * * * *', $job$ select public.detect_system_health_issues(); $job$);

    perform cron.unschedule('prune-cron-job-run-details')
      where exists (select 1 from cron.job where jobname = 'prune-cron-job-run-details');
    perform cron.schedule('prune-cron-job-run-details', '30 3 * * *', $job$ select public.prune_cron_job_run_details(3); $job$);
  end if;
end $$;
