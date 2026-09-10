-- Follow-up to 20260910050000: that migration offset detect-admin-anomalies/
-- detect-system-health-issues to 7,22,37,52 and assumed the */5+*/1 job cluster itself was
-- innocent ("All of those jobs' own runs succeeded both times"). Two more real
-- "[Preppa admin] Outbound request failures" alerts fired today AFTER that fix was live
-- (2026-09-10 17:07 UTC, count 2; 2026-09-10 18:52 UTC, count 1), with the detect-* jobs
-- confirmed absent from cron.job_run_details at the actual failure instants (17:00:00,
-- 17:05:00, 18:40:00 UTC) -- so the 20260910050000 diagnosis was incomplete, not wrong about
-- what it fixed, just not the whole story. Correcting the record here rather than leaving the
-- prior migration's comment as the final word -- see [[Decisions]].
--
-- Root cause, this time confirmed by checking which of the *5-minute-cluster* jobs actually
-- issue net.http_post (pg_get_functiondef on advance_cycles/reap_experience_holds shows
-- neither makes an HTTP call -- they're pure SQL/plpgsql). Only three jobs dispatch HTTP:
-- charge-due-cycles, reconcile-payouts (both */5, both landing on :00/:05/:10...) and
-- stripe-sync-worker (*/1, so unavoidably present on every tick). That's 3 concurrent
-- net.http_post calls at the exact same instant every 5 minutes -- still enough to
-- occasionally exceed the 5000ms default timeout under pg_net contention.
--
-- Fix, two parts:
-- 1. Stagger charge-due-cycles and reconcile-payouts off each other (they can't be moved off
--    stripe-sync-worker, which runs every single minute) -- cuts peak concurrent dispatch
--    from 3 to 2. Offsets 1 and 3 chosen to also stay clear of the detect-* jobs' :x2/:x7 marks.
-- 2. Raise timeout_milliseconds 5000 -> 15000 on all three dispatch calls. None of these three
--    are user-facing/latency-sensitive (background reconciliation sweeps and a poll worker) --
--    a slower response is fine, a false-positive timeout alert on a call that would have
--    succeeded given 200ms more is not.
do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.unschedule('charge-due-cycles')
      where exists (select 1 from cron.job where jobname = 'charge-due-cycles');
    perform cron.schedule(
      'charge-due-cycles',
      '1,6,11,16,21,26,31,36,41,46,51,56 * * * *',
      $job$
        select net.http_post(
          url := 'https://fwidhpzwldneeaphrxgg.supabase.co/functions/v1/charge-due-cycles',
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='stripe_sync_worker_secret'),
            'Content-Type', 'application/json'),
          body := '{}'::jsonb,
          timeout_milliseconds := 15000
        )
        where exists (select 1 from vault.decrypted_secrets where name='stripe_sync_worker_secret');
      $job$
    );

    perform cron.unschedule('reconcile-payouts')
      where exists (select 1 from cron.job where jobname = 'reconcile-payouts');
    perform cron.schedule(
      'reconcile-payouts',
      '3,8,13,18,23,28,33,38,43,48,53,58 * * * *',
      $job$
        select net.http_post(
          url := 'https://fwidhpzwldneeaphrxgg.supabase.co/functions/v1/reconcile-payouts',
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'stripe_sync_worker_secret'),
            'Content-Type', 'application/json'),
          body := '{}'::jsonb,
          timeout_milliseconds := 15000
        )
        where exists (select 1 from vault.decrypted_secrets where name = 'stripe_sync_worker_secret');
      $job$
    );

    perform cron.unschedule('stripe-sync-worker')
      where exists (select 1 from cron.job where jobname = 'stripe-sync-worker');
    perform cron.schedule(
      'stripe-sync-worker',
      '*/1 * * * *',
      $job$
        SELECT net.http_post(
          url := 'https://fwidhpzwldneeaphrxgg.supabase.co/functions/v1/stripe-worker',
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
  end if;
end $$;
