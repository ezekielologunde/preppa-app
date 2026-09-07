
revoke all on function public.submit_in_home_vetting(uuid, jsonb, date) from public, anon;
revoke all on function public.admin_list_in_home_vetting() from public, anon;
revoke all on function public.admin_set_in_home_vetting(uuid, boolean, text) from public, anon;
grant execute on function public.submit_in_home_vetting(uuid, jsonb, date) to authenticated;
grant execute on function public.admin_list_in_home_vetting() to authenticated;
grant execute on function public.admin_set_in_home_vetting(uuid, boolean, text) to authenticated;
