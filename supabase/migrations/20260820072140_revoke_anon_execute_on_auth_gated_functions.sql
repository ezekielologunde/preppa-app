-- Defense-in-depth: these SECURITY DEFINER functions all require an authenticated
-- (or admin/owner) caller internally, so anonymous callers only ever receive an
-- error or an empty result. Revoking anon EXECUTE removes them from the anonymous
-- PostgREST RPC surface entirely (flagged by Supabase security advisor lint 0028).
-- Rollback: GRANT EXECUTE ON FUNCTION <fn> TO anon; for each function below.
revoke execute on function public.admin_application_detail(uuid) from anon;
revoke execute on function public.cook_analytics_summary(uuid) from anon;
revoke execute on function public.cook_pro_sales_summary(uuid) from anon;
revoke execute on function public.open_thread_as_kitchen(uuid, text, uuid) from anon;
revoke execute on function public.request_prepper_application(text, text, text, text, text, text, jsonb, text, text, text[], text, text, numeric, numeric) from anon;
-- request_prepper_application also carries a PUBLIC (empty grantee) EXECUTE grant;
-- remove it so the anon revoke is effective. authenticated/service_role keep explicit grants.
revoke execute on function public.request_prepper_application(text, text, text, text, text, text, jsonb, text, text, text[], text, text, numeric, numeric) from public;
