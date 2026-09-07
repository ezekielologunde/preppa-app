
-- Private bucket for cook food-safety documents (certs, kitchen photos). Files live
-- under a per-user folder ({uid}/...) and are readable/writable only by that owner.
insert into storage.buckets (id, name, public)
values ('cook-docs', 'cook-docs', false)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='cook_docs_insert_own') then
    create policy cook_docs_insert_own on storage.objects for insert to authenticated
      with check (bucket_id = 'cook-docs' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='cook_docs_select_own') then
    create policy cook_docs_select_own on storage.objects for select to authenticated
      using (bucket_id = 'cook-docs' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='cook_docs_delete_own') then
    create policy cook_docs_delete_own on storage.objects for delete to authenticated
      using (bucket_id = 'cook-docs' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;
