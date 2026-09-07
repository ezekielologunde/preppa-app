-- CRITICAL: confirmed exploitable via a real test (signup -> raw PATCH .../profiles?id=eq.<self>
-- with {"stripe_customer_id": "..."} -> succeeded, 200). profiles.stripe_customer_id is trusted
-- as the source of truth for "which Stripe Customer is mine" by getOrCreateCustomer() in
-- create-order/subscribe-prepplus/subscribe-cook-pro/payment-methods -- a user who set their own
-- profile's stripe_customer_id to someone else's real Stripe Customer id could view/use/detach
-- that victim's saved cards, or have their own orders charged against the victim's Customer.
--
-- guard_profile_privileged_columns already protects role/verification_status the same way, but
-- (a) never covered stripe_customer_id, and (b) used the DEPRECATED
-- current_setting('request.jwt.claim.role',true) GUC -- the same broken pattern fixed in
-- check_rate_limit this session. It happened to "work" for role/verification_status only because
-- that GUC always reads NULL for every caller (deprecated, unpopulated by this project's
-- PostgREST), which defaults the check to "block", and the few legitimate privileged writers
-- (admin_set_user_role etc.) already route around it via the separate app.privileged escape
-- hatch. getOrCreateCustomer's stripe_customer_id write is a raw service-role table UPDATE with
-- NO app.privileged flag set, so extending the OLD broken check would have blocked that
-- legitimate path. Using auth.role() = 'service_role' (the already-fixed, correct helper --
-- coalesces the deprecated GUC with the real request.jwt.claims fallback) instead, so genuine
-- service-role edge-function writes keep working without any edge-function changes, while the
-- app.privileged escape hatch is kept for the existing admin-RPC callers.
create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if auth.role() is distinct from 'service_role'
     and coalesce(current_setting('app.privileged', true), 'off') <> 'on' then
    if new.role is distinct from old.role
       or new.verification_status is distinct from old.verification_status
       or new.stripe_customer_id is distinct from old.stripe_customer_id then
      raise exception 'role/verification_status/stripe_customer_id are not client-writable';
    end if;
  end if;
  return new;
end $function$;
