create or replace function public.admin_suspend_kitchen(p_kitchen uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_owner uuid;
  v_caller_role user_role;
begin
  select role into v_caller_role from profiles where id = auth.uid();
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role'
     and coalesce(v_caller_role, 'customer') <> 'admin' then
    raise exception 'only an admin may suspend a kitchen';
  end if;

  if coalesce(length(btrim(p_reason)), 0) < 3 then
    raise exception 'a suspension reason is required';
  end if;

  perform set_config('app.privileged', 'on', true);

  update kitchens
     set verification_status = 'suspended', rejection_reason = p_reason, availability = 'paused'
   where id = p_kitchen and verification_status = 'verified'
   returning owner_id into v_owner;
  if v_owner is null then
    raise exception 'kitchen is not currently verified (already suspended, never approved, or not found)';
  end if;

  update profiles set verification_status = 'suspended' where id = v_owner;

  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (auth.uid(), 'kitchen_suspended', 'kitchen', p_kitchen, jsonb_build_object('reason', p_reason));

  perform notify(v_owner, 'kitchen', 'Kitchen suspended', p_reason);
end $$;

create or replace function public.admin_reinstate_kitchen(p_kitchen uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_owner uuid;
  v_caller_role user_role;
begin
  select role into v_caller_role from profiles where id = auth.uid();
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role'
     and coalesce(v_caller_role, 'customer') <> 'admin' then
    raise exception 'only an admin may reinstate a kitchen';
  end if;

  perform set_config('app.privileged', 'on', true);

  update kitchens
     set verification_status = 'verified', rejection_reason = null, availability = 'open'
   where id = p_kitchen and verification_status = 'suspended'
   returning owner_id into v_owner;
  if v_owner is null then
    raise exception 'kitchen is not currently suspended';
  end if;

  update profiles set verification_status = 'verified' where id = v_owner;

  insert into audit_log (actor_id, action, entity, entity_id)
  values (auth.uid(), 'kitchen_reinstated', 'kitchen', p_kitchen);

  perform notify(v_owner, 'kitchen', 'Kitchen reinstated', 'Your kitchen has been reinstated and can accept orders again.');
end $$;
