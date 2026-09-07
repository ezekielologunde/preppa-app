CREATE OR REPLACE FUNCTION public.enforce_message_kind()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- 'text'/'image' are legitimate client-set values (sendMessage/sendImageMessage). 'broadcast'
  -- and 'system' must only ever be inserted by a trusted SECURITY DEFINER path (currently only
  -- send_kitchen_broadcast) which sets this transaction-local flag right before its insert --
  -- otherwise a direct client insert of kind='broadcast' bypasses messages_rate_limit (its
  -- WHEN clause explicitly skips broadcast rows) and 'system' could spoof an official message.
  if new.kind in ('broadcast','system') and coalesce(current_setting('app.trusted_msg_kind', true), '') <> new.kind then
    raise exception 'kind % may not be set directly', new.kind;
  end if;
  return new;
end $function$;

DROP TRIGGER IF EXISTS aaa_enforce_message_kind ON messages;
CREATE TRIGGER aaa_enforce_message_kind BEFORE INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION enforce_message_kind();

CREATE OR REPLACE FUNCTION public.send_kitchen_broadcast(p_body text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_kitchen uuid; v_sender uuid := auth.uid(); v_bid uuid; v_body text := btrim(p_body);
  v_count int := 0; v_recent int; v_audience int; v_tid uuid; r record; v_existing message_broadcasts;
begin
  if v_sender is null then raise exception 'auth required'; end if;
  if char_length(v_body) < 1 or char_length(v_body) > 2000 then raise exception 'message must be 1 to 2000 characters'; end if;
  select id into v_kitchen from kitchens where owner_id = v_sender and verification_status = 'verified' order by created_at limit 1;
  if v_kitchen is null then raise exception 'no kitchen'; end if;

  if p_idempotency_key is not null then
    select * into v_existing from message_broadcasts where kitchen_id = v_kitchen and idempotency_key = p_idempotency_key;
    if v_existing.id is not null then
      return jsonb_build_object('broadcastId', v_existing.id, 'recipientCount', v_existing.recipient_count, 'deduped', true);
    end if;
  end if;

  select count(*) into v_recent from message_broadcasts where kitchen_id = v_kitchen and created_at > now() - interval '24 hours';
  if v_recent >= 3 then raise exception 'rate_limit: you can send up to 3 broadcasts per day'; end if;

  select count(*) into v_audience from kitchen_broadcast_audience(v_kitchen);
  if v_audience > 5000 then raise exception 'audience too large'; end if;

  insert into message_broadcasts(kitchen_id, sender_id, body, recipient_count, idempotency_key)
    values (v_kitchen, v_sender, v_body, 0, p_idempotency_key) returning id into v_bid;

  perform set_config('app.trusted_msg_kind', 'broadcast', true);
  for r in select customer_id from kitchen_broadcast_audience(v_kitchen) loop
    insert into message_threads(customer_id, kitchen_id, context_type)
      values (r.customer_id, v_kitchen, 'broadcast') on conflict (customer_id, kitchen_id) do nothing;
    select id into v_tid from message_threads where customer_id = r.customer_id and kitchen_id = v_kitchen;
    if exists (select 1 from message_blocks b where b.thread_id = v_tid and b.active) then continue; end if;
    insert into messages(thread_id, sender_id, sender_role, kind, body, broadcast_id)
      values (v_tid, v_sender, 'kitchen', 'broadcast', v_body, v_bid);
    v_count := v_count + 1;
  end loop;

  update message_broadcasts set recipient_count = v_count where id = v_bid;
  return jsonb_build_object('broadcastId', v_bid, 'recipientCount', v_count);
end $function$;
