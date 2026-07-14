-- HIGH: is_kitchen_owner(kid) only checked owner_id, never verification_status, so a
-- suspended/rejected kitchen owner retained access to messaging RPCs (create_ticket,
-- add_ticket_message, report_message, open_thread, set_thread_block, mark_thread_read,
-- set_message_sender_role, my_thread_unread_count, list_threads, thread_header) and financial
-- summary RPCs (kitchen_balance_cents, kitchen_earnings_summary) even after revocation. Confirmed
-- via live grep: every caller of is_kitchen_owner() is a messaging/ticket/financial-summary path,
-- none are onboarding/application-stage flows, so tightening to require 'verified' is safe.
create or replace function public.is_kitchen_owner(kid uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $function$
  select exists (
    select 1 from kitchens k
    where k.id = kid and k.owner_id = auth.uid() and k.verification_status = 'verified'
  );
$function$;
