
create or replace function public.submit_in_home_vetting(p_kitchen uuid, p_docs jsonb, p_insurance_expires date default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from kitchens where id = p_kitchen;
  if v_owner is null then
    raise exception 'kitchen not found';
  end if;
  if v_owner <> auth.uid() then
    raise exception 'only the kitchen owner may submit in-home vetting';
  end if;

  perform public.check_rate_limit('submit_in_home_vetting', 10, interval '1 hour');

  perform set_config('app.privileged', 'on', true);

  update kitchen_private
     set in_home_vetting = jsonb_build_object('docs', p_docs, 'insuranceExpiresAt', p_insurance_expires, 'note', null),
         updated_at = now()
   where kitchen_id = p_kitchen;

  update kitchens
     set in_home_vetting_status = 'pending', in_home_vetting_reason = null
   where id = p_kitchen;

  insert into audit_log (actor_id, action, entity, entity_id)
  values (auth.uid(), 'in_home_vetting_submitted', 'kitchen', p_kitchen);
end $function$;

create or replace function public.admin_list_in_home_vetting()
returns table (
  kitchen_id uuid, kitchen_name text, applicant_name text, status verification_status,
  docs jsonb, insurance_expires_at date, submitted_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if coalesce((select role from profiles where id = auth.uid()), 'customer') <> 'admin' then
    raise exception 'only an admin may view the in-home vetting queue';
  end if;
  perform set_config('app.privileged', 'on', true);
  return query
    select k.id, k.name, p.display_name,
           k.in_home_vetting_status,
           kp.in_home_vetting -> 'docs',
           nullif(kp.in_home_vetting ->> 'insuranceExpiresAt', '')::date,
           kp.updated_at
      from kitchens k
      join kitchen_private kp on kp.kitchen_id = k.id
      left join profiles p on p.id = k.owner_id
     where k.in_home_vetting_status = 'pending'
     order by kp.updated_at asc;
end $function$;

create or replace function public.admin_set_in_home_vetting(p_kitchen uuid, p_approve boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_owner uuid;
begin
  if coalesce((select role from profiles where id = auth.uid()), 'customer') <> 'admin' then
    raise exception 'only an admin may decide in-home vetting';
  end if;
  if not p_approve and coalesce(length(btrim(p_reason)), 0) < 3 then
    raise exception 'a rejection reason is required';
  end if;

  perform public.check_rate_limit('admin_set_in_home_vetting', 30, interval '5 minutes');
  perform set_config('app.privileged', 'on', true);

  if p_approve then
    update kitchens
       set in_home_vetting_status = 'verified', in_home_vetted_at = now(), in_home_vetting_reason = null
     where id = p_kitchen and in_home_vetting_status = 'pending'
     returning owner_id into v_owner;
  else
    update kitchens
       set in_home_vetting_status = 'rejected', in_home_vetting_reason = p_reason
     where id = p_kitchen and in_home_vetting_status = 'pending'
     returning owner_id into v_owner;
  end if;

  if v_owner is null then
    raise exception 'kitchen has no pending in-home vetting review';
  end if;

  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (auth.uid(), case when p_approve then 'in_home_vetting_approved' else 'in_home_vetting_rejected' end, 'kitchen', p_kitchen,
          case when p_reason is not null then jsonb_build_object('reason', p_reason) else null end);

  perform notify(v_owner, 'kitchen',
    case when p_approve then 'In-home cooking approved 🎉' else 'In-home cooking needs changes' end,
    case when p_approve then 'You''re cleared to accept "Cook at My Place" bookings — background check and insurance verified.' else p_reason end);
end $function$;
