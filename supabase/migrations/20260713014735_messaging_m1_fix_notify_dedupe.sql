-- Advance the SENDER's own read cursor on insert. Without this, a participant's own
-- outgoing message leaves their cursor behind last_message_at, so the dedupe wrongly
-- treats the thread as "already unread" for them and suppresses the notification for
-- the OTHER party's reply.
create or replace function on_message_insert() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare t message_threads; v_recipient uuid; v_prev_unread boolean;
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
    perform notify(v_recipient, 'message', 'New message', left(new.body,120));
  end if;
  return new;
end $$;
