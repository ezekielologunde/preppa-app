-- Richer profile editing: self-writable fields (the privileged-columns guard only
-- blocks role/verification_status, so these are fine under profiles_update_self).
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists location text;
alter table public.profiles add column if not exists dietary text[];

-- Avatars bucket. Public so object URLs render, but NO broad listing policy
-- (mirrors the hardened meal-photos pattern): owner-scoped management, and public
-- display works via the /object/public/ URL without a SELECT policy.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists avatars_read_owner on storage.objects;
drop policy if exists avatars_write_owner on storage.objects;
drop policy if exists avatars_update_owner on storage.objects;
drop policy if exists avatars_delete_owner on storage.objects;

create policy avatars_read_owner on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_write_owner on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_update_owner on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_delete_owner on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
