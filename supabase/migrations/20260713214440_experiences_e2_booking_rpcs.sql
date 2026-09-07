-- E2: atomic instant-booking seat claim + public availability. The FOR UPDATE session lock is
-- the entire oversell defense; stale pending_deposit holds (>15min unpaid) are excluded so seats
-- free up for the next booker (a reaper cron finalizes them in E3).

-- Public seats-left per session for a PUBLISHED experience (anon-safe: reservations aren't anon-readable).
create or replace function experience_availability(p_experience uuid)
returns table(session_id uuid, starts_at timestamptz, capacity int, seats_left int, status text)
language sql security definer set search_path to 'public' stable as $$
  select s.id, s.starts_at, s.capacity,
    greatest(0, s.capacity - coalesce((
      select sum(r.guests) from experience_seat_reservations r join bookings b on b.id = r.booking_id
      where r.session_id = s.id and r.released_at is null
        and (b.status in ('confirmed','in_progress','completed')
             or (b.status = 'pending_deposit' and r.created_at > now() - interval '15 minutes'))), 0))::int,
    s.status
  from experience_sessions s
  join experiences e on e.id = s.experience_id
  where s.experience_id = p_experience and e.status = 'published'
  order by s.starts_at;
$$;

-- Atomic: validate → lock session → capacity check → insert booking(kind=experience, deposit=full) + seat hold.
-- Runs as the customer (auth.uid()); SECURITY DEFINER so the inserts bypass RLS. Returns {bookingId, amountCents}
-- or {full:true}. Dedupes a double-tap into the same fresh pending booking.
create or replace function create_experience_booking(p_experience uuid, p_session uuid, p_guests int)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_cust uuid := auth.uid(); e experiences; s experience_sessions; v_used int; v_amount int; v_fee int; v_bid uuid; v_existing bookings;
begin
  if v_cust is null then raise exception 'auth required'; end if;
  select * into e from experiences where id = p_experience;
  if e.id is null or e.status <> 'published' then raise exception 'experience not available'; end if;
  if p_guests < e.min_guests or p_guests > e.max_guests then raise exception 'guests out of range'; end if;

  select * into s from experience_sessions where id = p_session for update;
  if s.id is null or s.experience_id <> p_experience then raise exception 'session not found'; end if;
  if s.status <> 'open' then raise exception 'session not open'; end if;
  if s.starts_at <= now() then raise exception 'session already started'; end if;

  select * into v_existing from bookings
    where customer_id = v_cust and session_id = p_session and status = 'pending_deposit' and created_at > now() - interval '15 minutes'
    order by created_at desc limit 1;
  if v_existing.id is not null then
    return jsonb_build_object('bookingId', v_existing.id, 'amountCents', v_existing.amount_cents, 'deduped', true);
  end if;

  select coalesce(sum(r.guests),0) into v_used
    from experience_seat_reservations r join bookings b on b.id = r.booking_id
    where r.session_id = p_session and r.released_at is null
      and (b.status in ('confirmed','in_progress','completed')
           or (b.status = 'pending_deposit' and r.created_at > now() - interval '15 minutes'));
  if v_used + p_guests > s.capacity then return jsonb_build_object('full', true); end if;

  v_amount := coalesce(e.per_person_cents, 0) * p_guests;
  v_fee := round(v_amount * coalesce(e.service_fee_bps, 1500) / 10000.0)::int;

  insert into bookings(kitchen_id, customer_id, booking_kind, experience_id, session_id, guests,
                       amount_cents, deposit_cents, service_fee_cents, event_date, status, idempotency_key)
    values (e.kitchen_id, v_cust, 'experience', p_experience, p_session, p_guests,
            v_amount, v_amount, v_fee, s.starts_at::date, 'pending_deposit',
            'exp_'||replace(gen_random_uuid()::text,'-',''))
    returning id into v_bid;
  insert into experience_seat_reservations(session_id, booking_id, guests) values (p_session, v_bid, p_guests);

  return jsonb_build_object('bookingId', v_bid, 'amountCents', v_amount);
end $$;

create or replace function release_experience_seats(p_booking uuid)
returns void language sql security definer set search_path to 'public' as $$
  update experience_seat_reservations set released_at = now() where booking_id = p_booking and released_at is null;
$$;

revoke all on function experience_availability(uuid), create_experience_booking(uuid,uuid,int), release_experience_seats(uuid) from public, anon;
grant execute on function experience_availability(uuid)               to anon, authenticated, service_role;
grant execute on function create_experience_booking(uuid,uuid,int)     to authenticated, service_role;
grant execute on function release_experience_seats(uuid)               to service_role;
