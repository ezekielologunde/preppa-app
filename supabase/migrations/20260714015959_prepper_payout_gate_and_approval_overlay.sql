
-- 1. Payout status cache (written server-side by the connect-status edge function) +
--    one-time approval-welcome-overlay tracking.
alter table public.kitchens
  add column if not exists payouts_enabled boolean not null default false,
  add column if not exists charges_enabled boolean not null default false,
  add column if not exists payout_details_submitted boolean not null default false,
  add column if not exists approval_notice_seen_at timestamptz null;

-- 2. Acknowledge the one-time "you're approved" welcome overlay.
create or replace function public.ack_approval_notice()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  update public.kitchens
     set approval_notice_seen_at = now()
   where owner_id = auth.uid() and verification_status = 'verified' and approval_notice_seen_at is null;
end
$function$;

-- 3. Real, unbypassable "publish" gate: a meal can't go live unless its kitchen's Stripe
--    Connect payouts are enabled. Holds regardless of caller (RPC, direct RLS update, admin
--    tool) — stronger than checking in each write path individually.
create or replace function public.meals_require_payouts_to_go_live()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare v_payouts_enabled boolean;
begin
  if new.status = 'live' then
    select payouts_enabled into v_payouts_enabled from public.kitchens where id = new.kitchen_id;
    if not coalesce(v_payouts_enabled, false) then
      raise exception 'this kitchen cannot publish meals until payouts are enabled';
    end if;
  end if;
  return new;
end
$function$;

drop trigger if exists meals_require_payouts_to_go_live on public.meals;
create trigger meals_require_payouts_to_go_live
  before insert or update on public.meals
  for each row execute function public.meals_require_payouts_to_go_live();

-- 4. New meals start live only if the kitchen's payouts are already enabled; otherwise they
--    start paused (a draft) until the owner explicitly publishes (subject to the trigger above).
create or replace function public.create_meal(p_name text, p_description text DEFAULT NULL::text, p_price_cents integer DEFAULT 0, p_serves integer DEFAULT 1, p_tags text[] DEFAULT NULL::text[], p_grad text DEFAULT 'g1'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_kitchen uuid;
  v_payouts_enabled boolean;
  v_slug text;
  v_meal uuid;
begin
  if v_uid is null then raise exception 'must be signed in'; end if;
  if length(coalesce(p_name, '')) < 2 then raise exception 'dish name is too short'; end if;
  if coalesce(p_price_cents, 0) <= 0 then raise exception 'price must be greater than zero'; end if;

  select id, payouts_enabled into v_kitchen, v_payouts_enabled
  from kitchens
  where owner_id = v_uid and verification_status = 'verified'
  order by created_at desc
  limit 1;
  if v_kitchen is null then raise exception 'no approved kitchen for this account'; end if;

  v_slug := lower(regexp_replace(p_name, '[^a-zA-Z0-9]+', '-', 'g'))
            || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  insert into meals (kitchen_id, name, description, price_cents, serves, tags, grad, slug, status, review_count)
  values (v_kitchen, p_name, nullif(p_description, ''), p_price_cents, greatest(1, coalesce(p_serves, 1)),
          p_tags, coalesce(nullif(p_grad, ''), 'g1'), v_slug, case when coalesce(v_payouts_enabled, false) then 'live' else 'paused' end, 0)
  returning id into v_meal;

  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (v_uid, 'meal_created', 'meal', v_meal, jsonb_build_object('name', p_name, 'kitchen', v_kitchen));

  return v_meal;
end $function$;
