-- Re-application after rejection reuses the existing 'rejected' kitchen row in place
-- (one kitchen per owner; no orphan rows). Still blocks an in-flight application.
create or replace function public.request_prepper_application(
  p_kitchen_name text, p_cuisine text DEFAULT NULL::text, p_approx_area text DEFAULT NULL::text
) returns uuid
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_kitchen uuid;
  v_slug citext;
  v_existing_id uuid;
  v_existing_status verification_status;
begin
  if v_uid is null then
    raise exception 'must be signed in to apply';
  end if;
  if length(coalesce(p_kitchen_name, '')) < 2 then
    raise exception 'kitchen name is too short';
  end if;

  select id, verification_status into v_existing_id, v_existing_status
  from kitchens where owner_id = v_uid order by created_at desc limit 1;

  if v_existing_status in ('unverified', 'pending') then
    raise exception 'you already have a pending kitchen application';
  end if;

  v_slug := lower(regexp_replace(p_kitchen_name, '[^a-zA-Z0-9]+', '-', 'g'))
            || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  if v_existing_status = 'rejected' then
    -- reuse the rejected row for a fresh review cycle
    perform set_config('app.privileged', 'on', true);
    update kitchens
       set name = p_kitchen_name, slug = v_slug, cuisine = p_cuisine, approx_area = p_approx_area,
           availability = 'paused', verification_status = 'pending',
           rejection_reason = null, approved_at = null
     where id = v_existing_id;
    v_kitchen := v_existing_id;
  else
    insert into kitchens (owner_id, name, slug, cuisine, approx_area, availability, verification_status)
    values (v_uid, p_kitchen_name, v_slug, p_cuisine, p_approx_area, 'paused', 'pending')
    returning id into v_kitchen;
  end if;

  insert into verifications (subject_id, kind, status)
  values (v_uid, 'kitchen', 'pending');

  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (v_uid, 'prepper_application_submitted', 'kitchen', v_kitchen,
          jsonb_build_object('name', p_kitchen_name, 'reused', v_existing_status = 'rejected'));

  return v_kitchen;
end $function$;
