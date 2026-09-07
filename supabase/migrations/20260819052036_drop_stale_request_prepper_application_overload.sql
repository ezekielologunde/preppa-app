-- The 12-param overload predates the addition of p_verified_lat/p_verified_lng.
-- Keeping both overloads makes 12-named-arg calls fail with 42725 (ambiguous function),
-- breaking the prepper application flow for clients that omit lat/lng.
-- The 14-param version has defaults for the two extra params and an otherwise identical body,
-- so dropping the old overload restores resolution with unchanged semantics.
DROP FUNCTION IF EXISTS public.request_prepper_application(
  p_kitchen_name text, p_cuisine text, p_approx_area text, p_bio text,
  p_phone text, p_address text, p_food_safety jsonb, p_food_handler_cert text,
  p_agreement_version text, p_service_types text[], p_service_area text, p_experience text
);
