-- Maps a Preppa user to their Stripe Customer (for saved cards / SetupIntents).
-- Written only by service-role edge functions; never client-writable.
alter table public.profiles add column if not exists stripe_customer_id text;
comment on column public.profiles.stripe_customer_id is 'Stripe Customer id for saved payment methods; set by edge functions only.';
