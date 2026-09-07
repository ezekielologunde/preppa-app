-- Fixes audit Critical #2: accept-quote-and-deposit had no row/advisory lock, so two
-- different quotes on the same service_request could both be accepted, paid, and
-- confirmed, producing two paid bookings with two cooks for one event. The prior code's
-- idempotency key ('bk_'+quoteId) only deduped repeat calls for the SAME quote, not
-- competing quotes on the same request.
--
-- accept_quote moves the whole accept flow server-side: it locks on request_id (not
-- quote_id), re-checks the quote is still 'pending' under that lock, refuses if the
-- request already has any non-cancelled booking, then creates the booking and expires
-- every other pending quote on that request in the same transaction. A unique partial
-- index on bookings is added as a second, independent guard.
--
-- APPLIED LIVE to project fwidhpzwldneeaphrxgg on 2026-07-14 (via Supabase MCP
-- apply_migration, same name). This file is the vendored source-control copy.

create unique index if not exists bookings_one_active_per_request
  on bookings (request_id)
  where booking_kind = 'rfq' and status <> 'cancelled';

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
as $$
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
$$;

revoke all on function public.accept_quote(uuid) from public;
revoke all on function public.accept_quote(uuid) from anon;
grant execute on function public.accept_quote(uuid) to authenticated;
