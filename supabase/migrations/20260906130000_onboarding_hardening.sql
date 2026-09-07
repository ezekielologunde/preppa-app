-- Onboarding hardening.
--
-- approve_kitchen/reject_kitchen already notify the applicant (see
-- high_fix_stripe_and_admin_rate_limiting and notifications_generation_on_events) -- that
-- part of the original plan turned out to already be done. What's still missing:
--   1. The food-handler cert number a cook types in at apply time is never actually checked
--      against anything -- add a reviewable status so an admin can mark it verified/expired
--      instead of it just sitting there as unverified free text forever.
--   2. Nobody ever reminds a verified-but-not-Stripe-onboarded cook to finish payout setup
--      (the ApprovalWelcomeOverlay only fires once, right after approval).
--   3. approve_kitchen/reject_kitchen still use the same deprecated
--      current_setting('request.jwt.claim.role') service-role check already identified as
--      broken and fixed elsewhere (critical_fix_rate_limit_service_role_detection,
--      kitchen_balance_cents above) -- align them while touching this file.

alter table public.kitchen_private
  add column if not exists food_handler_cert_status text not null default 'unverified'
    check (food_handler_cert_status in ('unverified', 'reviewed', 'expired')),
  add column if not exists food_handler_cert_expires_at date;

create or replace function public.admin_set_cert_status(p_kitchen uuid, p_status text, p_expires date default null)
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

  update kitchen_private
     set food_handler_cert_status = p_status,
         food_handler_cert_expires_at = p_expires,
         updated_at = now()
   where kitchen_id = p_kitchen;
  if not found then
    raise exception 'kitchen not found' using errcode = 'P0002';
  end if;

  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (auth.uid(), 'cert_status_set', 'kitchen', p_kitchen,
          jsonb_build_object('status', p_status, 'expires_at', p_expires));
end;
$$;
revoke all on function public.admin_set_cert_status(uuid, text, date) from public, anon;
grant execute on function public.admin_set_cert_status(uuid, text, date) to authenticated;

-- Surface the new cert fields in the admin application detail (same body as the current
-- 20260808043019 version, plus food_handler_cert_status/expires_at).
drop function if exists public.admin_application_detail(uuid);
create function public.admin_application_detail(p_kitchen uuid)
returns table(kitchen_id uuid, kitchen_name text, cuisine text, bio text, approx_area text, availability kitchen_availability, status verification_status, rejection_reason text, created_at timestamptz, applicant_id uuid, applicant_name text, applicant_first text, phone text, address text, food_safety jsonb, food_handler_cert text, food_handler_cert_status text, food_handler_cert_expires_at date, agreement_version text, agreement_accepted_at timestamptz, service_types text[], service_area text, experience text, verified_lat numeric, verified_lng numeric)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select k.id, k.name, k.cuisine, k.bio, k.approx_area, k.availability,
         k.verification_status, k.rejection_reason, k.created_at,
         p.id, p.display_name, p.first_name,
         kp.phone, kp.address, kp.food_safety, kp.food_handler_cert, kp.food_handler_cert_status, kp.food_handler_cert_expires_at,
         kp.agreement_version, kp.agreement_accepted_at,
         kp.service_types, kp.service_area, kp.experience, kp.verified_lat, kp.verified_lng
  from kitchens k
  join profiles p on p.id = k.owner_id
  left join kitchen_private kp on kp.kitchen_id = k.id
  where public.is_admin() and k.id = p_kitchen;
$function$;
revoke all on function public.admin_application_detail(uuid) from public;
grant execute on function public.admin_application_detail(uuid) to authenticated;

-- approve_kitchen / reject_kitchen: same body as the current (20260715220353 / 20260711000939)
-- versions, just with the service-role check aligned to auth.role().
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
  if auth.role() <> 'service_role' and coalesce(v_caller_role, 'customer') <> 'admin' then
    raise exception 'only an admin may approve a kitchen';
  end if;

  if auth.role() <> 'service_role' then
    perform public.check_rate_limit('approve_kitchen', 10, interval '5 minutes');
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

create or replace function public.reject_kitchen(p_kitchen uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $body3$
declare
  v_owner uuid;
  v_caller_role user_role;
begin
  select role into v_caller_role from profiles where id = auth.uid();
  if auth.role() <> 'service_role' and coalesce(v_caller_role, 'customer') <> 'admin' then
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
  values (auth.uid(), 'kitchen_rejected', 'kitchen', p_kitchen, jsonb_build_object('reason', p_reason));

  perform notify(v_owner, 'kitchen', 'Application needs changes', p_reason);
end $body3$;

-- Nudge a verified cook who never finished Stripe onboarding. Modelled on
-- notify_payout_available's own reminder-state table (same cooldown-tracking shape).
create table if not exists public._notify_stripe_setup_state (
  kitchen_id uuid primary key references public.kitchens(id) on delete cascade,
  last_reminder_at timestamptz not null
);
alter table public._notify_stripe_setup_state enable row level security;
-- default-deny: only nudge_stripe_onboarding() (SECURITY DEFINER) touches this table.

create or replace function public.nudge_stripe_onboarding()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
  v_cooldown constant interval := interval '72 hours';
begin
  for r in
    select k.id, k.owner_id
    from kitchens k
    left join stripe_accounts sa on sa.kitchen_id = k.id
    left join public._notify_stripe_setup_state st on st.kitchen_id = k.id
    where k.verification_status = 'verified'
      and k.approved_at < now() - interval '24 hours'
      and (sa.kitchen_id is null or not coalesce(sa.payouts_enabled, false))
      and (st.last_reminder_at is null or st.last_reminder_at < now() - v_cooldown)
  loop
    perform notify(r.owner_id, 'payout', 'Finish setting up payouts',
                    'You’re verified — finish Stripe payout setup in My Hub so you can start getting paid.');
    insert into public._notify_stripe_setup_state (kitchen_id, last_reminder_at)
    values (r.id, now())
    on conflict (kitchen_id) do update set last_reminder_at = excluded.last_reminder_at;
  end loop;
exception when others then null; -- a reminder must never break anything else
end;
$$;
revoke all on function public.nudge_stripe_onboarding() from public, anon, authenticated;
grant execute on function public.nudge_stripe_onboarding() to service_role;

do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.unschedule('stripe-setup-nudge')
      where exists (select 1 from cron.job where jobname = 'stripe-setup-nudge');
    perform cron.schedule('stripe-setup-nudge', '0 15 * * *', $job$ select public.nudge_stripe_onboarding(); $job$);
  end if;
end $$;
