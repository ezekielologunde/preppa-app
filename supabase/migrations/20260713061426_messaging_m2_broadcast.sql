-- M2: cook broadcasts to their subscribers. WhatsApp-style fan-out — one message per
-- existing 1:1 thread so replies land back 1:1 (never a group chat). Implemented as a
-- SECURITY DEFINER RPC (no Stripe/external call needed): rate-limit + idempotency + block
-- respect all enforced in-DB. Runs as the cook (auth.uid()); the definer role bypasses RLS
-- to write into each subscriber's thread, while the messages BEFORE-trigger still derives
-- sender_role='kitchen' from auth.uid().

create table if not exists message_broadcasts (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null references kitchens(id) on delete cascade,
  sender_id uuid not null references profiles(id),
  body text not null check (char_length(body) between 1 and 2000),
  recipient_count int not null default 0,
  idempotency_key text,
  created_at timestamptz not null default now(),
  unique (kitchen_id, idempotency_key)
);
create index if not exists message_broadcasts_kitchen_idx on message_broadcasts(kitchen_id, created_at desc);

alter table message_broadcasts enable row level security;
drop policy if exists broadcasts_select on message_broadcasts;
create policy broadcasts_select on message_broadcasts for select to authenticated
  using (is_kitchen_owner(kitchen_id) or is_admin());
-- no INSERT policy: writes go only through send_kitchen_broadcast (SECURITY DEFINER)

-- now that the table exists, link broadcast messages to it
alter table messages drop constraint if exists messages_broadcast_fk;
alter table messages add constraint messages_broadcast_fk
  foreign key (broadcast_id) references message_broadcasts(id) on delete set null;

-- distinct customers reachable by this kitchen's broadcast (plan subs + direct-kitchen subs +
-- cross-kitchen box subscribers who included an item from this kitchen). INTERNAL (returns raw
-- customer ids) — only called from the definer functions below.
create or replace function kitchen_broadcast_audience(p_kitchen uuid)
returns table(customer_id uuid) language sql security definer set search_path to 'public' stable as $$
  select distinct q.customer_id from (
    select s.customer_id from subscriptions s join plans p on p.id = s.plan_id
      where s.lifecycle in ('active','paused') and p.kitchen_id = p_kitchen
    union
    select s.customer_id from subscriptions s
      where s.lifecycle in ('active','paused') and s.kitchen_id = p_kitchen
    union
    select s.customer_id from subscriptions s join subscription_box_items bi on bi.subscription_id = s.id
      where s.kind = 'box' and s.lifecycle in ('active','paused') and bi.kitchen_id = p_kitchen
  ) q;
$$;

-- composer preview: how many subscribers the caller's broadcast would reach
create or replace function my_broadcast_audience_count()
returns int language plpgsql security definer set search_path to 'public' stable as $$
declare v_kitchen uuid;
begin
  select id into v_kitchen from kitchens where owner_id = auth.uid() order by created_at limit 1;
  if v_kitchen is null then return 0; end if;
  return (select count(*)::int from kitchen_broadcast_audience(v_kitchen));
end $$;

create or replace function send_kitchen_broadcast(p_body text, p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_kitchen uuid; v_sender uuid := auth.uid(); v_bid uuid; v_body text := btrim(p_body);
  v_count int := 0; v_recent int; v_audience int; v_tid uuid; r record; v_existing message_broadcasts;
begin
  if v_sender is null then raise exception 'auth required'; end if;
  if char_length(v_body) < 1 or char_length(v_body) > 2000 then raise exception 'message must be 1 to 2000 characters'; end if;
  select id into v_kitchen from kitchens where owner_id = v_sender order by created_at limit 1;
  if v_kitchen is null then raise exception 'no kitchen'; end if;

  -- idempotency: a repeat with the same key returns the prior result without re-sending
  if p_idempotency_key is not null then
    select * into v_existing from message_broadcasts where kitchen_id = v_kitchen and idempotency_key = p_idempotency_key;
    if v_existing.id is not null then
      return jsonb_build_object('broadcastId', v_existing.id, 'recipientCount', v_existing.recipient_count, 'deduped', true);
    end if;
  end if;

  -- rate limit: at most 3 broadcasts per rolling 24h
  select count(*) into v_recent from message_broadcasts where kitchen_id = v_kitchen and created_at > now() - interval '24 hours';
  if v_recent >= 3 then raise exception 'rate_limit: you can send up to 3 broadcasts per day'; end if;

  select count(*) into v_audience from kitchen_broadcast_audience(v_kitchen);
  if v_audience > 5000 then raise exception 'audience too large'; end if;

  insert into message_broadcasts(kitchen_id, sender_id, body, recipient_count, idempotency_key)
    values (v_kitchen, v_sender, v_body, 0, p_idempotency_key) returning id into v_bid;

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
end $$;

revoke all on function kitchen_broadcast_audience(uuid), my_broadcast_audience_count(), send_kitchen_broadcast(text,text) from public, anon;
grant execute on function kitchen_broadcast_audience(uuid)  to service_role;
grant execute on function my_broadcast_audience_count()      to authenticated, service_role;
grant execute on function send_kitchen_broadcast(text,text)  to authenticated, service_role;
