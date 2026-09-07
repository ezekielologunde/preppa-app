
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-videos', 'post-videos', true, 104857600, array['video/mp4','video/quicktime'])
on conflict (id) do nothing;

create policy post_videos_write_owner on storage.objects for insert
  with check (bucket_id = 'post-videos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy post_videos_read_owner on storage.objects for select
  using (bucket_id = 'post-videos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy post_videos_update_owner on storage.objects for update
  using (bucket_id = 'post-videos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy post_videos_delete_owner on storage.objects for delete
  using (bucket_id = 'post-videos' and (storage.foldername(name))[1] = auth.uid()::text);
