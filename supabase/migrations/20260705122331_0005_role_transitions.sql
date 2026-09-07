create or replace function request_prepper_application(
  p_kitchen_name text,
  p_cuisine text default null,
  p_approx_area text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_kitchen uuid;
  v_slug citext;
begin
  if v_uid is null then
    raise exception 'must be signed in to apply';
  end if;

  if length(coalesce(p_kitchen_name, '')) < 2 then
    raise exception 'kitchen name is too short';
  end if;

  if exists (
    select 1 from kitchens k
    where k.owner_id = v_uid and k.verification_status in ('unverified', 'pending')
  ) then
    raise exception 'you already have a pending kitchen application';
  end if;

  v_slug := lower(regexp_replace(p_kitchen_name, '[^a-zA-Z0-9]+', '-', 'g'))
            || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  insert into kitchens (owner_id, name, slug, cuisine, approx_area, availability, verification_status)
  values (v_uid, p_kitchen_name, v_slug, p_cuisine, p_approx_area, 'paused', 'pending')
  returning id into v_kitchen;

  insert into verifications (subject_id, kind, status)
  values (v_uid, 'kitchen', 'pending');

  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (v_uid, 'prepper_application_submitted', 'kitchen', v_kitchen, jsonb_build_object('name', p_kitchen_name));

  return v_kitchen;
end $$;

create or replace function approve_kitchen(p_kitchen uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_caller_role user_role;
begin
  select role into v_caller_role from profiles where id = auth.uid();
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role'
     and coalesce(v_caller_role, 'customer') <> 'admin' then
    raise exception 'only an admin may approve a kitchen';
  end if;

  perform set_config('app.privileged', 'on', true);

  update kitchens
     set verification_status = 'verified', approved_at = now()
   where id = p_kitchen
   returning owner_id into v_owner;
  if v_owner is null then raise exception 'kitchen not found'; end if;

  update profiles
     set role = 'prepper', verification_status = 'verified'
   where id = v_owner;

  update verifications
     set status = 'verified', reviewed_by = auth.uid(), reviewed_at = now()
   where subject_id = v_owner and kind = 'kitchen' and status = 'pending';

  insert into audit_log (actor_id, action, entity, entity_id)
  values (auth.uid(), 'kitchen_approved', 'kitchen', p_kitchen);
end $$;

grant execute on function request_prepper_application(text, text, text) to authenticated;
revoke execute on function approve_kitchen(uuid) from authenticated, anon;
