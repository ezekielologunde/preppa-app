-- CRITICAL production fix: checkout has been failing (HTTP 429 on create-order,
-- payment-methods, and every other Edge Function that passes an explicit p_subject)
-- since 2026-07-15. No order has been placed since 2026-07-15 and the rate_limits
-- table has never received a single row.
--
-- Root cause: check_rate_limit (added in 20260715010000, tweaked in 20260715010100)
-- detects service-role callers with:
--     current_setting('request.jwt.claim.role', true) = 'service_role'
-- That singular per-claim GUC is the DEPRECATED PostgREST claim mechanism and is NOT
-- populated by the PostgREST version this project runs -- it only sets the aggregate
-- 'request.jwt.claims' JSON GUC. So the expression returns NULL for a genuine
-- service-role caller. The 20260715010100 "null_role_gap" migration then made that
-- NULL fail CLOSED (coalesce(v_is_service, false) -> reject), on the assumption that
-- real service-role callers "would have the GUC set." They don't. Result: Edge
-- Functions (which validate the user's JWT themselves and then call this via the
-- service-role admin client with an explicit p_subject) always hit
--     raise 'rate_limit: explicit subject is only allowed for service_role callers'
-- which create-order/payment-methods surface to the client as a 429.
--
-- Fix: detect the role with auth.role(), Supabase's canonical helper, which coalesces
-- the deprecated per-claim GUC with the 'request.jwt.claims' JSON fallback -- exactly
-- what auth.uid() already does successfully in this same function. Security intent is
-- preserved: a non-service caller passing an explicit p_subject is still rejected, and
-- the NULL/unauthenticated case still fails closed.

create or replace function public.check_rate_limit(p_action text, p_max_count int, p_window interval, p_subject uuid default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $body$
declare
  v_is_service boolean := auth.role() = 'service_role';
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
