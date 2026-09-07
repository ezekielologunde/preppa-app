-- Closes the media-upload content-validation gap at the RLS layer, not just the app layer.
-- Uploads now route through upload-media (magic-byte validation, service-role write, bypasses
-- RLS entirely). Direct client INSERT/UPDATE to these 4 buckets served no remaining purpose
-- and was the exact path that let a spoofed Content-Type slip through undetected -- dropping
-- them means even a client that bypasses the app UI entirely (raw REST, like the audit did)
-- can no longer write media directly. SELECT/DELETE are untouched: reading your own files and
-- deleting your own already-validated files carry no content-injection risk.
drop policy if exists avatars_write_owner on storage.objects;
drop policy if exists avatars_update_owner on storage.objects;
drop policy if exists meal_photos_write_owner on storage.objects;
drop policy if exists meal_photos_update_owner on storage.objects;
drop policy if exists post_videos_write_owner on storage.objects;
drop policy if exists cook_docs_insert_own on storage.objects;
