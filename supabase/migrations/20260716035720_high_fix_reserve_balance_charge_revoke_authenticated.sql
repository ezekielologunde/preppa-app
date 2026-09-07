-- Security-advisor finding (authenticated_security_definer_function_executable): reserve_balance_charge
-- was granted to `authenticated` on the assumption a client might call it directly with its own JWT
-- (mirroring reserve_payout's grants), but the actual complete-booking Edge Function built this session
-- only ever calls it through the service-role admin() client -- the same pattern cancel-booking and
-- live-end already use. service_role already has implicit execute rights via this project's default
-- schema privileges (confirmed via has_function_privilege), so nothing is lost by tightening this.
-- The `is distinct from service_role` ownership-check bypass in the function body is left in place as
-- defense-in-depth (harmless if this is ever re-opened to authenticated later), matching this
-- session's established minimal-grants convention (see the check_rate_limit revoke earlier today).
revoke execute on function public.reserve_balance_charge(uuid) from authenticated;
grant execute on function public.reserve_balance_charge(uuid) to service_role;
