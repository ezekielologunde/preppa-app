-- Storage hardening: the meal-photos bucket had a broad public SELECT policy that
-- let anon/authenticated LIST/enumerate every file. The client never uses the
-- bucket (meal images are external URLs), and a public bucket serves object
-- content via the /object/public/ URL WITHOUT RLS — so listing access is
-- unnecessary. Replace the broad policy with an owner-scoped one (mirrors the
-- existing write/update/delete policies), removing anonymous enumeration while
-- staying forward-compatible with a future prepper photo-management UI.
drop policy if exists meal_photos_read_public on storage.objects;

create policy meal_photos_read_owner on storage.objects
  for select to authenticated
  using (
    bucket_id = 'meal-photos'
    and public.is_kitchen_owner(((storage.foldername(name))[1])::uuid)
  );
