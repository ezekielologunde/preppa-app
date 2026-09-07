-- E4c: sold-out waitlist. A customer joins a session's waitlist; when seats free (a cancellation/
-- refund or the reaper releases holds) the earliest-fitting waitlisters are notified to re-book.
create table if not exists experience_waitlist (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references experience_sessions(id) on delete cascade,
  customer_id uuid not null references profiles(id) on delete cascade,
  guests int not null default 1 check (guests >= 1),
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  unique (session_id, customer_id)
);
create index if not exists experience_waitlist_session_idx on experience_waitlist(session_id, created_at);

alter table experience_waitlist enable row level security;
drop policy if exists waitlist_own on experience_waitlist;
create policy waitlist_own on experience_waitlist for select to authenticated
  using (customer_id = auth.uid() or is_admin() or exists (select 1 from experience_sessions s where s.id = experience_waitlist.session_id and is_kitchen_owner(s.kitchen_id)));
-- writes via SECURITY DEFINER RPCs only

create or replace function join_experience_waitlist(p_session uuid, p_guests int)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_cust uuid := auth.uid(); s experience_sessions;
begin
  if v_cust is null then raise exception 'auth required'; end if;
  select * into s from experience_sessions where id = p_session;
  if s.id is null then raise exception 'session not found'; end if;
  if s.status <> 'open' or s.starts_at <= now() then raise exception 'session not bookable'; end if;
  insert into experience_waitlist(session_id, customer_id, guests) values (p_session, v_cust, greatest(1, p_guests))
    on conflict (session_id, customer_id) do update set guests = greatest(1, p_guests), notified_at = null;
end $$;

create or replace function leave_experience_waitlist(p_session uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  delete from experience_waitlist where session_id = p_session and customer_id = auth.uid();
end $$;

-- notify earliest-fitting waitlisters when seats free up (idempotent via notified_at)
create or replace function notify_experience_waitlist(p_session uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_exp uuid; v_left int; r record; v_title text;
begin
  select experience_id into v_exp from experience_sessions where id = p_session;
  if v_exp is null then return; end if;
  select seats_left into v_left from experience_availability(v_exp) where session_id = p_session;
  if v_left is null or v_left <= 0 then return; end if;
  select title into v_title from experiences where id = v_exp;
  for r in select w.id, w.customer_id, w.guests from experience_waitlist w
           where w.session_id = p_session and w.notified_at is null and w.guests <= v_left
           order by w.created_at limit 20 loop
    perform notify(r.customer_id, 'booking', 'A seat opened up', 'A spot just opened for "'||coalesce(v_title,'an experience')||'" you waitlisted — book now before it fills.');
    update experience_waitlist set notified_at = now() where id = r.id;
    v_left := v_left - r.guests;
    exit when v_left <= 0;
  end loop;
end $$;

revoke all on function join_experience_waitlist(uuid,int), leave_experience_waitlist(uuid), notify_experience_waitlist(uuid) from public, anon;
grant execute on function join_experience_waitlist(uuid,int)  to authenticated, service_role;
grant execute on function leave_experience_waitlist(uuid)      to authenticated, service_role;
grant execute on function notify_experience_waitlist(uuid)     to service_role;

-- hook seat-freeing paths to ping the waitlist
create or replace function finalize_experience_cancel(p_booking uuid, p_refunded_cents int)
returns void language plpgsql security definer set search_path to 'public' as $$
declare b bookings; v_credited int;
begin
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
end $$;

create or replace function reap_experience_holds() returns int language plpgsql security definer set search_path to 'public' as $$
declare ids uuid[]; sids uuid[]; sid uuid;
begin
  select array_agg(b.id), array_agg(distinct b.session_id) into ids, sids from bookings b
  where b.booking_kind = 'experience' and b.status = 'pending_deposit'
    and b.created_at < now() - interval '20 minutes'
    and not exists (select 1 from stripe.payment_intents pi where pi.metadata->>'booking_id' = b.id::text and pi.status in ('succeeded','processing'));
  if ids is null then return 0; end if;
  update bookings set status = 'cancelled', cancelled_at = now() where id = any(ids);
  update experience_seat_reservations set released_at = now() where booking_id = any(ids) and released_at is null;
  foreach sid in array sids loop perform notify_experience_waitlist(sid); end loop;
  return array_length(ids, 1);
end $$;
