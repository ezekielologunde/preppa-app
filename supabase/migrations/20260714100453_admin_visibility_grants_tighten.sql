-- Close the anon-EXECUTE gap the advisor flagged on the 8 new admin RPCs (same class of
-- issue already present on admin_list_users; is_admin() still gates rows, but there's no
-- reason to let anon/unauthenticated even call these).
revoke all on function public.admin_list_plans() from public, anon, authenticated;
grant execute on function public.admin_list_plans() to authenticated;

revoke all on function public.admin_plan_detail(uuid) from public, anon, authenticated;
grant execute on function public.admin_plan_detail(uuid) to authenticated;

revoke all on function public.admin_list_subscriptions() from public, anon, authenticated;
grant execute on function public.admin_list_subscriptions() to authenticated;

revoke all on function public.admin_subscription_detail(uuid) from public, anon, authenticated;
grant execute on function public.admin_subscription_detail(uuid) to authenticated;

revoke all on function public.admin_list_service_requests() from public, anon, authenticated;
grant execute on function public.admin_list_service_requests() to authenticated;

revoke all on function public.admin_service_request_detail(uuid) from public, anon, authenticated;
grant execute on function public.admin_service_request_detail(uuid) to authenticated;

revoke all on function public.admin_list_bookings() from public, anon, authenticated;
grant execute on function public.admin_list_bookings() to authenticated;

revoke all on function public.admin_booking_detail(uuid) from public, anon, authenticated;
grant execute on function public.admin_booking_detail(uuid) to authenticated;
