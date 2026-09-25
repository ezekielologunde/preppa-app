-- A reporter reply can reopen a resolved ticket. They already receive immediate UI feedback,
-- so avoid sending them a redundant push about the status change they just caused.
create or replace function public.on_order_ticket_status_changed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_label text;
begin
  if new.status is not distinct from old.status or auth.uid() = new.reporter_id then return new; end if;
  v_label := case new.status
    when 'in_progress' then 'In progress'
    when 'resolved' then 'Resolved'
    when 'closed' then 'Closed'
    else 'Reopened'
  end;
  perform public.notify(
    new.reporter_id,
    'ticket',
    'Support request ' || lower(v_label),
    left(new.subject, 120) || ' - status: ' || v_label
  );
  return new;
end $function$;

revoke execute on function public.on_order_ticket_status_changed() from public, anon, authenticated;
