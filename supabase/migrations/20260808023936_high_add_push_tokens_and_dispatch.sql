-- Push notification scaffolding (server side). Every existing notify() call site (order
-- status changes, the new cook order/payout notifications, kitchen approval, messages, etc.)
-- gets push delivery for free once this lands -- no per-call-site changes needed.

create table if not exists public.push_tokens (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('ios','android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

-- A signed-in user manages only their own device tokens (register on sign-in, remove on
-- sign-out/uninstall detection). No anon access; service_role (used by send-push) bypasses
-- RLS entirely, same pattern as every other service-role-only table in this project.
create policy push_tokens_owner_all on public.push_tokens
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Fire-and-forget push dispatch, appended to the existing notify() insert. Wrapped in the
-- SAME outer exception handler notify() already has ("never let a notification failure break
-- the caller") -- a push-send hiccup must be exactly as harmless as the in-app notify() itself
-- already is to its ~15 call sites across order status, approvals, messages, and the new
-- cook-payment notifications added this session.
create or replace function public.notify(p_user uuid, p_kind text, p_title text, p_body text default null::text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if p_user is null then return; end if;
  insert into notifications (user_id, kind, title, body) values (p_user, p_kind, p_title, p_body);

  -- Only bother calling out if this user actually has a registered device.
  if exists (select 1 from public.push_tokens where user_id = p_user) then
    perform net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_functions_base_url') || '/send-push',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'stripe_sync_worker_secret'),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('userId', p_user, 'title', p_title, 'body', p_body)
    );
  end if;
exception when others then
  null; -- never let a notification failure break the caller
end $function$;

revoke execute on function public.notify(uuid, text, text, text) from public;
grant execute on function public.notify(uuid, text, text, text) to authenticated, service_role;
