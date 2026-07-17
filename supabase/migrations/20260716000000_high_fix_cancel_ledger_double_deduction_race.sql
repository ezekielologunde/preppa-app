-- Fixes a real, audit-flagged (AUDIT.md "extended follow-on audit") money-integrity race:
-- cancel-booking's refund ledger entry was written with NO advisory lock and NO dedupe guard --
-- Stripe's refund call is idempotency-keyed (so Stripe itself only refunds once), but two
-- concurrent cancel-booking calls on the same booking (double-tap, or a client retry racing a
-- slow first request) can both pass the un-locked `status in (...)` check before either writes,
-- both get the same de-duped Stripe refund back, and each independently INSERT its own `-cookCredit`
-- ledger row -- silently double-deducting the cook's balance for a single real refund.
--
-- finalize_experience_cancel() (the equivalent function for experience bookings, called by
-- cancel-experience-booking/cancel-experience-session) has the exact same bug: it already has a
-- `status in ('cancelled','refunded') then return` guard, but that guard runs with no lock, so
-- two concurrent calls both read the pre-cancel status and both pass it before either commits.
--
-- Fix, mirroring the reserve_payout/reserve_balance_charge pattern already used in this codebase:
-- acquire pg_advisory_xact_lock(hashtext(...)) BEFORE the status read, not after -- this fully
-- serializes the read-check-write sequence per booking id. A second concurrent caller blocks on
-- the lock until the first transaction commits, then re-reads and correctly no-ops against the
-- now-'refunded'/'cancelled' status via the existing guard.

-- finalize_experience_cancel: same body as live, plus the lock moved to the very first line.
create or replace function public.finalize_experience_cancel(p_booking uuid, p_refunded_cents integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare b bookings; v_credited int;
begin
  perform pg_advisory_xact_lock(hashtext('cancel_booking:' || p_booking::text));
  select * into b from bookings where id = p_booking and booking_kind = 'experience';
  if b.id is null then raise exception 'booking not found'; end if;
  if b.status in ('cancelled','refunded') then return; end if;
  if p_refunded_cents > 0 then
    select coalesce(sum(amount_cents),0) into v_credited from ledger_entries where booking_id = p_booking and kind in ('sale','fee','tip');
    if v_credited <> 0 then
      insert into ledger_entries(kitchen_id, booking_id, kind, amount_cents, memo)
        values (b.kitchen_id, p_booking, 'refund', -v_credited, 'Experience refund '||left(p_booking::text,8));
    end if;
    update experience_seat_reservations set released_at = now() where booking_id = p_booking and released_at is null;
    update bookings set status = 'refunded', cancelled_at = now() where id = p_booking;
    perform notify_experience_waitlist(b.session_id);
  else
    update bookings set status = 'cancelled', cancelled_at = now() where id = p_booking;
  end if;
end $function$;

-- finalize_booking_cancel: the same locked, idempotent pattern for regular (rfq) bookings --
-- cancel-booking currently does its ledger insert + status update inline in the Edge Function
-- with no Postgres-side guard at all; this centralizes it the same way finalize_experience_cancel
-- already centralizes it for experience bookings. Cook credit math (deposit minus the service fee
-- already taken at accept_quote time) matches cancel-booking's existing inline calculation exactly.
create or replace function public.finalize_booking_cancel(p_booking_id uuid, p_refunded boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $body$
declare
  b bookings%rowtype;
  v_cook_credit int;
begin
  perform pg_advisory_xact_lock(hashtext('cancel_booking:' || p_booking_id::text));
  select * into b from bookings where id = p_booking_id and booking_kind = 'rfq';
  if b.id is null then raise exception 'booking not found'; end if;
  if b.status in ('cancelled','refunded') then return; end if;

  if p_refunded then
    v_cook_credit := greatest(coalesce(b.deposit_cents, 0) - coalesce(b.service_fee_cents, 0), 0);
    if v_cook_credit > 0 then
      insert into ledger_entries (kitchen_id, booking_id, kind, amount_cents, memo)
        values (b.kitchen_id, p_booking_id, 'refund', -v_cook_credit, 'Booking refund ' || left(p_booking_id::text, 8));
    end if;
    update bookings set status = 'refunded', cancelled_at = now() where id = p_booking_id;
  else
    update bookings set status = 'cancelled', cancelled_at = now() where id = p_booking_id;
  end if;
end;
$body$;

revoke all on function public.finalize_booking_cancel(uuid, boolean) from public, anon, authenticated;
grant execute on function public.finalize_booking_cancel(uuid, boolean) to service_role;
