-- Admin review: approve a pending experience (→ published) or reject (→ archived).
-- SECURITY DEFINER + is_admin() gate (client writes to experiences are otherwise service-role only).
create or replace function admin_set_experience_status(p_experience uuid, p_status text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not is_admin() then raise exception 'admin only'; end if;
  if p_status not in ('published','archived','paused') then raise exception 'bad status'; end if;
  update experiences set status = p_status, updated_at = now() where id = p_experience;
  insert into audit_log(actor_id, action, entity, entity_id, meta)
    values (auth.uid(), 'experience_'||p_status, 'experience', p_experience, '{}'::jsonb);
end $$;

revoke all on function admin_set_experience_status(uuid, text) from public, anon;
grant execute on function admin_set_experience_status(uuid, text) to authenticated, service_role;
