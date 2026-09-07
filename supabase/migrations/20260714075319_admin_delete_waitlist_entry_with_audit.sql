create or replace function public.admin_delete_waitlist_entry(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_email text;
begin
  if not public.is_admin() then
    raise exception 'admins only';
  end if;

  select email::text into v_email from waitlist where id = p_id;
  if v_email is null then
    raise exception 'waitlist entry not found';
  end if;

  delete from waitlist where id = p_id;

  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (auth.uid(), 'waitlist_entry_deleted', 'waitlist', p_id, jsonb_build_object('email', v_email));
end;
$$;
