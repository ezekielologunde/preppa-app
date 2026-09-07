create or replace function public.admin_list_waitlist(p_limit integer default 100, p_before timestamptz default null)
returns table(id uuid, email text, zip text, source text, created_at timestamptz)
language sql
stable security definer
set search_path to 'public'
as $$
  select w.id, w.email::text, w.zip, w.source, w.created_at
  from waitlist w
  where public.is_admin()
    and (p_before is null or w.created_at < p_before)
  order by w.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;
