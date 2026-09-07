create or replace function public.admin_delete_waitlist_entry(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  delete from waitlist where id = p_id;
end;
$$;
