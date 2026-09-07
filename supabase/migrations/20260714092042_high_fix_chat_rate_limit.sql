-- Fixes a High finding: individual 1:1 messages had no rate limit at all (unlike
-- broadcasts, capped at 3/day in send_kitchen_broadcast), enabling inbox-flooding of any
-- cook or customer. sendMessage() does a direct client-side RLS-guarded insert (not an
-- RPC), so the limit is enforced with a BEFORE INSERT trigger rather than in application
-- code -- it protects the table regardless of insert path.

create or replace function public.enforce_message_rate_limit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $body$
declare
  v_recent int;
begin
  select count(*) into v_recent
  from messages
  where sender_id = new.sender_id
    and kind is distinct from 'broadcast'
    and created_at > now() - interval '60 seconds';
  if v_recent >= 20 then
    raise exception 'rate_limit: you are sending messages too quickly, please slow down';
  end if;
  return new;
end;
$body$;

-- Broadcasts already have their own, appropriate rate limit (3/day, checked inside
-- send_kitchen_broadcast before it loops one insert per recipient -- which is legitimately
-- high-volume by design) -- exclude kind='broadcast' so this trigger only governs 1:1 sends.
drop trigger if exists messages_rate_limit on messages;
create trigger messages_rate_limit
  before insert on messages
  for each row
  when (new.kind is distinct from 'broadcast')
  execute function public.enforce_message_rate_limit();
