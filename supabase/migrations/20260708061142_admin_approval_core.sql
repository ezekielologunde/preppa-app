-- Admin helper: SECURITY DEFINER so it reads profiles without being re-filtered by
-- profiles' own RLS. Not callable by anon. Used inside RPCs (defense-in-depth) and
-- (later) any admin-scoped RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- Complete the original design: approve_kitchen already authorizes an admin JWT in its
-- body; it was simply never granted to authenticated. Also harden it to only act on a
-- kitchen that is actually pending review (idempotent; no double-approve / re-approve).
create or replace function public.approve_kitchen(p_kitchen uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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
   where id = p_kitchen and verification_status = 'pending'
   returning owner_id into v_owner;
  if v_owner is null then
    raise exception 'kitchen is not pending review (already decided or not found)';
  end if;

  update profiles
     set role = 'prepper', verification_status = 'verified'
   where id = v_owner;

  update verifications
     set status = 'verified', reviewed_by = auth.uid(), reviewed_at = now()
   where subject_id = v_owner and kind = 'kitchen' and status = 'pending';

  insert into audit_log (actor_id, action, entity, entity_id)
  values (auth.uid(), 'kitchen_approved', 'kitchen', p_kitchen);
end $function$;
grant execute on function public.approve_kitchen(uuid) to authenticated;

-- So a rejected applicant can read why (via existing kitchens_select_own policy) and re-apply.
alter table public.kitchens add column if not exists rejection_reason text;

-- Symmetric rejection: requires a reason (validated in-DB), leaves the owner profile
-- untouched (never promoted), audits with the reason, only acts on a pending application.
create or replace function public.reject_kitchen(p_kitchen uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_owner uuid;
  v_caller_role user_role;
begin
  select role into v_caller_role from profiles where id = auth.uid();
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role'
     and coalesce(v_caller_role, 'customer') <> 'admin' then
    raise exception 'only an admin may reject a kitchen';
  end if;

  if coalesce(length(btrim(p_reason)), 0) < 3 then
    raise exception 'a rejection reason is required';
  end if;

  perform set_config('app.privileged', 'on', true);

  update kitchens
     set verification_status = 'rejected', rejection_reason = p_reason
   where id = p_kitchen and verification_status = 'pending'
   returning owner_id into v_owner;
  if v_owner is null then
    raise exception 'kitchen is not pending review (already decided or not found)';
  end if;

  update verifications
     set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
   where subject_id = v_owner and kind = 'kitchen' and status = 'pending';

  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (auth.uid(), 'kitchen_rejected', 'kitchen', p_kitchen,
          jsonb_build_object('reason', p_reason));
end $function$;
revoke execute on function public.reject_kitchen(uuid, text) from public, anon;
grant execute on function public.reject_kitchen(uuid, text) to authenticated, service_role;
