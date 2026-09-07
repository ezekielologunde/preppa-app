-- Private application details (owner + admin only) — phone/address/food-safety/agreement.
create table if not exists public.kitchen_private (
  kitchen_id uuid primary key references public.kitchens(id) on delete cascade,
  phone text,
  address text,
  food_safety jsonb,
  food_handler_cert text,
  agreement_version text,
  agreement_accepted_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.kitchen_private enable row level security;
drop policy if exists kitchen_private_owner_or_admin_read on public.kitchen_private;
create policy kitchen_private_owner_or_admin_read on public.kitchen_private
  for select using (
    public.is_admin()
    or exists (select 1 from public.kitchens k where k.id = kitchen_id and k.owner_id = auth.uid())
  );
-- writes only via the SECURITY DEFINER RPC below (no client insert/update policy).

-- Extended application RPC: writes kitchen + private details + verification + audit.
drop function if exists public.request_prepper_application(text, text, text);
create or replace function public.request_prepper_application(
  p_kitchen_name text,
  p_cuisine text default null,
  p_approx_area text default null,
  p_bio text default null,
  p_phone text default null,
  p_address text default null,
  p_food_safety jsonb default null,
  p_food_handler_cert text default null,
  p_agreement_version text default null
) returns uuid
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_kitchen uuid;
  v_slug citext;
  v_existing_id uuid;
  v_existing_status verification_status;
begin
  if v_uid is null then raise exception 'must be signed in to apply'; end if;
  if length(coalesce(p_kitchen_name, '')) < 2 then raise exception 'kitchen name is too short'; end if;

  select id, verification_status into v_existing_id, v_existing_status
  from kitchens where owner_id = v_uid order by created_at desc limit 1;

  if v_existing_status in ('unverified', 'pending') then
    raise exception 'you already have a pending kitchen application';
  end if;

  v_slug := lower(regexp_replace(p_kitchen_name, '[^a-zA-Z0-9]+', '-', 'g'))
            || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  if v_existing_status = 'rejected' then
    perform set_config('app.privileged', 'on', true);
    update kitchens
       set name = p_kitchen_name, slug = v_slug, cuisine = p_cuisine, bio = p_bio, approx_area = p_approx_area,
           availability = 'paused', verification_status = 'pending', rejection_reason = null, approved_at = null
     where id = v_existing_id;
    v_kitchen := v_existing_id;
  else
    insert into kitchens (owner_id, name, slug, cuisine, bio, approx_area, availability, verification_status)
    values (v_uid, p_kitchen_name, v_slug, p_cuisine, p_bio, p_approx_area, 'paused', 'pending')
    returning id into v_kitchen;
  end if;

  insert into kitchen_private (kitchen_id, phone, address, food_safety, food_handler_cert, agreement_version, agreement_accepted_at, updated_at)
  values (v_kitchen, p_phone, p_address, p_food_safety, p_food_handler_cert, p_agreement_version, now(), now())
  on conflict (kitchen_id) do update set
    phone = excluded.phone, address = excluded.address, food_safety = excluded.food_safety,
    food_handler_cert = excluded.food_handler_cert, agreement_version = excluded.agreement_version,
    agreement_accepted_at = excluded.agreement_accepted_at, updated_at = now();

  insert into verifications (subject_id, kind, status) values (v_uid, 'kitchen', 'pending');

  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (v_uid, 'prepper_application_submitted', 'kitchen', v_kitchen,
          jsonb_build_object('name', p_kitchen_name, 'agreement_version', p_agreement_version, 'reused', v_existing_status = 'rejected'));

  return v_kitchen;
end $function$;

-- Admin detail now includes the private fields for review.
drop function if exists public.admin_application_detail(uuid);
create or replace function public.admin_application_detail(p_kitchen uuid)
returns table(kitchen_id uuid, kitchen_name text, cuisine text, bio text, approx_area text,
  availability kitchen_availability, status verification_status, rejection_reason text, created_at timestamptz,
  applicant_id uuid, applicant_name text, applicant_first text,
  phone text, address text, food_safety jsonb, food_handler_cert text, agreement_version text, agreement_accepted_at timestamptz)
language sql stable security definer set search_path to 'public'
as $function$
  select k.id, k.name, k.cuisine, k.bio, k.approx_area, k.availability,
         k.verification_status, k.rejection_reason, k.created_at,
         p.id, p.display_name, p.first_name,
         kp.phone, kp.address, kp.food_safety, kp.food_handler_cert, kp.agreement_version, kp.agreement_accepted_at
  from kitchens k
  join profiles p on p.id = k.owner_id
  left join kitchen_private kp on kp.kitchen_id = k.id
  where public.is_admin() and k.id = p_kitchen;
$function$;
