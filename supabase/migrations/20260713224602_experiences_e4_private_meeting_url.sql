-- ③ Online locations: the meeting link is a secret. RLS is row-level (can't hide a column), so the
-- link lives in a protected sibling table, readable by the owner/admin, and by a booker only via a
-- confirmed-booking-gated RPC. Venue keeps using the public experiences.address_text (public place).
create table if not exists experience_private (
  experience_id uuid primary key references experiences(id) on delete cascade,
  meeting_url text,
  updated_at timestamptz not null default now()
);
alter table experience_private enable row level security;
drop policy if exists experience_private_owner on experience_private;
create policy experience_private_owner on experience_private for select to authenticated
  using (exists (select 1 from experiences e where e.id = experience_private.experience_id and (is_kitchen_owner(e.kitchen_id) or is_admin())));
-- writes are service-role only (the experience-upsert edge fn)

-- booker-gated read: the join link only after a CONFIRMED booking for this experience
create or replace function experience_private_details(p_experience uuid)
returns table(meeting_url text) language sql security definer set search_path to 'public' stable as $$
  select ep.meeting_url from experience_private ep
  where ep.experience_id = p_experience
    and exists (select 1 from bookings b
                where b.experience_id = p_experience and b.customer_id = auth.uid() and b.status = 'confirmed');
$$;
revoke all on function experience_private_details(uuid) from public, anon;
grant execute on function experience_private_details(uuid) to authenticated, service_role;
