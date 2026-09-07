-- Same bug class, same function, one more instance: `select stripe_customer_id into v_customer_stripe
-- from profiles where id = v_customer` is ambiguous against this function's own
-- RETURNS TABLE(..., stripe_customer_id text) out-parameter. Caught by the same live fixture test
-- (booking 667527c9-...) that caught the earlier balance_cents ambiguity in this function.
-- Qualifying with the table name, matching the fix already applied to the other two collisions.
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

  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    if v_customer is distinct from auth.uid() and v_owner is distinct from auth.uid() then
      raise exception 'Not your booking.' using errcode = '42501';
    end if;
  end if;

  if v_kind <> 'rfq' then
    raise exception 'This booking type has no separate balance.' using errcode = 'P0023';
  end if;
  if v_status not in ('confirmed', 'in_progress') then
    raise exception 'This booking is not ready to be completed.' using errcode = 'P0021';
  end if;

  perform pg_advisory_xact_lock(hashtext('balance_charge:' || p_booking_id::text));

  select bookings.status, bookings.balance_cents, bookings.balance_pi_id
    into v_status, v_balance, v_balance_pi
    from bookings where bookings.id = p_booking_id;
  if v_status not in ('confirmed', 'in_progress') then
    raise exception 'This booking is not ready to be completed.' using errcode = 'P0021';
  end if;
  if v_balance_pi is not null then
    raise exception 'Balance already charged.' using errcode = 'P0022';
  end if;
  if coalesce(v_balance, 0) <= 0 then
    raise exception 'No balance owed.' using errcode = 'P0024';
  end if;

  select profiles.stripe_customer_id into v_customer_stripe from profiles where profiles.id = v_customer;

  booking_id := p_booking_id;
  balance_cents := v_balance;
  stripe_customer_id := v_customer_stripe;
  return next;
end;
$body$;
