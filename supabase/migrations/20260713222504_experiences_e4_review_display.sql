-- E4e: expose an experience's reviews + aggregate rating publicly (reviews→bookings join needs a
-- SECURITY DEFINER RPC since bookings RLS is customer/owner-only).
create or replace function experience_rating(p_experience uuid)
returns table(rating_avg numeric, rating_count int)
language sql security definer set search_path to 'public' stable as $$
  select round(avg(r.rating), 2), count(*)::int
  from reviews r join bookings b on b.id = r.booking_id
  where b.experience_id = p_experience;
$$;

create or replace function experience_reviews(p_experience uuid, p_limit int default 20)
returns table(rating int, body text, author text, created_at timestamptz)
language sql security definer set search_path to 'public' stable as $$
  select r.rating, r.body, coalesce(nullif(btrim(p.display_name), ''), 'Guest'), r.created_at
  from reviews r
  join bookings b on b.id = r.booking_id
  left join profiles p on p.id = r.author_id
  where b.experience_id = p_experience
  order by r.created_at desc
  limit greatest(1, least(p_limit, 50));
$$;

revoke all on function experience_rating(uuid), experience_reviews(uuid, int) from public;
grant execute on function experience_rating(uuid)          to anon, authenticated, service_role;
grant execute on function experience_reviews(uuid, int)     to anon, authenticated, service_role;
