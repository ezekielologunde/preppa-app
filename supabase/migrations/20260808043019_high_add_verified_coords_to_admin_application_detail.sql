drop function if exists public.admin_application_detail(uuid);

create function public.admin_application_detail(p_kitchen uuid)
returns table(kitchen_id uuid, kitchen_name text, cuisine text, bio text, approx_area text, availability kitchen_availability, status verification_status, rejection_reason text, created_at timestamptz, applicant_id uuid, applicant_name text, applicant_first text, phone text, address text, food_safety jsonb, food_handler_cert text, agreement_version text, agreement_accepted_at timestamptz, service_types text[], service_area text, experience text, verified_lat numeric, verified_lng numeric)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select k.id, k.name, k.cuisine, k.bio, k.approx_area, k.availability,
         k.verification_status, k.rejection_reason, k.created_at,
         p.id, p.display_name, p.first_name,
         kp.phone, kp.address, kp.food_safety, kp.food_handler_cert, kp.agreement_version, kp.agreement_accepted_at,
         kp.service_types, kp.service_area, kp.experience, kp.verified_lat, kp.verified_lng
  from kitchens k
  join profiles p on p.id = k.owner_id
  left join kitchen_private kp on kp.kitchen_id = k.id
  where public.is_admin() and k.id = p_kitchen;
$function$;

revoke all on function public.admin_application_detail(uuid) from public;
grant execute on function public.admin_application_detail(uuid) to authenticated;
