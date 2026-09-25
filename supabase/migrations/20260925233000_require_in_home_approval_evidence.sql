-- In-home approval grants access to work inside customer homes. Require the evidence
-- named by the approval workflow at the authoritative mutation boundary.
create or replace function public.admin_set_in_home_vetting(p_kitchen uuid, p_approve boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_owner uuid;
  v_docs jsonb;
  v_insurance_expires date;
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
    select kp.in_home_vetting -> 'docs',
           nullif(kp.in_home_vetting ->> 'insuranceExpiresAt', '')::date
      into v_docs, v_insurance_expires
      from kitchen_private kp
     where kp.kitchen_id = p_kitchen;

    if coalesce(jsonb_typeof(v_docs -> 'backgroundCheck'), '') <> 'array' then
      raise exception 'a background-check document is required for approval';
    end if;
    if jsonb_array_length(v_docs -> 'backgroundCheck') < 1 then
      raise exception 'a background-check document is required for approval';
    end if;
    if coalesce(jsonb_typeof(v_docs -> 'insurance'), '') <> 'array' then
      raise exception 'an insurance document is required for approval';
    end if;
    if jsonb_array_length(v_docs -> 'insurance') < 1 then
      raise exception 'an insurance document is required for approval';
    end if;
    if v_insurance_expires is null or v_insurance_expires < current_date then
      raise exception 'current insurance is required for approval';
    end if;

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
