-- HIGH/MEDIUM batch from the extended follow-on security audit:
-- 0) Helper: CHECK constraints can't contain subqueries, so array-of-URLs validation needs a
--    small IMMUTABLE wrapper function instead of an inline `unnest`+`exists` subquery.
create or replace function public.is_allowed_media_url_array(urls text[])
returns boolean
language plpgsql immutable
as $$
declare u text;
begin
  if urls is null then return true; end if;
  foreach u in array urls loop
    if not is_allowed_media_url(u) then return false; end if;
  end loop;
  return true;
end;
$$;

-- 1) plans.cover_url/photo_urls and experiences.cover_url/photo_urls accepted any string up to
--    600 chars with no domain allowlist - same vuln class already fixed for create_post's media
--    URLs (is_allowed_media_url), just unpatched on these two tables. No existing rows violate
--    this (verified before adding), so the constraint is added already-validated.
alter table public.plans
  add constraint plans_cover_url_allowlist check (cover_url is null or is_allowed_media_url(cover_url)),
  add constraint plans_photo_urls_allowlist check (is_allowed_media_url_array(photo_urls));

alter table public.experiences
  add constraint experiences_cover_url_allowlist check (cover_url is null or is_allowed_media_url(cover_url)),
  add constraint experiences_photo_urls_allowlist check (is_allowed_media_url_array(photo_urls));

-- 2) admin_delete_waitlist_entry/admin_list_users/admin_list_waitlist uniquely had EXECUTE
--    granted to PUBLIC/anon (every other admin_* function is authenticated-only). Not currently
--    exploitable (is_admin() gates rows/returns false for a null auth.uid()), but a needless
--    pre-auth surface flagged by both this audit and Supabase's own advisor.
revoke all on function public.admin_delete_waitlist_entry(uuid) from public, anon;
grant execute on function public.admin_delete_waitlist_entry(uuid) to authenticated;

revoke all on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;

revoke all on function public.admin_list_waitlist(integer, timestamptz) from public, anon;
grant execute on function public.admin_list_waitlist(integer, timestamptz) to authenticated;

-- 3) audit_log had blanket INSERT/SELECT/UPDATE/DELETE/TRUNCATE granted to anon/authenticated at
--    the table level. RLS is enabled with zero policies (already default-deny for the 4 RLS-
--    governed operations), but TRUNCATE is NOT governed by RLS at all - not reachable via
--    PostgREST today (no TRUNCATE verb exposed), but pure unnecessary exposure at the SQL grant
--    level. All writes happen via SECURITY DEFINER admin_* RPCs, which run as the function owner,
--    not as anon/authenticated, so revoking these table grants breaks nothing.
revoke all on public.audit_log from anon, authenticated;
