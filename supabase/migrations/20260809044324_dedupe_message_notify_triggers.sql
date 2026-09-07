CREATE OR REPLACE FUNCTION public.on_message_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t message_threads; v_recipient uuid; v_prev_unread boolean; v_title text;
begin
  select * into t from message_threads where id = new.thread_id;
  if new.sender_role = 'customer' then v_recipient := (select owner_id from kitchens where id = t.kitchen_id);
  else v_recipient := t.customer_id; end if;
  -- unread FOR THE RECIPIENT before this message (their cursor is behind the prior last message)
  v_prev_unread := t.last_message_at is not null and (
    (new.sender_role = 'customer'  and t.kitchen_last_read_at  < t.last_message_at) or
    (new.sender_role <> 'customer' and t.customer_last_read_at < t.last_message_at));
  update message_threads set
    last_message_at = new.created_at,
    last_message_preview = left(new.body,140),
    last_sender_role = new.sender_role,
    customer_last_read_at = case when new.sender_role = 'customer' then new.created_at else customer_last_read_at end,
    kitchen_last_read_at  = case when new.sender_role = 'kitchen'  then new.created_at else kitchen_last_read_at  end
  where id = new.thread_id;
  if v_recipient is not null and v_recipient <> new.sender_id and not v_prev_unread then
    -- title = the sender's display identity (kitchen name if they're the cook, else the
    -- customer's display name) instead of a generic "New message" -- merged in from the
    -- since-removed duplicate trg_notify_new_message trigger, which had this but no throttle.
    if new.sender_role = 'customer' then
      select display_name into v_title from profiles where id = new.sender_id;
      v_title := coalesce(v_title, 'A customer');
    else
      select name into v_title from kitchens where id = t.kitchen_id;
      v_title := coalesce(v_title, 'New message');
    end if;
    perform notify(v_recipient, 'message', v_title, left(new.body,120));
  end if;
  return new;
end $function$;

DROP TRIGGER IF EXISTS trg_notify_new_message ON messages;
DROP FUNCTION IF EXISTS notify_new_message();
