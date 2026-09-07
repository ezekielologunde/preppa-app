-- Self-review catch (same bug class as check_rate_limit's null-role gap, same day): reserve_balance_charge's
-- ownership check `v_customer <> auth.uid() and v_owner <> auth.uid()` uses PL/pgSQL's three-valued
-- logic wrong. complete-booking (like cancel-booking, live-end, etc.) calls RPCs through its
-- service-role admin() client with no user JWT forwarded to Postgres -- auth.uid() resolves to NULL
-- there, not the caller's id. `<> NULL` is NULL, `NULL and NULL` is NULL, and `if NULL then raise`
-- does not raise: the ownership check silently no-ops for exactly the caller complete-booking was
-- going to use. Not a live exploit yet (nothing calls this RPC until complete-booking is deployed,
-- and that Edge Function does its own correct ownership check in TS first) but the RPC's own
-- security boundary must not depend on every future caller getting that right.
--
-- Fix: adopt this codebase's own established idiom for this exact situation (see
-- admin_suspend_kitchen/admin_reinstate_kitchen/admin_set_user_role/approve_kitchen, all of which
-- gate on `current_setting('request.jwt.claim.role', true) is distinct from 'service_role'` before
-- applying a per-user check). service_role callers (the Edge Function, which already verified
-- ownership itself) skip the auth.uid() check entirely and intentionally; any other caller gets a
-- real check using IS DISTINCT FROM, which -- unlike <> -- correctly treats a NULL auth.uid() as
-- "distinct from" any real uuid and rejects rather than silently passing.
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
