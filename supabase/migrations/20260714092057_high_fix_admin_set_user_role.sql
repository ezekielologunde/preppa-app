-- Fixes a High finding: there was no admin_set_user_role RPC, so any role change bypassed
-- audit_log entirely and was not attributable in-app (had to be done via raw DB access).

create or replace function public.admin_set_user_role(p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $body$
declare
  v_caller_role user_role;
  v_current user_role;
  v_admin_count int;
  v_next user_role;
begin
  select role into v_caller_role from profiles where id = auth.uid();
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role'
     and coalesce(v_caller_role, 'customer') <> 'admin' then
    raise exception 'only an admin may change a user''s role';
  end if;

  v_next := p_role::user_role;
  select role into v_current from profiles where id = p_user;
  if v_current is null then
    raise exception 'user not found';
  end if;
  if v_current = v_next then
    return;
  end if;

  -- Safety net: never demote the last remaining admin (would lock the console).
  if v_current = 'admin' and v_next <> 'admin' then
    select count(*) into v_admin_count from profiles where role = 'admin';
    if v_admin_count <= 1 then
      raise exception 'cannot remove the last remaining admin';
    end if;
  end if;

  perform set_config('app.privileged', 'on', true);
  update profiles set role = v_next where id = p_user;

  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (auth.uid(), 'user_role_changed', 'user', p_user, jsonb_build_object('from', v_current, 'to', v_next));
end;
$body$;

revoke all on function public.admin_set_user_role(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;
