-- Bound user-authored review text at the storage boundary. NOT VALID preserves any
-- historical oversized rows while PostgreSQL enforces the limit for every new write.
alter table public.reviews
  add constraint reviews_body_length
  check (body is null or char_length(body) <= 2000) not valid;
