
-- Admins can read any cook's verification photos (to review applications). The bucket
-- is otherwise owner-only; this lets admins mint signed URLs for a cook's files.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='cook_docs_select_admin') then
    create policy cook_docs_select_admin on storage.objects for select to authenticated
      using (bucket_id = 'cook-docs' and public.is_admin());
  end if;
end $$;
