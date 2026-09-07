-- kitchen_public (the discovery-list read layer) never exposed is_pro, so the customer-facing
-- "Preppers near you" rail (useKitchens/sortKitchens) had no way to apply the Preppa Pro
-- priority-placement perk -- only the meals catalog (applyProximity in supabaseRepository.ts)
-- got that treatment earlier this session. Adding it here for parity, ahead of wiring
-- priority sort into sortKitchens client-side.
create or replace view public.kitchen_public as
select id, name, slug, cuisine, bio, approx_area, approx_lat, approx_lng, avatar_url, cover_url,
       specialties, years_active, availability, created_at, is_pro
from kitchens
where verification_status = 'verified';
