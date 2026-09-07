-- LOW (latent, not currently reachable -- accept_quote is not anon-granted and its only
-- caller forwards the real user JWT): same <> vs IS DISTINCT FROM pattern already fixed in
-- the sibling function reserve_balance_charge (20260716033455). Fixing here too so a future
-- refactor to a service-role caller can't silently reintroduce the NULL-auth bypass.

CREATE OR REPLACE FUNCTION public.accept_quote(p_quote_id uuid)
 RETURNS TABLE(booking_id uuid, out_request_id uuid, out_kitchen_id uuid, amount_cents integer, deposit_cents integer, service_fee_cents integer, event_date date, address_text text, lat double precision, lng double precision, reused boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  select quotes.id, quotes.request_id, quotes.kitchen_id, quotes.amount_cents, quotes.deposit_cents, quotes.status
    into v_quote from quotes where quotes.id = p_quote_id;
  if v_quote.id is null then
    raise exception 'Quote not found.' using errcode = 'P0010';
  end if;

  select service_requests.id, service_requests.customer_id, service_requests.event_date,
         service_requests.address_text, service_requests.lat, service_requests.lng
    into v_request from service_requests where service_requests.id = v_quote.request_id;
  if v_request.id is null or v_request.customer_id is distinct from auth.uid() then
    raise exception 'Not your request.' using errcode = '42501';
  end if;

  v_idem := 'bk_' || p_quote_id::text;

  select bookings.id, bookings.amount_cents, bookings.deposit_cents, bookings.service_fee_cents,
         bookings.request_id, bookings.kitchen_id, bookings.event_date, bookings.address_text,
         bookings.lat, bookings.lng
    into v_existing from bookings where bookings.idempotency_key = v_idem;
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
$function$;
