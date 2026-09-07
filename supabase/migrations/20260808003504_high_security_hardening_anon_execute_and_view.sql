-- Security-advisor hardening pass (2026-07 launch prep).
--
-- 1) Revoke anon EXECUTE from 8 SECURITY DEFINER RPCs that are real user actions gated on
--    auth.uid() and are NOT referenced by any anon-facing RLS policy (verified via pg_policies
--    before touching anything). Authenticated keeps access; anon calling these today just hits
--    "auth required" exceptions, but least-privilege says anon shouldn't be able to call them
--    at all.
revoke execute on function public.ack_approval_notice() from anon;
revoke execute on function public.cook_owns_subscription(uuid) from anon;
revoke execute on function public.create_post(text, text, text, uuid, text) from anon;
revoke execute on function public.kitchen_list_orders() from anon;
revoke execute on function public.kitchen_order_detail(uuid) from anon;
revoke execute on function public.owns_subscription(uuid) from anon;
revoke execute on function public.prepper_incoming_requests() from anon;
revoke execute on function public.update_order_status(uuid, text) from anon;

-- NOTE: is_kitchen_orderable / is_kitchen_owner / is_active_kitchen_owner are DELIBERATELY NOT
-- touched here despite being flagged anon-executable. Verified via pg_policies that they're
-- referenced in RLS policies applied to anon (meals_select_live_public roles={anon,authenticated},
-- livestreams_select_public / meals_write_own / kitchen_capacity / plans_owner_write roles={public}).
-- Revoking anon EXECUTE would make Postgres raise "permission denied for function" for any anon
-- query that evaluates those policy branches, breaking public menu/livestream browsing outright.

-- 2) Trigger-only functions (confirmed via pg_trigger -- never called directly by client code):
--    Postgres's trigger-invocation mechanism doesn't require the firing role to hold EXECUTE on
--    the trigger function, so revoking from anon+authenticated is safe and closes the direct-call
--    surface entirely.
revoke execute on function public.enforce_message_rate_limit() from anon, authenticated;
revoke execute on function public.on_message_insert() from anon, authenticated;
revoke execute on function public.reconcile_paid_invoice() from anon, authenticated;
revoke execute on function public.set_message_sender_role() from anon, authenticated;

-- 3) kitchen_rating is a plain public aggregate (avg/count over reviews) with no reason to run
--    with the view-owner's elevated privileges. security_invoker makes it respect the querying
--    role's own RLS instead of bypassing it.
alter view public.kitchen_rating set (security_invoker = true);

-- 4) Pin search_path on the 2 app-owned functions the advisor flagged with a mutable path
--    (the other flagged names belong to the citext extension and are out of scope here).
--    Both are already effectively safe (STRICT IMMUTABLE string matching / plain arithmetic with
--    no dynamic SQL), but pinning search_path is cheap and removes the advisor finding.
alter function public.is_allowed_media_url(text) set search_path = 'public';
alter function public.is_allowed_media_url_array(text[]) set search_path = 'public';
alter function public.set_public_support_ref() set search_path = 'public';
