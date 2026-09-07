
create or replace function public.request_prepper_application(p_kitchen_name text, p_cuisine text DEFAULT NULL::text, p_approx_area text DEFAULT NULL::text, p_bio text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_address text DEFAULT NULL::text, p_food_safety jsonb DEFAULT NULL::jsonb, p_food_handler_cert text DEFAULT NULL::text, p_agreement_version text DEFAULT NULL::text, p_service_types text[] DEFAULT ARRAY['meals'::text], p_service_area text DEFAULT NULL::text, p_experience text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_kitchen uuid;
  v_slug citext;
  v_existing_id uuid;
  v_existing_status verification_status;
begin
  if v_uid is null then raise exception 'must be signed in to apply'; end if;
  if length(coalesce(p_kitchen_name, '')) < 2 then raise exception 'kitchen name is too short'; end if;
  if length(btrim(coalesce(p_food_handler_cert, ''))) < 3 then raise exception 'a food handler certificate number is required'; end if;

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

  insert into kitchen_private (kitchen_id, phone, address, food_safety, food_handler_cert, agreement_version, agreement_accepted_at, service_types, service_area, experience, updated_at)
  values (v_kitchen, p_phone, p_address, p_food_safety, p_food_handler_cert, p_agreement_version, now(),
          coalesce(p_service_types, array['meals']), p_service_area, p_experience, now())
  on conflict (kitchen_id) do update set
    phone = excluded.phone, address = excluded.address, food_safety = excluded.food_safety,
    food_handler_cert = excluded.food_handler_cert, agreement_version = excluded.agreement_version,
    agreement_accepted_at = excluded.agreement_accepted_at, service_types = excluded.service_types,
    service_area = excluded.service_area, experience = excluded.experience, updated_at = now();

  insert into verifications (subject_id, kind, status) values (v_uid, 'kitchen', 'pending');

  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (v_uid, 'prepper_application_submitted', 'kitchen', v_kitchen,
          jsonb_build_object('name', p_kitchen_name, 'agreement_version', p_agreement_version, 'service_types', p_service_types, 'reused', v_existing_status = 'rejected'));

  return v_kitchen;
end $function$;
