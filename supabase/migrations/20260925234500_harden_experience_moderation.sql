-- Experience moderation must not publish an unbookable listing or mutate a record
-- that has already left the review queue.
create or replace function public.admin_set_experience_status(p_experience uuid, p_status text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_updated uuid;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;
  if p_status not in ('published', 'archived') then
    raise exception 'invalid moderation status';
  end if;

  perform public.check_rate_limit('admin_set_experience_status', 30, interval '5 minutes');

  if p_status = 'published' and not exists (
    select 1
      from public.experience_sessions s
     where s.experience_id = p_experience
       and s.status = 'open'
       and s.starts_at > now()
  ) then
    raise exception 'an open future session is required before publishing';
  end if;

  update public.experiences
     set status = p_status, updated_at = now()
   where id = p_experience and status = 'pending'
   returning id into v_updated;

  if v_updated is null then
    raise exception 'experience is not pending review';
  end if;

  insert into public.audit_log(actor_id, action, entity, entity_id, meta)
  values (auth.uid(), 'experience_' || p_status, 'experience', p_experience, '{}'::jsonb);
end
$function$;
