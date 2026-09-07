CREATE OR REPLACE VIEW kitchen_public AS
 SELECT id,
    name,
    slug,
    cuisine,
    bio,
    approx_area,
    approx_lat,
    approx_lng,
    avatar_url,
    cover_url,
    specialties,
    years_active,
    availability,
    created_at,
    is_pro,
    supports_delivery,
    supports_pickup
   FROM kitchens
  WHERE verification_status = 'verified'::verification_status;
