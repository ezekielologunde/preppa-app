-- Closes a real gap: RFQ bookings (cook-at-home, private dinner, catering, consultation,
-- cooking-class requests) only ever collected a deposit via Stripe. bookings.balance_cents
-- existed as a column but accept_quote() never populated it, and no code path anywhere
-- charged it -- per src/lib/services.ts's own doc-comment, "the balance is settled offline."
-- That's not a designed pay-later feature, it's an unbuilt one: no second PaymentIntent, no
-- balance-collection function, nothing tracked once the deposit cleared.
--
-- This adds:
--   1. bookings.balance_pi_id -- mirrors deposit_pi_id, tracks the balance charge once made.
--   2. accept_quote() now populates balance_cents at insert time (amount_cents - deposit_cents,
--      i.e. the cook's originally-quoted amount minus their originally-quoted deposit -- the
--      platform's whole service fee is already front-loaded into the deposit per the existing
--      math, so the balance is 100% the cook's, minus only Stripe's processing fee on collection).
--   3. reserve_balance_charge()/finalize_balance_charge() -- the same two-phase advisory-lock
--      pattern as reserve_payout()/finalize_payout(), so a double-tap or retry can't double-charge.
--   4. complete-booking (deployed separately) calls these to collect the balance via an
--      off-session charge (same off_session/confirm pattern charge-due-cycles already uses)
--      when either party marks an RFQ booking complete. A declined/failed charge does not
--      block completion -- the job already happened -- it's just flagged back to the caller.

alter table public.bookings add column if not exists balance_pi_id text;

-- ---------------------------------------------------------------------------------------
-- accept_quote(): identical to the live version except for the two lines adding v_balance
-- and including balance_cents in the INSERT. Everything else (locking, idempotency, quote
-- expiry, payout-gating, kitchen-verification check) is unchanged from the live definition.
-- ---------------------------------------------------------------------------------------
create or replace function public.accept_quote(p_quote_id uuid)
returns table(booking_id uuid, out_request_id uuid, out_kitchen_id uuid, amount_cents integer, deposit_cents integer, service_fee_cents integer, event_date date, address_text text, lat double precision, lng double precision, reused boolean)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_quote record;
  v_request record;
  v_idem text;
  v_existing record;
  v_booking_id uuid;
  v_service_fee integer;
  v_deposit integer;
  v_total integer;
  v_balance integer;
  v_is_member boolean;
  v_kitchen_status verification_status;
begin
  select id, request_id, kitchen_id, amount_cents, deposit_cents, status
    into v_quote from quotes where id = p_quote_id;
  if v_quote.id is null then
    raise exception 'Quote not found.' using errcode = 'P0010';
  end if;

  select id, customer_id, event_date, address_text, lat, lng
    into v_request from service_requests where id = v_quote.request_id;
  if v_request.id is null or v_request.customer_id <> auth.uid() then
    raise exception 'Not your request.' using errcode = '42501';
  end if;

  v_idem := 'bk_' || p_quote_id::text;

  select id, amount_cents, deposit_cents, service_fee_cents, request_id, kitchen_id,
         event_date, address_text, lat, lng
    into v_existing from bookings where idempotency_key = v_idem;
  if v_existing.id is not null then
    booking_id := v_existing.id; out_request_id := v_existing.request_id; out_kitchen_id := v_existing.kitchen_id;
    amount_cents := v_existing.amount_cents; deposit_cents := v_existing.deposit_cents;
    service_fee_cents := v_existing.service_fee_cents; event_date := v_existing.event_date;
    address_text := v_existing.address_text; lat := v_existing.lat; lng := v_existing.lng;
    reused := true;
    return next;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('accept_quote:' || v_quote.request_id::text));

  select status into v_quote.status from quotes where id = p_quote_id;
  if v_quote.status <> 'pending' then
    raise exception 'This quote can no longer be accepted.' using errcode = 'P0011';
  end if;

  if exists (
    select 1 from bookings b
    where b.request_id = v_quote.request_id and b.booking_kind = 'rfq' and b.status <> 'cancelled'
  ) then
    raise exception 'This request already has an active booking.' using errcode = 'P0012';
  end if;

  select verification_status into v_kitchen_status from kitchens where id = v_quote.kitchen_id;
  if v_kitchen_status is distinct from 'verified' then
    raise exception 'This cook is not accepting bookings right now.' using errcode = 'P0015';
  end if;

  if not public.kitchen_payouts_enabled(v_quote.kitchen_id) then
    raise exception 'This cook has not finished payout setup yet.' using errcode = 'P0013';
  end if;

  select public.is_prepplus_member(auth.uid()) into v_is_member;
  v_service_fee := round(v_quote.amount_cents * (case when v_is_member then 0 else 1500 end) / 10000.0);
  v_deposit := v_quote.deposit_cents + v_service_fee;
  v_total := v_quote.amount_cents + v_service_fee;
  v_balance := v_quote.amount_cents - v_quote.deposit_cents;

  insert into bookings (
    request_id, quote_id, kitchen_id, customer_id, amount_cents, deposit_cents, balance_cents, service_fee_cents,
    status, booking_kind, event_date, idempotency_key, address_text, lat, lng
  ) values (
    v_quote.request_id, p_quote_id, v_quote.kitchen_id, auth.uid(), v_total, v_deposit, v_balance, v_service_fee,
    'pending_deposit', 'rfq', v_request.event_date, v_idem, v_request.address_text, v_request.lat, v_request.lng
  ) returning id into v_booking_id;

  update quotes set status = 'accepted' where id = p_quote_id;
  update quotes set status = 'expired' where request_id = v_quote.request_id and id <> p_quote_id and status = 'pending';

  booking_id := v_booking_id; out_request_id := v_quote.request_id; out_kitchen_id := v_quote.kitchen_id;
  amount_cents := v_total; deposit_cents := v_deposit; service_fee_cents := v_service_fee;
  event_date := v_request.event_date; address_text := v_request.address_text; lat := v_request.lat; lng := v_request.lng;
  reused := false;
  return next;
end;
$function$;

-- ---------------------------------------------------------------------------------------
-- reserve_balance_charge(): called with the caller's own JWT (relies on auth.uid() for the
-- ownership check, same requirement as reserve_payout/accept_quote). Advisory-locks the
-- booking, verifies the caller is the customer or the cook, that it's an RFQ booking in a
-- completable state with an unpaid positive balance, and returns what the Edge Function
-- needs to actually charge it. Does NOT touch Stripe or mutate the booking -- that's
-- finalize_balance_charge's job, after the real Stripe call either succeeds or fails.
-- ---------------------------------------------------------------------------------------
create or replace function public.reserve_balance_charge(p_booking_id uuid)
returns table(booking_id uuid, balance_cents int, stripe_customer_id text)
language plpgsql
security definer
set search_path to 'public'
as $body$
declare
  v_owner uuid;
  v_status booking_status;
  v_balance int;
  v_balance_pi text;
  v_kind text;
  v_customer uuid;
  v_customer_stripe text;
begin
  select b.customer_id, b.status, b.balance_cents, b.balance_pi_id, b.booking_kind, k.owner_id
    into v_customer, v_status, v_balance, v_balance_pi, v_kind, v_owner
  from bookings b join kitchens k on k.id = b.kitchen_id
  where b.id = p_booking_id;

  if v_customer is null then
    raise exception 'Booking not found.' using errcode = 'P0020';
  end if;
  if v_customer <> auth.uid() and v_owner <> auth.uid() then
    raise exception 'Not your booking.' using errcode = '42501';
  end if;
  if v_kind <> 'rfq' then
    raise exception 'This booking type has no separate balance.' using errcode = 'P0023';
  end if;
  if v_status not in ('confirmed', 'in_progress') then
    raise exception 'This booking is not ready to be completed.' using errcode = 'P0021';
  end if;

  perform pg_advisory_xact_lock(hashtext('balance_charge:' || p_booking_id::text));

  -- re-read under lock -- a concurrent call may have already completed/charged it
  select status, balance_cents, balance_pi_id into v_status, v_balance, v_balance_pi
    from bookings where id = p_booking_id;
  if v_status not in ('confirmed', 'in_progress') then
    raise exception 'This booking is not ready to be completed.' using errcode = 'P0021';
  end if;
  if v_balance_pi is not null then
    raise exception 'Balance already charged.' using errcode = 'P0022';
  end if;
  if coalesce(v_balance, 0) <= 0 then
    raise exception 'No balance owed.' using errcode = 'P0024';
  end if;

  select stripe_customer_id into v_customer_stripe from profiles where id = v_customer;

  booking_id := p_booking_id;
  balance_cents := v_balance;
  stripe_customer_id := v_customer_stripe;
  return next;
end;
$body$;

revoke all on function public.reserve_balance_charge(uuid) from public, anon;
grant execute on function public.reserve_balance_charge(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------
-- finalize_balance_charge(): service_role-only (never client-callable directly), mirroring
-- finalize_payout's security posture. Records the real Stripe outcome. On success, credits
-- the cook the FULL balance (no additional platform fee -- the 15% service fee was already
-- taken out of the deposit at accept_quote time) minus only Stripe's processing fee, matching
-- the same fee-deduction pattern reconcile_paid_pi already uses for orders/cycles/deposits.
-- On failure, the booking still moves to completed (the job happened; payment failure
-- doesn't undo that) but balance_pi_id stays null so it can be retried.
-- ---------------------------------------------------------------------------------------
create or replace function public.finalize_balance_charge(p_booking_id uuid, p_stripe_pi_id text, p_success boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $body$
declare
  v_booking public.bookings%rowtype;
  v_stripe_fee int;
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'finalize_balance_charge is service_role only';
  end if;

  select * into v_booking from bookings where id = p_booking_id;
  if v_booking.id is null then
    return;
  end if;

  if p_success then
    update bookings
       set balance_pi_id = p_stripe_pi_id, status = 'completed', completed_at = coalesce(completed_at, now())
     where id = p_booking_id and balance_pi_id is null;

    if found and coalesce(v_booking.balance_cents, 0) > 0
       and not exists (select 1 from ledger_entries where booking_id = p_booking_id and kind = 'sale' and memo like 'Balance payment%') then
      insert into ledger_entries (kitchen_id, booking_id, kind, amount_cents, memo)
        values (v_booking.kitchen_id, p_booking_id, 'sale', v_booking.balance_cents, 'Balance payment ' || left(p_booking_id::text, 8));
      v_stripe_fee := round(v_booking.balance_cents * 0.029)::int + 30;
      insert into ledger_entries (kitchen_id, booking_id, kind, amount_cents, memo)
        values (v_booking.kitchen_id, p_booking_id, 'fee', -v_stripe_fee, 'Stripe processing fee ' || left(p_booking_id::text, 8));
    end if;
  else
    update bookings
       set status = 'completed', completed_at = coalesce(completed_at, now())
     where id = p_booking_id and status in ('confirmed', 'in_progress');
  end if;
end;
$body$;

revoke all on function public.finalize_balance_charge(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.finalize_balance_charge(uuid, text, boolean) to service_role;
