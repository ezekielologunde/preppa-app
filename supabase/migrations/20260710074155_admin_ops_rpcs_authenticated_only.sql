-- Defense in depth: these are gated by is_admin() internally (anon already gets
-- zero rows), but there's no reason for anon to invoke them at all. Restrict the
-- new admin read RPCs to authenticated only.
revoke execute on function public.admin_list_orders() from public, anon;
revoke execute on function public.admin_order_detail(uuid) from public, anon;
revoke execute on function public.admin_list_users() from public, anon;
revoke execute on function public.admin_list_audit(int, timestamptz) from public, anon;
revoke execute on function public.admin_overview() from public, anon;

grant execute on function public.admin_list_orders() to authenticated;
grant execute on function public.admin_order_detail(uuid) to authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_list_audit(int, timestamptz) to authenticated;
grant execute on function public.admin_overview() to authenticated;
