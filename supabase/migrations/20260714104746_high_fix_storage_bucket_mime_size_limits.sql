-- HIGH: avatars/cook-docs/meal-photos/kyc-docs buckets had no file_size_limit or
-- allowed_mime_types (post-videos already had both, proving the pattern is known but wasn't
-- applied here). Client-side `<input accept>`/expo-image-picker config is the only current gate
-- and is trivially bypassed by calling the upload functions directly. All confirmed live upload
-- paths through these buckets (uploadAvatar/uploadPlanCover/uploadPostCover -> avatars,
-- uploadCookPhoto -> cook-docs) are photo-only (no PDFs/docs); meal-photos and kyc-docs have zero
-- current code references (defense-in-depth ahead of that upload path landing).
update storage.buckets
set file_size_limit = 8388608, -- 8 MB
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif']
where id in ('avatars', 'meal-photos');

update storage.buckets
set file_size_limit = 15728640, -- 15 MB
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif']
where id in ('cook-docs', 'kyc-docs');
