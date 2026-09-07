-- Trigger functions are invoked by the system, never via PostgREST RPC, and
-- trigger firing does not check the calling role's EXECUTE privilege.
-- Revoking these grants removes needless API-role surface (security linter
-- 0028/0029) with no behavior change. Reversible via GRANT EXECUTE.
revoke execute on function public.enforce_message_kind() from public, anon, authenticated;
revoke execute on function public.refresh_kitchen_is_pro() from public, anon, authenticated;
revoke execute on function public.sync_cook_pro_membership() from public, anon, authenticated;
