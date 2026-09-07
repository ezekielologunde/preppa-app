-- E4d: experience reviews reuse the `reviews` table (so they feed kitchen_rating + ReviewsBlock).
-- A review is tied to EITHER an order (existing) OR an experience booking.
alter table reviews alter column order_id drop not null;
alter table reviews add column if not exists booking_id uuid references bookings(id) on delete cascade;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'reviews_booking_id_key') then
    alter table reviews add constraint reviews_booking_id_key unique (booking_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reviews_target_xor') then
    alter table reviews add constraint reviews_target_xor check ((order_id is not null) <> (booking_id is not null));
  end if;
end $$;

-- customer reviews their own attended experience (confirmed + session in the past); one per booking
create or replace function review_experience(p_booking uuid, p_rating int, p_body text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare b bookings; s experience_sessions;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if p_rating < 1 or p_rating > 5 then raise exception 'rating must be 1-5'; end if;
  select * into b from bookings where id = p_booking and booking_kind = 'experience';
  if b.id is null then raise exception 'booking not found'; end if;
  if b.customer_id <> auth.uid() then raise exception 'not your booking'; end if;
  if b.status not in ('confirmed','completed') then raise exception 'this booking can''t be reviewed'; end if;
  select * into s from experience_sessions where id = b.session_id;
  if s.id is null or s.starts_at > now() then raise exception 'You can review after the experience.'; end if;
  insert into reviews(booking_id, kitchen_id, author_id, rating, body)
    values (p_booking, b.kitchen_id, auth.uid(), p_rating, nullif(btrim(coalesce(p_body,'')), ''));
end $$;

revoke all on function review_experience(uuid, int, text) from public, anon;
grant execute on function review_experience(uuid, int, text) to authenticated, service_role;
