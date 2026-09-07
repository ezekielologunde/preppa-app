-- These stripe.* functions are provided by the hosted project's Stripe Sync Engine
-- wrapper (a Supabase add-on enabled via the dashboard), which does not exist on a
-- fresh local/self-hosted stack -- guard so this migration replays cleanly there.
do $$
begin
  if to_regprocedure('stripe.set_updated_at()') is not null then
    alter function stripe.set_updated_at() set search_path to 'public';
  end if;
  if to_regprocedure('stripe.set_updated_at_metadata()') is not null then
    alter function stripe.set_updated_at_metadata() set search_path to 'public';
  end if;
  if to_regprocedure('stripe.check_rate_limit(text, integer, integer)') is not null then
    alter function stripe.check_rate_limit(text, integer, integer) set search_path to 'stripe';
  end if;
end $$;

-- citext is a pure data-type extension (no hardcoded schema refs like pg_net);
-- existing columns reference the type by OID, so relocating is safe and non-breaking.
alter extension citext set schema extensions;
