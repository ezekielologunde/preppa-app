-- Fixes a self-review catch in check_rate_limit (added in high_fix_stripe_and_admin_rate_limiting,
-- same day): PL/pgSQL's three-valued logic means `if not v_is_service then` treats a NULL
-- v_is_service (current_setting returning null, e.g. a raw non-PostgREST connection with no
-- request.jwt.claim.role GUC set at all) as FALSE for the branch, not TRUE -- so an explicit
-- p_subject would silently be accepted instead of rejected whenever that GUC is simply unset,
-- rather than only when a caller is genuinely and explicitly non-service_role. Fail-open on a
-- security check is wrong regardless of whether today's callers happen to always set the GUC.
--
-- NOTE: applied live via Supabase MCP apply_migration before this file was backfilled to git --
-- see the "git vs live drift" pattern this project's own audits have flagged repeatedly.
create or replace function public.check_rate_limit(p_action text, p_max_count int, p_window interval, p_subject uuid default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $body$
declare
  v_is_service boolean := current_setting('request.jwt.claim.role', true) = 'service_role';
  v_subject uuid;
  v_recent int;
begin
  if p_subject is not null then
    if not coalesce(v_is_service, false) then
      raise exception 'rate_limit: explicit subject is only allowed for service_role callers';
    end if;
    v_subject := p_subject;
  else
    v_subject := auth.uid();
  end if;

  if v_subject is null then
    raise exception 'rate_limit: unauthenticated';
  end if;

  select count(*) into v_recent
  from rate_limits
  where subject_id = v_subject and action = p_action and created_at > now() - p_window;

  if v_recent >= p_max_count then
    raise exception 'rate_limit: too many attempts, please slow down and try again shortly';
  end if;

  insert into rate_limits (subject_id, action) values (v_subject, p_action);
end;
$body$;
