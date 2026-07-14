-- Fixes audit Critical #11: kitchen "vacation mode" only ever toggled local device state
-- (src/store/store.tsx `avail`, persisted to AsyncStorage) and never wrote to the
-- database, AND approve_kitchen never set availability='open' on approval (it stays at
-- the column default 'paused' forever) -- combined, this left the platform's only real
-- (non-seed) verified kitchens permanently unorderable in production.
--
-- NOT YET APPLIED to the live project -- prepared for review on the fix/audit-critical-batch-1
-- branch per the commit/PR/CI gate. Recommend applying promptly: it's a small, low-risk,
-- high-real-world-impact fix (the data-fix step at the bottom directly un-blocks the only
-- real supply on the platform today).

create or replace function public.set_kitchen_availability(p_kitchen_id uuid, p_open boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $body$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from kitchens where id = p_kitchen_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not your kitchen' using errcode = '42501';
  end if;

  update kitchens
     set availability = case when p_open then 'open'::kitchen_availability else 'paused'::kitchen_availability end
   where id = p_kitchen_id;

  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (auth.uid(), 'kitchen_availability_set', 'kitchen', p_kitchen_id, jsonb_build_object('open', p_open));
end;
$body$;

revoke all on function public.set_kitchen_availability(uuid, boolean) from public;
revoke all on function public.set_kitchen_availability(uuid, boolean) from anon;
grant execute on function public.set_kitchen_availability(uuid, boolean) to authenticated;

-- approve_kitchen: default a newly-approved kitchen to open for orders, instead of
-- leaving it stuck at the 'paused' column default forever.
create or replace function public.approve_kitchen(p_kitchen uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $body2$
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
     set verification_status = 'verified', approved_at = now(), availability = 'open'
   where id = p_kitchen and verification_status = 'pending'
   returning owner_id into v_owner;
  if v_owner is null then
    raise exception 'kitchen is not pending review (already decided or not found)';
  end if;

  update profiles set role = 'prepper', verification_status = 'verified' where id = v_owner;

  update verifications
     set status = 'verified', reviewed_by = auth.uid(), reviewed_at = now()
   where subject_id = v_owner and kind = 'kitchen' and status = 'pending';

  insert into audit_log (actor_id, action, entity, entity_id)
  values (auth.uid(), 'kitchen_approved', 'kitchen', p_kitchen);

  perform notify(v_owner, 'kitchen', 'Kitchen approved 🎉',
                 'Your kitchen is verified — you can start listing meals in My Hub.');
end $body2$;

-- Data fix: the only kitchens with a real kitchen_private compliance record are real
-- (non-seed) applicants that went through the actual application flow -- flip any of
-- those still stuck at 'paused' to 'open' now that approval sets it correctly going
-- forward. Scoped tightly (verified + has a real compliance row) so it can't touch the
-- seed fixture kitchens or any future legitimately-paused kitchen a prepper set on purpose
-- after this migration ships.
update kitchens
   set availability = 'open'
 where verification_status = 'verified'
   and availability = 'paused'
   and id in (select kitchen_id from kitchen_private);
