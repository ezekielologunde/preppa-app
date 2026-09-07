create policy "deny_all_client_access" on public._notify_payout_reminder_state for all to anon, authenticated using (false);
create policy "deny_all_client_access" on public.audit_log for all to anon, authenticated using (false);
create policy "deny_all_client_access" on public.livestream_secrets for all to anon, authenticated using (false);
create policy "deny_all_client_access" on public.rate_limits for all to anon, authenticated using (false);
create policy "deny_all_client_access" on public.service_request_targets for all to anon, authenticated using (false);
