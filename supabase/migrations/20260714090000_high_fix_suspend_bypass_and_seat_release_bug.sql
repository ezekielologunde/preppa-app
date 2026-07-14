-- Fixes 5 findings from a read-only security re-audit run immediately after the Critical
-- and High fix batches (PR #1, #5) were merged and deployed:
--
-- 1. reserve_payout() checked only kitchens.owner_id, never verification_status -- a
--    suspended kitchen with an existing Stripe Connect account could still cash out its
--    full ledger balance via connect-payout. admin_suspend_kitchen() never touched
--    stripe_accounts, so payouts_enabled stayed true after suspension.
-- 2. plans_owner_write RLS policy authorized by kitchens.owner_id only -- any authenticated
--    user with a pending/rejected/suspended kitchens row could INSERT/UPDATE plans directly
--    via the REST API, bypassing plan-upsert's payouts_enabled gate entirely.
-- 3. submit-quote (Edge Function) authorized by kitchens.owner_id only -- a suspended
--    kitchen could still submit new paid-service quotes.
-- 4. accept_quote() checked kitchen_payouts_enabled but not verification_status -- a
--    suspended kitchen that still has payouts_enabled=true could have a pending quote
--    accepted and paid.
-- 5. release_experience_seats() is SECURITY DEFINER with EXECUTE granted to `authenticated`
--    and NO ownership check in its body at all -- any logged-in user could call it directly
--    to release ANY other user's confirmed experience-booking seat reservation. Both real
--    call sites (cancel-experience-booking, cancel-experience-session) already use the
--    service-role admin client, so restricting this to service_role breaks nothing real.

-- (1) reserve_payout: suspension must actually stop payout capability.
create or replace function public.reserve_payout(p_kitchen_id uuid)
returns table(payout_id uuid, amount_cents integer, stripe_account_id text)
language plpgsql
security definer
set search_path to 'public'
as $body$
declare
  v_owner uuid;
  v_status verification_status;
  v_stripe_account_id text;
  v_payouts_enabled boolean;
  v_available integer;
  v_pending integer;
  v_payout_id uuid;
begin
  select owner_id, verification_status into v_owner, v_status from kitchens where id = p_kitchen_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not your kitchen' using errcode = '42501';
  end if;
  if v_status <> 'verified' then
    raise exception 'This kitchen cannot cash out right now.' using errcode = 'P0014';
  end if;

  perform pg_advisory_xact_lock(hashtext('payout:' || p_kitchen_id::text));

  select sa.stripe_account_id, sa.payouts_enabled into v_stripe_account_id, v_payouts_enabled
  from stripe_accounts sa where sa.kitchen_id = p_kitchen_id;
  if v_stripe_account_id is null or not coalesce(v_payouts_enabled, false) then
    raise exception 'Finish payout setup first.' using errcode = 'P0001';
  end if;

  select coalesce(sum(p.amount_cents), 0) into v_pending
  from payouts p where p.kitchen_id = p_kitchen_id and p.status = 'pending';

  v_available := kitchen_balance_cents(p_kitchen_id) - v_pending;
  if v_available <= 0 then
    raise exception 'Nothing to cash out yet.' using errcode = 'P0002';
  end if;

  insert into payouts (kitchen_id, amount_cents, status)
  values (p_kitchen_id, v_available, 'pending')
  returning id into v_payout_id;

  return query select v_payout_id, v_available, v_stripe_account_id;
end;
$body$;

-- (2) plans RLS: authorize by is_active_kitchen_owner, not bare ownership.
drop policy if exists plans_owner_write on plans;
create policy plans_owner_write on plans for all
  using (is_active_kitchen_owner(kitchen_id))
  with check (is_active_kitchen_owner(kitchen_id));

-- (4) accept_quote: a suspended kitchen (payouts_enabled may still be true) must not be
-- able to have a quote accepted and paid.
create or replace function public.accept_quote(p_quote_id uuid)
returns table(
  booking_id uuid, out_request_id uuid, out_kitchen_id uuid,
  amount_cents integer, deposit_cents integer, service_fee_cents integer,
  event_date date, address_text text, lat double precision, lng double precision,
  reused boolean
)
language plpgsql
security definer
set search_path to 'public'
as $body$
declare
  v_quote record;
  v_request record;
  v_idem text;
  v_existing record;
  v_booking_id uuid;
  v_service_fee integer;
  v_deposit integer;
  v_total integer;
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

  insert into bookings (
    request_id, quote_id, kitchen_id, customer_id, amount_cents, deposit_cents, service_fee_cents,
    status, booking_kind, event_date, idempotency_key, address_text, lat, lng
  ) values (
    v_quote.request_id, p_quote_id, v_quote.kitchen_id, auth.uid(), v_total, v_deposit, v_service_fee,
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
$body$;

revoke all on function public.accept_quote(uuid) from public;
revoke all on function public.accept_quote(uuid) from anon;
grant execute on function public.accept_quote(uuid) to authenticated;

-- (5) release_experience_seats: no ownership check exists in the function body at all --
-- restrict to service_role (both real callers already use the admin client) rather than
-- try to bolt on an ownership check that would need to know who's allowed to release whose
-- seats in every calling context.
revoke execute on function public.release_experience_seats(uuid) from public, anon, authenticated;
grant execute on function public.release_experience_seats(uuid) to service_role;
