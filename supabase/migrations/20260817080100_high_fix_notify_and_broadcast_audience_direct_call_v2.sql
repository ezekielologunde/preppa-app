-- Follow-up to 20260817080000 in this same pass: proacl showed authenticated
-- had an EXPLICIT direct grant on all three functions (authenticated=X/postgres),
-- not one inherited via PUBLIC -- so `revoke ... from public` alone was a no-op
-- against that explicit grant (the opposite failure mode from the one documented
-- elsewhere in this codebase's history, where revoking from anon/authenticated
-- directly was the no-op because PUBLIC itself held the grant). Verified via
-- has_function_privilege immediately after the first attempt that all three were
-- still callable by authenticated -- confirming the gap before reapplying here.
--
-- Re-verified after this migration: has_function_privilege now returns false for
-- authenticated on all three; my_broadcast_audience_count()/send_kitchen_broadcast()
-- (the only legitimate callers) still succeed; an actual impersonated direct call
-- to notify() now raises `permission denied for function notify` at runtime.
revoke execute on function public.notify(uuid, text, text, text) from authenticated, public;
revoke execute on function public.kitchen_broadcast_audience(uuid) from authenticated, public;
revoke execute on function public.notify_experience_waitlist(uuid) from authenticated, public;
