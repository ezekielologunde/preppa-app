-- E3a: reap abandoned experience holds. A pending_deposit experience booking older than 20min
-- with NO settled/processing PaymentIntent is cancelled + its seat holds released (the lazy
-- availability exclusion already frees seats immediately; this finalizes status + releases rows).
-- The succeeded/processing guard prevents cancelling a booking whose payment actually landed.
create or replace function reap_experience_holds() returns int language plpgsql security definer set search_path to 'public' as $$
declare ids uuid[];
begin
  select array_agg(b.id) into ids from bookings b
  where b.booking_kind = 'experience' and b.status = 'pending_deposit'
    and b.created_at < now() - interval '20 minutes'
    and not exists (select 1 from stripe.payment_intents pi
                    where pi.metadata->>'booking_id' = b.id::text and pi.status in ('succeeded','processing'));
  if ids is null then return 0; end if;
  update bookings set status = 'cancelled', cancelled_at = now() where id = any(ids);
  update experience_seat_reservations set released_at = now() where booking_id = any(ids) and released_at is null;
  return array_length(ids, 1);
end $$;

revoke all on function reap_experience_holds() from public, anon, authenticated;
grant execute on function reap_experience_holds() to service_role;

-- run every 5 minutes (pure SQL, no Stripe call needed). pg_cron is a hosted-project
-- extension (enabled via the dashboard) not present on a fresh local/self-hosted
-- stack -- guard so this migration replays cleanly there.
do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.unschedule('reap-experience-holds') where exists (select 1 from cron.job where jobname = 'reap-experience-holds');
    perform cron.schedule('reap-experience-holds', '*/5 * * * *', 'select reap_experience_holds()');
  end if;
end $$;
