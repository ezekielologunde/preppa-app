-- Alert the people who must act on an order-support request. The thread already persisted
-- correctly, but new tickets and replies could sit unseen until somebody reopened the queue.
create or replace function public.on_order_ticket_created()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_admin uuid;
begin
  for v_admin in select id from profiles where role = 'admin' loop
    perform public.notify(
      v_admin,
      'ticket',
      case when new.category = 'cancellation' then 'Cancellation request' else 'New order support request' end,
      left(new.subject, 120)
    );
  end loop;
  return new;
end $function$;

drop trigger if exists order_ticket_created_notify on public.tickets;
create trigger order_ticket_created_notify
after insert on public.tickets
for each row execute function public.on_order_ticket_created();

create or replace function public.on_order_ticket_message_created()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ticket tickets%rowtype;
  v_actor_role user_role;
  v_owner uuid;
  v_admin uuid;
begin
  if new.is_internal then return new; end if;
  select * into v_ticket from tickets where id = new.ticket_id;
  select role into v_actor_role from profiles where id = new.author_id;

  if v_actor_role = 'admin' then
    perform public.notify(v_ticket.reporter_id, 'ticket', 'Support replied', left(v_ticket.subject, 120));
  else
    for v_admin in select id from profiles where role = 'admin' loop
      perform public.notify(v_admin, 'ticket', 'New support reply', left(v_ticket.subject, 120));
    end loop;
    if new.author_id <> v_ticket.reporter_id then
      perform public.notify(v_ticket.reporter_id, 'ticket', 'Cook replied to your request', left(v_ticket.subject, 120));
    elsif v_ticket.cook_visible then
      select owner_id into v_owner from kitchens where id = v_ticket.kitchen_id;
      if v_owner is not null and v_owner <> new.author_id then
        perform public.notify(v_owner, 'ticket', 'Customer replied to a shared request', left(v_ticket.subject, 120));
      end if;
    end if;
  end if;
  return new;
end $function$;

drop trigger if exists order_ticket_message_created_notify on public.ticket_messages;
create trigger order_ticket_message_created_notify
after insert on public.ticket_messages
for each row execute function public.on_order_ticket_message_created();

revoke execute on function public.on_order_ticket_created() from public, anon, authenticated;
revoke execute on function public.on_order_ticket_message_created() from public, anon, authenticated;
