-- Self-review catch: the previous migration referenced a vault secret
-- ('supabase_functions_base_url') that was never created, so the URL concatenation would
-- have evaluated to NULL and net.http_post would silently fail every time (swallowed by
-- notify()'s own exception handler -- push would never fire, with no visible error anywhere).
-- Fix: hardcode the functions base URL, matching this project's existing convention (every
-- cron.job entry -- stripe-sync-worker, charge-due-cycles -- already hardcodes
-- 'https://fwidhpzwldneeaphrxgg.supabase.co/functions/v1/<fn>' directly rather than resolving
-- it from a secret).
create or replace function public.notify(p_user uuid, p_kind text, p_title text, p_body text default null::text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if p_user is null then return; end if;
  insert into notifications (user_id, kind, title, body) values (p_user, p_kind, p_title, p_body);

  if exists (select 1 from public.push_tokens where user_id = p_user) then
    perform net.http_post(
      url := 'https://fwidhpzwldneeaphrxgg.supabase.co/functions/v1/send-push',
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
