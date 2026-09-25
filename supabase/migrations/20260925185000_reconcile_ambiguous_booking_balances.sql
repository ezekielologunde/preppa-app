-- Preserve and reconcile RFQ balance charges whose Stripe response is ambiguous.
alter table public.bookings
  add column if not exists balance_charge_status text not null default 'unpaid',
  add column if not exists balance_charge_ambiguous_at timestamptz,
  add column if not exists balance_charge_reconcile_checked_at timestamptz,
  add column if not exists balance_charge_reconcile_attempts integer not null default 0;

update public.bookings
   set balance_charge_status = 'paid'
 where balance_pi_id is not null and balance_charge_status <> 'paid';

alter table public.bookings drop constraint if exists bookings_balance_charge_status_check;
alter table public.bookings add constraint bookings_balance_charge_status_check
  check (balance_charge_status in ('unpaid', 'charging', 'ambiguous', 'paid', 'failed'));

create index if not exists bookings_ambiguous_balance_charge_idx
  on public.bookings (balance_charge_ambiguous_at)
  where balance_charge_status = 'ambiguous' and balance_pi_id is null;

create or replace function public.reserve_balance_charge(p_booking_id uuid)
returns table(booking_id uuid, balance_cents int, stripe_customer_id text)
language plpgsql security definer set search_path to 'public' as $body$
declare
  v_booking public.bookings%rowtype;
  v_owner uuid;
  v_customer_stripe text;
begin
  perform pg_advisory_xact_lock(hashtext('balance_charge:' || p_booking_id::text));

  select b.* into v_booking
  from public.bookings b where b.id = p_booking_id;

  if v_booking.id is null then
    raise exception 'Booking not found.' using errcode = 'P0020';
  end if;
  select k.owner_id into v_owner from public.kitchens k where k.id = v_booking.kitchen_id;
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role'
     and v_booking.customer_id is distinct from auth.uid() and v_owner is distinct from auth.uid() then
    raise exception 'Not your booking.' using errcode = '42501';
  end if;
  if v_booking.booking_kind <> 'rfq' then
    raise exception 'This booking type has no separate balance.' using errcode = 'P0023';
  end if;
  if v_booking.status not in ('confirmed', 'in_progress') then
    raise exception 'This booking is not ready to be completed.' using errcode = 'P0021';
  end if;
  if v_booking.balance_pi_id is not null or v_booking.balance_charge_status = 'paid' then
    raise exception 'Balance already charged.' using errcode = 'P0022';
  end if;
  if v_booking.balance_charge_status in ('charging', 'ambiguous') then
    raise exception 'Balance charge confirmation is already pending.' using errcode = 'P0025';
  end if;
  if coalesce(v_booking.balance_cents, 0) <= 0 then
    raise exception 'No balance owed.' using errcode = 'P0024';
  end if;

  update public.bookings
     set balance_charge_status = 'charging',
         balance_charge_ambiguous_at = null,
         balance_charge_reconcile_checked_at = null,
         balance_charge_reconcile_attempts = 0
   where id = p_booking_id;

  select p.stripe_customer_id into v_customer_stripe
  from public.profiles p where p.id = v_booking.customer_id;

  booking_id := p_booking_id;
  balance_cents := v_booking.balance_cents;
  stripe_customer_id := v_customer_stripe;
  return next;
end;
$body$;

create or replace function public.finalize_balance_charge(p_booking_id uuid, p_stripe_pi_id text, p_success boolean)
returns void language plpgsql security definer set search_path to 'public' as $body$
declare
  v_booking public.bookings%rowtype;
  v_stripe_fee int;
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'finalize_balance_charge is service_role only';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then return; end if;

  if p_success then
    update public.bookings
       set balance_pi_id = p_stripe_pi_id,
           balance_charge_status = 'paid',
           status = 'completed',
           completed_at = coalesce(completed_at, now())
     where id = p_booking_id and balance_pi_id is null
       and balance_charge_status in ('charging', 'ambiguous');

    if found and coalesce(v_booking.balance_cents, 0) > 0
       and not exists (select 1 from public.ledger_entries where booking_id = p_booking_id and kind = 'sale' and memo like 'Balance payment%') then
      insert into public.ledger_entries (kitchen_id, booking_id, kind, amount_cents, memo)
        values (v_booking.kitchen_id, p_booking_id, 'sale', v_booking.balance_cents, 'Balance payment ' || left(p_booking_id::text, 8));
      v_stripe_fee := round(v_booking.balance_cents * 0.029)::int + 30;
      insert into public.ledger_entries (kitchen_id, booking_id, kind, amount_cents, memo)
        values (v_booking.kitchen_id, p_booking_id, 'fee', -v_stripe_fee, 'Stripe processing fee ' || left(p_booking_id::text, 8));
    end if;
  else
    update public.bookings
       set balance_charge_status = 'failed',
           status = 'completed',
           completed_at = coalesce(completed_at, now())
     where id = p_booking_id and balance_pi_id is null
       and balance_charge_status in ('charging', 'ambiguous');
  end if;
end;
$body$;

create or replace function public.mark_balance_charge_ambiguous(p_booking_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  update public.bookings
     set balance_charge_status = 'ambiguous',
         balance_charge_ambiguous_at = coalesce(balance_charge_ambiguous_at, now())
   where id = p_booking_id and balance_charge_status = 'charging' and balance_pi_id is null;
end $$;

create or replace function public.claim_ambiguous_balance_charges(
  p_min_age interval default interval '10 minutes', p_limit integer default 50
)
returns table(booking_id uuid, balance_cents integer, stripe_customer_id text,
              ambiguous_at timestamptz, reconcile_attempts integer)
language plpgsql security definer set search_path to 'public' as $$
begin
  return query
  with claimed as (
    select b.id from public.bookings b
    where b.balance_charge_status = 'ambiguous' and b.balance_pi_id is null
      and b.balance_charge_ambiguous_at < now() - p_min_age
      and (b.balance_charge_reconcile_checked_at is null or b.balance_charge_reconcile_checked_at < now() - p_min_age)
    order by b.balance_charge_ambiguous_at
    limit greatest(1, least(coalesce(p_limit, 50), 200))
    for update skip locked
  ), bumped as (
    update public.bookings b
       set balance_charge_reconcile_checked_at = now(),
           balance_charge_reconcile_attempts = b.balance_charge_reconcile_attempts + 1
      from claimed c where b.id = c.id
    returning b.id, b.customer_id, b.balance_cents, b.balance_charge_ambiguous_at, b.balance_charge_reconcile_attempts
  )
  select x.id, x.balance_cents, p.stripe_customer_id, x.balance_charge_ambiguous_at, x.balance_charge_reconcile_attempts
  from bumped x join public.profiles p on p.id = x.customer_id;
end $$;

create or replace function public.flag_ambiguous_balance_charge(p_booking_id uuid, p_reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  update public.bookings
     set balance_charge_status = 'ambiguous'
   where id = p_booking_id and balance_pi_id is null;
  if found then
    perform public.notify_admins('admin', 'Booking balance charge needs review',
      'Booking ' || p_booking_id::text || ' needs review: ' || left(coalesce(p_reason, 'unknown'), 120));
  end if;
end $$;

revoke all on function public.reserve_balance_charge(uuid) from public, anon, authenticated;
revoke all on function public.finalize_balance_charge(uuid,text,boolean) from public, anon, authenticated;
revoke all on function public.mark_balance_charge_ambiguous(uuid) from public, anon, authenticated;
revoke all on function public.claim_ambiguous_balance_charges(interval,integer) from public, anon, authenticated;
revoke all on function public.flag_ambiguous_balance_charge(uuid,text) from public, anon, authenticated;
grant execute on function public.reserve_balance_charge(uuid) to service_role;
grant execute on function public.finalize_balance_charge(uuid,text,boolean) to service_role;
grant execute on function public.mark_balance_charge_ambiguous(uuid) to service_role;
grant execute on function public.claim_ambiguous_balance_charges(interval,integer) to service_role;
grant execute on function public.flag_ambiguous_balance_charge(uuid,text) to service_role;

do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.unschedule('reconcile-booking-balances')
      where exists (select 1 from cron.job where jobname = 'reconcile-booking-balances');
    perform cron.schedule(
      'reconcile-booking-balances',
      '2,7,12,17,22,27,32,37,42,47,52,57 * * * *',
      $job$
        select net.http_post(
          url := 'https://fwidhpzwldneeaphrxgg.supabase.co/functions/v1/reconcile-booking-balances',
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'stripe_sync_worker_secret'),
            'Content-Type', 'application/json'),
          body := '{}'::jsonb,
          timeout_milliseconds := 15000
        ) where exists (select 1 from vault.decrypted_secrets where name = 'stripe_sync_worker_secret');
      $job$
    );
  end if;
end $$;
