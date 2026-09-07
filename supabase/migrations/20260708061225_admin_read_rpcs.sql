-- Column-scoped admin reads. SQL + `where is_admin()` => non-admin callers get zero
-- rows (leak-free, mirrors RLS). No broad SELECT on financial/PII tables.

-- Pending prepper applications queue.
create or replace function public.admin_list_applications()
returns table (
  kitchen_id     uuid,
  kitchen_name   text,
  cuisine        text,
  approx_area    text,
  applicant_id   uuid,
  applicant_name text,
  status         verification_status,
  applied_at     timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select k.id, k.name, k.cuisine, k.approx_area,
         p.id, p.display_name, k.verification_status, k.created_at
  from kitchens k
  join profiles p on p.id = k.owner_id
  where public.is_admin()
    and k.verification_status = 'pending'
  order by k.created_at asc;
$$;
revoke execute on function public.admin_list_applications() from public, anon;
grant execute on function public.admin_list_applications() to authenticated, service_role;

-- One application's review detail (single row).
create or replace function public.admin_application_detail(p_kitchen uuid)
returns table (
  kitchen_id       uuid,
  kitchen_name     text,
  cuisine          text,
  bio              text,
  approx_area      text,
  availability     kitchen_availability,
  status           verification_status,
  rejection_reason text,
  created_at       timestamptz,
  applicant_id     uuid,
  applicant_name   text,
  applicant_first  text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select k.id, k.name, k.cuisine, k.bio, k.approx_area, k.availability,
         k.verification_status, k.rejection_reason, k.created_at,
         p.id, p.display_name, p.first_name
  from kitchens k
  join profiles p on p.id = k.owner_id
  where public.is_admin()
    and k.id = p_kitchen;
$$;
revoke execute on function public.admin_application_detail(uuid) from public, anon;
grant execute on function public.admin_application_detail(uuid) to authenticated, service_role;

-- Dashboard headline counts.
create or replace function public.admin_overview()
returns table (
  pending_applications bigint,
  verified_kitchens    bigint,
  total_kitchens       bigint,
  preppers             bigint
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    (select count(*) from kitchens where verification_status = 'pending'),
    (select count(*) from kitchens where verification_status = 'verified'),
    (select count(*) from kitchens),
    (select count(*) from profiles where role = 'prepper')
  where public.is_admin();
$$;
revoke execute on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated, service_role;
