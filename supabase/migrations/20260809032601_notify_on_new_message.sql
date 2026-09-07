CREATE OR REPLACE FUNCTION public.notify_new_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_thread record; v_recipient uuid; v_sender_name text;
begin
  select t.customer_id, k.owner_id as kitchen_owner_id, k.name as kitchen_name
    into v_thread
    from message_threads t join kitchens k on k.id = t.kitchen_id
    where t.id = new.thread_id;

  if new.sender_role = 'customer' then
    v_recipient := v_thread.kitchen_owner_id;
    select coalesce(display_name, 'A customer') into v_sender_name from profiles where id = new.sender_id;
  else
    v_recipient := v_thread.customer_id;
    v_sender_name := v_thread.kitchen_name;
  end if;

  if v_recipient is not null and v_recipient <> new.sender_id then
    perform notify(v_recipient, 'message', v_sender_name,
      case when length(new.body) > 120 then left(new.body, 117) || '...' else new.body end);
  end if;
  return new;
end $function$;

DROP TRIGGER IF EXISTS trg_notify_new_message ON messages;
CREATE TRIGGER trg_notify_new_message AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION notify_new_message();
