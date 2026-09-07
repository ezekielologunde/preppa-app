-- Follow-up to high_security_hardening_anon_execute_and_view: REVOKE ... FROM anon alone did
-- not work because Postgres grants EXECUTE to the PUBLIC pseudo-role by default at function
-- creation, and every role (including anon) is implicitly a member of PUBLIC. Verified via
-- has_function_privilege() after the first migration: every function except
-- prepper_incoming_requests still showed anon_can_exec=true. Must revoke from PUBLIC explicitly,
-- then re-grant to the roles that should keep access.

revoke execute on function public.ack_approval_notice() from public;
grant execute on function public.ack_approval_notice() to authenticated;

revoke execute on function public.cook_owns_subscription(uuid) from public;
grant execute on function public.cook_owns_subscription(uuid) to authenticated;

revoke execute on function public.create_post(text, text, text, uuid, text) from public;
grant execute on function public.create_post(text, text, text, uuid, text) to authenticated;

revoke execute on function public.kitchen_list_orders() from public;
grant execute on function public.kitchen_list_orders() to authenticated;

revoke execute on function public.kitchen_order_detail(uuid) from public;
grant execute on function public.kitchen_order_detail(uuid) to authenticated;

revoke execute on function public.owns_subscription(uuid) from public;
grant execute on function public.owns_subscription(uuid) to authenticated;

revoke execute on function public.update_order_status(uuid, text) from public;
grant execute on function public.update_order_status(uuid, text) to authenticated;

-- Trigger-only functions: revoke from PUBLIC entirely, no re-grant (never called directly).
revoke execute on function public.enforce_message_rate_limit() from public;
revoke execute on function public.on_message_insert() from public;
revoke execute on function public.reconcile_paid_invoice() from public;
revoke execute on function public.set_message_sender_role() from public;

-- is_kitchen_orderable / is_kitchen_owner / is_active_kitchen_owner: left untouched, still
-- granted to PUBLIC (required for anon RLS policy evaluation -- see prior migration's note).;
