create index if not exists posts_kitchen_feed_idx
  on public.posts (kitchen_id, created_at desc) where status = 'published';
