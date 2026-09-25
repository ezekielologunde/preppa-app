-- Keep reporters informed when an admin changes the lifecycle of an order-support request.
create or replace function public.on_order_ticket_status_changed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_label text;
begin
  if new.status is not distinct from old.status then return new; end if;
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

drop trigger if exists order_ticket_status_changed_notify on public.tickets;
create trigger order_ticket_status_changed_notify
after update of status on public.tickets
for each row execute function public.on_order_ticket_status_changed();

revoke execute on function public.on_order_ticket_status_changed() from public, anon, authenticated;
