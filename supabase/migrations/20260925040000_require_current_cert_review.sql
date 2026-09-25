-- Keep the audited food-handler certificate decision truthful even when the RPC is
-- called outside the admin UI. A reviewed certificate needs a real, current expiry.
create or replace function public.admin_set_cert_status(
  p_kitchen uuid,
  p_status text,
  p_expires date default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  if p_status not in ('unverified', 'reviewed', 'expired') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  if p_status = 'reviewed' and p_expires is null then
    raise exception 'a reviewed certificate requires an expiration date' using errcode = '22023';
  end if;
  if p_status = 'reviewed' and p_expires < current_date then
    raise exception 'an expired certificate cannot be marked reviewed' using errcode = '22023';
  end if;

  update kitchen_private
     set food_handler_cert_status = p_status,
         food_handler_cert_expires_at = case when p_status = 'unverified' then null else p_expires end,
         updated_at = now()
   where kitchen_id = p_kitchen;
  if not found then
    raise exception 'kitchen not found' using errcode = 'P0002';
  end if;

  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (auth.uid(), 'cert_status_set', 'kitchen', p_kitchen,
          jsonb_build_object('status', p_status, 'expires_at', case when p_status = 'unverified' then null else p_expires end));
end;
$$;

revoke all on function public.admin_set_cert_status(uuid, text, date) from public, anon;
grant execute on function public.admin_set_cert_status(uuid, text, date) to authenticated, service_role;
