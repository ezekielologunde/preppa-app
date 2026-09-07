-- ① recurring dedupe defense + ② photo-count bound (both tiny guards; the real work is client-side).
alter table experience_sessions drop constraint if exists uq_exp_starts;
alter table experience_sessions add constraint uq_exp_starts unique (experience_id, starts_at);

alter table experiences drop constraint if exists experiences_photo_cap;
alter table experiences add constraint experiences_photo_cap
  check (array_length(photo_urls, 1) is null or array_length(photo_urls, 1) <= 12);
