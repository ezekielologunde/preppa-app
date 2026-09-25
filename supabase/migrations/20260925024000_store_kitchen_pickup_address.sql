-- Store a structured, owner-private pickup address with every cook application.
-- Checkout uses this address for Stripe Tax instead of the buyer's rough location.

drop function if exists public.request_prepper_application(
  text, text, text, text, text, text, jsonb, text, text, text[], text, text, numeric, numeric
);

create or replace function public.request_prepper_application(
  p_kitchen_name text,
  p_cuisine text default null,
  p_approx_area text default null,
  p_bio text default null,
  p_phone text default null,
  p_address text default null,
  p_food_safety jsonb default null,
  p_food_handler_cert text default null,
  p_agreement_version text default null,
  p_service_types text[] default array['meals'::text],
  p_service_area text default null,
  p_experience text default null,
  p_verified_lat numeric default null,
  p_verified_lng numeric default null,
  p_address_line1 text default null,
  p_address_line2 text default null,
  p_address_city text default null,
  p_address_region text default null,
  p_address_postal_code text default null,
  p_address_country text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_kitchen uuid;
  v_slug text;
  v_existing_id uuid;
  v_existing_status verification_status;
  v_country text := upper(btrim(coalesce(p_address_country, '')));
begin
  if v_uid is null then raise exception 'must be signed in to apply'; end if;
  if length(coalesce(p_kitchen_name, '')) < 2 then raise exception 'kitchen name is too short'; end if;
  if length(btrim(coalesce(p_food_handler_cert, ''))) < 3 then raise exception 'a food handler certificate number is required'; end if;
  if length(btrim(coalesce(p_address_line1, ''))) < 3
     or length(btrim(coalesce(p_address_city, ''))) < 2
     or length(btrim(coalesce(p_address_region, ''))) < 2
     or length(btrim(coalesce(p_address_postal_code, ''))) < 3
     or v_country !~ '^[A-Z]{2}$' then
    raise exception 'a complete structured kitchen address is required';
  end if;

  select id, verification_status into v_existing_id, v_existing_status
  from kitchens where owner_id = v_uid order by created_at desc limit 1;

  if v_existing_status in ('unverified', 'pending') then
    raise exception 'you already have a pending kitchen application';
  end if;

  v_slug := lower(regexp_replace(p_kitchen_name, '[^a-zA-Z0-9]+', '-', 'g'))
            || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  if v_existing_status = 'rejected' then
    perform set_config('app.privileged', 'on', true);
    update kitchens
       set name = p_kitchen_name, slug = v_slug, cuisine = p_cuisine, bio = p_bio, approx_area = p_approx_area,
           availability = 'paused', verification_status = 'pending', rejection_reason = null, approved_at = null
     where id = v_existing_id;
    v_kitchen := v_existing_id;
  else
    insert into kitchens (owner_id, name, slug, cuisine, bio, approx_area, availability, verification_status)
    values (v_uid, p_kitchen_name, v_slug, p_cuisine, p_bio, p_approx_area, 'paused', 'pending')
    returning id into v_kitchen;
  end if;

  insert into kitchen_private (kitchen_id, phone, address, food_safety, food_handler_cert, agreement_version, agreement_accepted_at, service_types, service_area, experience, verified_lat, verified_lng, updated_at)
  values (v_kitchen, p_phone, p_address, p_food_safety, p_food_handler_cert, p_agreement_version, now(),
          coalesce(p_service_types, array['meals']), p_service_area, p_experience, p_verified_lat, p_verified_lng, now())
  on conflict (kitchen_id) do update set
    phone = excluded.phone, address = excluded.address, food_safety = excluded.food_safety,
    food_handler_cert = excluded.food_handler_cert, agreement_version = excluded.agreement_version,
    agreement_accepted_at = excluded.agreement_accepted_at, service_types = excluded.service_types,
    service_area = excluded.service_area, experience = excluded.experience,
    verified_lat = excluded.verified_lat, verified_lng = excluded.verified_lng, updated_at = now();

  delete from addresses where owner_id = v_uid and kind = 'kitchen_pickup';
  insert into addresses (owner_id, kind, label, line1, line2, city, region, postal_code, country, lat, lng, is_default)
  values (
    v_uid, 'kitchen_pickup', 'Kitchen pickup', btrim(p_address_line1), nullif(btrim(p_address_line2), ''),
    btrim(p_address_city), btrim(p_address_region), btrim(p_address_postal_code), v_country,
    p_verified_lat, p_verified_lng, true
  );

  insert into verifications (subject_id, kind, status) values (v_uid, 'kitchen', 'pending');

  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (v_uid, 'prepper_application_submitted', 'kitchen', v_kitchen,
          jsonb_build_object('name', p_kitchen_name, 'agreement_version', p_agreement_version, 'service_types', p_service_types, 'reused', v_existing_status = 'rejected'));

  return v_kitchen;
end $function$;

revoke all on function public.request_prepper_application(
  text, text, text, text, text, text, jsonb, text, text, text[], text, text,
  numeric, numeric, text, text, text, text, text, text
) from public, anon;
grant execute on function public.request_prepper_application(
  text, text, text, text, text, text, jsonb, text, text, text[], text, text,
  numeric, numeric, text, text, text, text, text, text
) to authenticated;
