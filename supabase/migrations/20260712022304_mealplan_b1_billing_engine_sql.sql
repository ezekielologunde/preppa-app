-- Phase B m1: the app-controlled billing engine (SQL side).

-- in-flight claim marker for the charge worker
alter type cycle_payment_status add value if not exists 'charging';

-- worker bearer check (reuse the existing sync-worker vault secret)
create or replace function verify_worker_secret(p_token text)
returns boolean language sql security definer set search_path to 'public','vault' as $$
  select exists (select 1 from vault.decrypted_secrets
                 where name='stripe_sync_worker_secret' and decrypted_secret = p_token);
$$;
revoke all on function verify_worker_secret(text) from public, anon, authenticated;
grant execute on function verify_worker_secret(text) to service_role;
