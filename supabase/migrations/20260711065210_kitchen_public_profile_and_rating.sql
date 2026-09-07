-- Phase 1: real prepper discovery. Public read RLS already exists
-- (kitchens_select_verified_public, meals_select_live_public, reviews_select_public).
-- Add the presentation fields a browsable prepper profile needs + a clean public
-- projection view (no owner_id/rejection_reason) + a rating aggregate.

alter table public.kitchens
  add column if not exists avatar_url   text,
  add column if not exists cover_url    text,
  add column if not exists specialties  text[] not null default '{}',
  add column if not exists years_active int;

-- Stable public contract for the directory + storefront. security_invoker=on means the
-- caller's RLS (kitchens_select_verified_public → verified only) still applies; the view
-- simply omits owner_id / rejection_reason / cod flags. approx_lat/lng are already coarse.
create or replace view public.kitchen_public
with (security_invoker = on) as
select id, name, slug, cuisine, bio, approx_area, approx_lat, approx_lng,
       avatar_url, cover_url, specialties, years_active, availability, created_at
from public.kitchens
where verification_status = 'verified';

grant select on public.kitchen_public to anon, authenticated;

-- Rating aggregate over the (public) reviews table, for directory sort + profile header.
create or replace view public.kitchen_rating as
select kitchen_id,
       round(avg(rating)::numeric, 2) as rating_avg,
       count(*)::int                  as rating_count
from public.reviews
group by kitchen_id;

grant select on public.kitchen_rating to anon, authenticated;
