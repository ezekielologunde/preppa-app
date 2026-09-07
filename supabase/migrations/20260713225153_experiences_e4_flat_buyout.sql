-- ④ Flat = whole-session buyout. Branch on the SERVER-LOADED price_model (user can't pick it):
-- flat → amount=price_cents, hold=session.capacity (so the generic oversell guard forces sum=0 →
-- the session must be empty to buy out, and it flips to sold-out in one booking); per_person → unchanged.
-- booking.guests = real party headcount; reservation.guests = the hold. Uses service_fee_bps.
create or replace function create_experience_booking(p_experience uuid, p_session uuid, p_guests int)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_cust uuid := auth.uid(); e experiences; s experience_sessions; v_used int; v_amount int; v_fee int; v_hold int; v_bid uuid; v_existing bookings;
begin
  if v_cust is null then raise exception 'auth required'; end if;
  select * into e from experiences where id = p_experience;
  if e.id is null or e.status <> 'published' then raise exception 'experience not available'; end if;

  select * into s from experience_sessions where id = p_session for update;
  if s.id is null or s.experience_id <> p_experience then raise exception 'session not found'; end if;
  if s.status <> 'open' then raise exception 'session not open'; end if;
  if s.starts_at <= now() then raise exception 'session already started'; end if;
  if s.capacity is null or s.capacity < 1 then raise exception 'bad capacity'; end if;
  if p_guests < e.min_guests or p_guests > e.max_guests then raise exception 'guests out of range'; end if;

  if e.price_model = 'flat' then
    if e.price_cents is null then raise exception 'flat experience missing price'; end if;
    if p_guests > s.capacity then raise exception 'party exceeds capacity'; end if;
    v_amount := e.price_cents;
    v_hold := s.capacity;                 -- buyout locks the whole session
  else
    if e.per_person_cents is null then raise exception 'experience missing price'; end if;
    v_amount := e.per_person_cents * p_guests;
    v_hold := p_guests;
  end if;
  v_fee := round(v_amount * coalesce(e.service_fee_bps, 1500) / 10000.0)::int;

  -- dedupe a fresh pending booking (double-tap safe) — re-set money AND the hold
  select * into v_existing from bookings
    where customer_id = v_cust and session_id = p_session and status = 'pending_deposit' and created_at > now() - interval '15 minutes'
    order by created_at desc limit 1;
  if v_existing.id is not null then
    update bookings set amount_cents = v_amount, deposit_cents = v_amount, service_fee_cents = v_fee, guests = p_guests where id = v_existing.id;
    insert into experience_seat_reservations(session_id, booking_id, guests) values (p_session, v_existing.id, v_hold)
      on conflict (session_id, booking_id) do update set guests = excluded.guests;
    return jsonb_build_object('bookingId', v_existing.id, 'amountCents', v_amount, 'deduped', true);
  end if;

  -- generic oversell guard, parameterized by v_hold (for flat, v_hold=capacity forces sum=0)
  select coalesce(sum(r.guests),0) into v_used
    from experience_seat_reservations r join bookings b on b.id = r.booking_id
    where r.session_id = p_session and r.released_at is null
      and (b.status in ('confirmed','in_progress','completed') or (b.status = 'pending_deposit' and r.created_at > now() - interval '15 minutes'));
  if v_used + v_hold > s.capacity then return jsonb_build_object('full', true); end if;

  insert into bookings(kitchen_id, customer_id, booking_kind, experience_id, session_id, guests,
                       amount_cents, deposit_cents, service_fee_cents, event_date, status, idempotency_key)
    values (e.kitchen_id, v_cust, 'experience', p_experience, p_session, p_guests,
            v_amount, v_amount, v_fee, s.starts_at::date, 'pending_deposit', 'exp_'||replace(gen_random_uuid()::text,'-',''))
    returning id into v_bid;
  insert into experience_seat_reservations(session_id, booking_id, guests) values (p_session, v_bid, v_hold);
  return jsonb_build_object('bookingId', v_bid, 'amountCents', v_amount);
end $$;
