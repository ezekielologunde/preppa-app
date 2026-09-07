-- Audit remediation (safe, advisor-recommended): cover foreign-key columns with
-- btree indexes to prevent seq-scan cascades on joins / cascade-deletes as tables
-- grow. Cheap now while tables are tiny.
create index if not exists idx_audit_log_actor_id on public.audit_log(actor_id);
create index if not exists idx_ledger_entries_order_id on public.ledger_entries(order_id);
create index if not exists idx_order_items_kitchen_id on public.order_items(kitchen_id);
create index if not exists idx_order_items_meal_id on public.order_items(meal_id);
create index if not exists idx_reviews_author_id on public.reviews(author_id);
create index if not exists idx_ticket_messages_author_id on public.ticket_messages(author_id);
create index if not exists idx_tickets_assigned_admin on public.tickets(assigned_admin);
create index if not exists idx_tickets_kitchen_id on public.tickets(kitchen_id);
create index if not exists idx_verifications_reviewed_by on public.verifications(reviewed_by);

-- Hygiene: these SECURITY DEFINER functions are not usefully callable via the REST
-- API (a trigger fn needs NEW; an event-trigger fn refuses direct calls), so revoke
-- the default anon/authenticated EXECUTE to clear the advisor and shrink surface.
revoke execute on function public.handle_new_user() from anon, authenticated;

-- rls_auto_enable() is a Supabase-platform-managed event trigger function
-- (injected by the hosted project's Advisor/auto-RLS setting) that does not
-- exist on a fresh local/self-hosted stack -- guard so this migration replays
-- cleanly there too.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from anon, authenticated;
  end if;
end $$;
