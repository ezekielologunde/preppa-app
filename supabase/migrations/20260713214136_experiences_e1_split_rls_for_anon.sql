-- The combined read policy referenced is_admin()/is_kitchen_owner(), which anon can't EXECUTE,
-- so anon browse queries errored. Split into a pure-SQL public-read (anon-safe) + an owner/admin
-- policy scoped to authenticated. Multiple permissive policies are OR'd.
drop policy if exists experiences_read on experiences;
create policy experiences_public_read on experiences for select to anon, authenticated
  using (status = 'published' and exists (select 1 from kitchens k where k.id = experiences.kitchen_id and k.verification_status = 'verified'));
create policy experiences_owner_read on experiences for select to authenticated
  using (is_kitchen_owner(kitchen_id) or is_admin());

drop policy if exists experience_sessions_read on experience_sessions;
create policy experience_sessions_public_read on experience_sessions for select to anon, authenticated
  using (exists (select 1 from experiences e join kitchens k on k.id = e.kitchen_id
                 where e.id = experience_sessions.experience_id and e.status = 'published' and k.verification_status = 'verified'));
create policy experience_sessions_owner_read on experience_sessions for select to authenticated
  using (is_kitchen_owner(kitchen_id) or is_admin());
