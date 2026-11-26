-- Smoke test for the anon column grants and the rewritten policies (web launch S12,
-- supabase/migrations/20260927005000_anon_column_grants.sql). It runs real queries as anon and as a
-- signed-in kitchen owner, which the static checks in tests/anonColumnGrants.test.ts cannot.
--
-- Run (after the migration is applied):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/anon_browse_smoke.sql
--
-- Everything happens inside one transaction that always rolls back, so nothing here persists:
-- * one throwaway auth user (handle_new_user makes the profile; inserted here if that trigger is
--   absent) who owns one verified, open kitchen with payouts enabled, so its live meal is orderable;
-- * one live meal, one active plan and one archived plan (each with one plan item), and one
--   published post, all on that kitchen.
-- Reviews and experiences get no fixture rows (a review needs a completed order): their reads are
-- checked for the column privileges they need, which Postgres checks whether or not rows exist.
--
-- The anon queries are plain SQL versions of the PostgREST embeds the client sends signed out
-- (src/data/supabaseRepository.ts, src/lib/orders.ts, src/lib/feed.ts, src/lib/livestream.ts,
-- src/lib/subscriptions.ts, src/data/hooks.ts) and select exactly the columns those embeds name.
--
-- Prints PASS or FAIL per case as a NOTICE, then raises (non-zero exit under ON_ERROR_STOP) if any
-- case failed. A setup step that errors aborts the script with that error.
begin;

select pg_catalog.set_config('app.privileged', 'on', true);

create temp table smoke_result (
  n serial primary key,
  name text not null,
  ok boolean not null,
  detail text
) on commit drop;

create temp table smoke_ctx (
  owner_id uuid, kitchen_id uuid, meal_id uuid, plan_id uuid, archived_plan_id uuid, post_id uuid
) on commit drop;
insert into smoke_ctx default values;

create function pg_temp.smoke_record(p_name text, p_ok boolean, p_detail text)
returns void
language sql
as $f$
  insert into pg_temp.smoke_result (name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail);
$f$;

-- the anon and authenticated cases below record their results here
grant select, insert on pg_temp.smoke_result to anon, authenticated;
grant usage on sequence pg_temp.smoke_result_n_seq to anon, authenticated;
grant select on pg_temp.smoke_ctx to anon, authenticated;

-- setup: owner, verified open kitchen with payouts, live meal, active and archived plans, a post
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_kitchen uuid;
  v_meal uuid;
  v_plan uuid;
  v_archived uuid;
  v_post uuid;
begin
  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  values (v_owner, 'anon-browse-smoke-s12@example.invalid', 'authenticated', 'authenticated',
          '{"display_name": "anon browse smoke"}'::jsonb);
  insert into public.profiles (id, display_name) values (v_owner, 'anon browse smoke') on conflict (id) do nothing;

  insert into public.kitchens (owner_id, name, slug, cuisine, approx_area, availability, verification_status,
                               rejection_reason, suspension_reason)
  values (v_owner, 'S12 smoke kitchen', 'smoke-s12-' || pg_catalog.substr(v_owner::text, 1, 8), 'Test',
          'Testville', 'open', 'verified', 'smoke rejection text', 'smoke suspension text')
  returning id into v_kitchen;

  insert into public.stripe_accounts (kitchen_id, stripe_account_id, charges_enabled, payouts_enabled)
  values (v_kitchen, 'acct_smoke_s12_' || pg_catalog.substr(v_owner::text, 1, 8), true, true);

  insert into public.meals (kitchen_id, name, slug, price_cents, status, ingredients, allergen_reviewed_at)
  values (v_kitchen, 'S12 smoke meal', 'smoke-s12-meal', 1200, 'live', 'rice', pg_catalog.now())
  returning id into v_meal;

  insert into public.plans (kitchen_id, name, price_cents, status, stripe_price_id)
  values (v_kitchen, 'S12 smoke plan', 5000, 'active', 'price_smoke_s12')
  returning id into v_plan;
  insert into public.plans (kitchen_id, name, price_cents, status)
  values (v_kitchen, 'S12 smoke archived plan', 5000, 'archived')
  returning id into v_archived;
  insert into public.plan_items (plan_id, meal_id, qty) values (v_plan, v_meal, 1), (v_archived, v_meal, 1);

  insert into public.posts (kitchen_id, caption, cover_url, status)
  values (v_kitchen, 'S12 smoke post', 'https://example.invalid/s12.jpg', 'published')
  returning id into v_post;

  update pg_temp.smoke_ctx
  set owner_id = v_owner, kitchen_id = v_kitchen, meal_id = v_meal, plan_id = v_plan,
      archived_plan_id = v_archived, post_id = v_post;
end $$;

-- signed out: role anon, no sub claim, so auth.uid() is null
set local role anon;
select pg_catalog.set_config('request.jwt.claims', '{"role": "anon"}', true);

-- case 1: every allowlisted kitchens column, on the fixture kitchen
do $$
declare v_n integer;
begin
  select count(*) into v_n from (
    select k.id, k.name, k.slug, k.cuisine, k.bio, k.approx_area, k.approx_lat, k.approx_lng, k.avatar_url,
           k.cover_url, k.specialties, k.years_active, k.availability, k.created_at, k.is_pro,
           k.supports_delivery, k.supports_pickup, k.verification_status
    from public.kitchens k where k.id = (select c.kitchen_id from pg_temp.smoke_ctx c)
  ) s;
  perform pg_temp.smoke_record('anon reads every allowlisted kitchens column', v_n = 1, v_n || ' row(s)');
exception when others then
  perform pg_temp.smoke_record('anon reads every allowlisted kitchens column', false, sqlstate || ' ' || sqlerrm);
end $$;

-- case 2: kitchen_public (security_invoker) and kitchen_rating views
do $$
declare v_n integer;
begin
  select count(*) into v_n from public.kitchen_public kp where kp.id = (select c.kitchen_id from pg_temp.smoke_ctx c);
  perform count(*) from public.kitchen_rating;
  perform pg_temp.smoke_record('anon reads kitchen_public and kitchen_rating', v_n = 1, v_n || ' kitchen_public row(s)');
exception when others then
  perform pg_temp.smoke_record('anon reads kitchen_public and kitchen_rating', false, sqlstate || ' ' || sqlerrm);
end $$;

-- case 3: meals embed kitchens(name,cuisine,approx_area,approx_lat,approx_lng,is_pro,supports_delivery,supports_pickup)
do $$
declare v_n integer;
begin
  select count(*) into v_n from (
    select m.id, k.name, k.cuisine, k.approx_area, k.approx_lat, k.approx_lng, k.is_pro, k.supports_delivery, k.supports_pickup
    from public.meals m join public.kitchens k on k.id = m.kitchen_id
    where m.id = (select c.meal_id from pg_temp.smoke_ctx c) and m.status = 'live'
  ) s;
  perform pg_temp.smoke_record('anon reads the meals embed of kitchens', v_n = 1, v_n || ' row(s)');
exception when others then
  perform pg_temp.smoke_record('anon reads the meals embed of kitchens', false, sqlstate || ' ' || sqlerrm);
end $$;

-- case 4: cart re-check kitchens(name,verification_status,availability,supports_delivery,supports_pickup)
do $$
declare v_n integer;
begin
  select count(*) into v_n from (
    select m.id, k.name, k.verification_status, k.availability, k.supports_delivery, k.supports_pickup
    from public.meals m join public.kitchens k on k.id = m.kitchen_id
    where m.id = (select c.meal_id from pg_temp.smoke_ctx c)
  ) s;
  perform pg_temp.smoke_record('anon reads the cart re-check embed of kitchens', v_n = 1, v_n || ' row(s)');
exception when others then
  perform pg_temp.smoke_record('anon reads the cart re-check embed of kitchens', false, sqlstate || ' ' || sqlerrm);
end $$;

-- case 5: feed posts with kitchens!inner(name, avatar_url, verification_status), through posts_public_read
do $$
declare v_n integer;
begin
  select count(*) into v_n from (
    select p.id, k.name, k.avatar_url, k.verification_status
    from public.posts p join public.kitchens k on k.id = p.kitchen_id
    where p.status = 'published' and k.verification_status = 'verified'
      and p.id = (select c.post_id from pg_temp.smoke_ctx c)
  ) s;
  perform pg_temp.smoke_record('anon reads a published post with its kitchen (posts_public_read)', v_n = 1, v_n || ' row(s)');
exception when others then
  perform pg_temp.smoke_record('anon reads a published post with its kitchen (posts_public_read)', false, sqlstate || ' ' || sqlerrm);
end $$;

-- case 6: live-now rail livestreams with kitchens!inner(name, avatar_url, verification_status)
do $$
begin
  perform l.id, k.name, k.avatar_url, k.verification_status
  from public.livestreams l join public.kitchens k on k.id = l.kitchen_id
  where l.status = 'live' and k.verification_status = 'verified';
  perform pg_temp.smoke_record('anon reads the livestreams embed of kitchens', true, null);
exception when others then
  perform pg_temp.smoke_record('anon reads the livestreams embed of kitchens', false, sqlstate || ' ' || sqlerrm);
end $$;

-- case 7: PLAN_SELECT with kitchens(name) and plan_items(qty, meal_id, week_index, meals(id, name, price_cents, image_url)),
-- through plans_read_active and plan_items_read; the archived plan and its item stay hidden
do $$
declare
  v_active integer;
  v_items integer;
  v_archived integer;
  v_archived_items integer;
begin
  select count(*) into v_active from (
    select p.id, p.kitchen_id, p.name, p.description, p.price_cents, p.fulfillment, p.goal, p.selection_model,
           p.meals_per_delivery, p.servings, p.per_meal_cents, p.per_delivery_cents, p.service_fee_bps,
           p.delivery_days, p.cutoff_hours, p.lead_time_hours, p.min_commitment, p.trial_price_cents,
           p.trial_cycles, p.cadence_weeks, p.rotating, p.rotation_weeks, p.status, p.cover_url,
           p.dietary_tags, p.allergens, p.created_at, k.name as kitchen_name
    from public.plans p join public.kitchens k on k.id = p.kitchen_id
    where p.status = 'active' and p.id = (select c.plan_id from pg_temp.smoke_ctx c)
    order by p.created_at desc
  ) s;
  select count(*) into v_items from (
    select pi.qty, pi.meal_id, pi.week_index, m.id, m.name, m.price_cents, m.image_url
    from public.plan_items pi join public.meals m on m.id = pi.meal_id
    where pi.plan_id = (select c.plan_id from pg_temp.smoke_ctx c)
  ) s;
  select count(*) into v_archived from public.plans p where p.id = (select c.archived_plan_id from pg_temp.smoke_ctx c);
  select count(*) into v_archived_items from public.plan_items pi where pi.plan_id = (select c.archived_plan_id from pg_temp.smoke_ctx c);
  perform pg_temp.smoke_record(
    'anon reads the active plan and its items, not the archived plan (plans_read_active, plan_items_read)',
    v_active = 1 and v_items = 1 and v_archived = 0 and v_archived_items = 0,
    pg_catalog.format('active %s, items %s, archived %s, archived items %s', v_active, v_items, v_archived, v_archived_items));
exception when others then
  perform pg_temp.smoke_record('anon reads the active plan and its items, not the archived plan (plans_read_active, plan_items_read)',
                               false, sqlstate || ' ' || sqlerrm);
end $$;

-- case 8: reviews list (id,rating,body,created_at by kitchen_id), experiences and sessions by verified kitchen
do $$
begin
  perform r.id, r.kitchen_id, r.rating, r.body, r.created_at from public.reviews r
  where r.kitchen_id = (select c.kitchen_id from pg_temp.smoke_ctx c) order by r.created_at desc;
  perform e.id, k.name from public.experiences e join public.kitchens k on k.id = e.kitchen_id
  where e.status = 'published' and k.verification_status = 'verified';
  perform count(*) from public.experience_sessions;
  perform pg_temp.smoke_record('anon reads reviews, experiences and experience_sessions', true, null);
exception when others then
  perform pg_temp.smoke_record('anon reads reviews, experiences and experience_sessions', false, sqlstate || ' ' || sqlerrm);
end $$;

-- case 9: the other rewritten policies return no rows to anon instead of raising
do $$
declare
  t text;
  v_n bigint;
  v_detail text := '';
  v_ok boolean := true;
begin
  foreach t in array array['subscriptions', 'quotes', 'bookings', 'kitchen_private'] loop
    if not pg_catalog.has_table_privilege('anon', 'public.' || t, 'select') then
      v_detail := v_detail || t || ': no table grant; ';
      continue;
    end if;
    begin
      execute pg_catalog.format('select count(*) from public.%I', t) into v_n;
      v_ok := v_ok and v_n = 0;
      v_detail := v_detail || t || ': ' || v_n || ' row(s); ';
    exception when others then
      v_ok := false;
      v_detail := v_detail || t || ': ' || sqlstate || ' ' || sqlerrm || '; ';
    end;
  end loop;
  perform pg_temp.smoke_record('anon gets no rows, not an error, from subscriptions, quotes, bookings, kitchen_private',
                               v_ok, v_detail);
end $$;

-- case 10: each withheld column raises insufficient_privilege (42501) for anon
do $$
declare
  c record;
  v_ok boolean := true;
  v_detail text := '';
begin
  for c in
    select * from (values
      ('kitchens', 'owner_id'), ('kitchens', 'rejection_reason'), ('kitchens', 'suspension_reason'),
      ('reviews', 'author_id'), ('reviews', 'order_id'), ('reviews', 'booking_id'),
      ('plans', 'stripe_price_id')
    ) v(tbl, col)
  loop
    begin
      execute pg_catalog.format('select %I from public.%I limit 1', c.col, c.tbl);
      v_ok := false;
      v_detail := v_detail || c.tbl || '.' || c.col || ' readable; ';
    exception when insufficient_privilege then
      null;
    when others then
      v_ok := false;
      v_detail := v_detail || c.tbl || '.' || c.col || ' ' || sqlstate || '; ';
    end;
  end loop;
  perform pg_temp.smoke_record('anon selecting a withheld column raises 42501', v_ok, nullif(v_detail, ''));
end $$;

reset role;

-- signed in as the kitchen owner: role authenticated with the owner's sub claim
select pg_catalog.set_config('request.jwt.claims',
  pg_catalog.jsonb_build_object('sub', (select c.owner_id from pg_temp.smoke_ctx c), 'role', 'authenticated')::text, true);
set local role authenticated;

-- case 11: the owner still reads owner_id, the archived plan and its item, as before the rewrite
do $$
declare
  v_owner integer;
  v_archived integer;
  v_archived_items integer;
  v_posts integer;
begin
  select count(*) into v_owner from public.kitchens k
  where k.id = (select c.kitchen_id from pg_temp.smoke_ctx c) and k.owner_id = (select c.owner_id from pg_temp.smoke_ctx c);
  select count(*) into v_archived from public.plans p where p.id = (select c.archived_plan_id from pg_temp.smoke_ctx c);
  select count(*) into v_archived_items from public.plan_items pi where pi.plan_id = (select c.archived_plan_id from pg_temp.smoke_ctx c);
  select count(*) into v_posts from public.posts p where p.id = (select c.post_id from pg_temp.smoke_ctx c);
  perform pg_temp.smoke_record(
    'owner reads owner_id, the archived plan and its item, and the post',
    v_owner = 1 and v_archived = 1 and v_archived_items = 1 and v_posts = 1,
    pg_catalog.format('owner_id %s, archived %s, archived items %s, posts %s', v_owner, v_archived, v_archived_items, v_posts));
exception when others then
  perform pg_temp.smoke_record('owner reads owner_id, the archived plan and its item, and the post', false, sqlstate || ' ' || sqlerrm);
end $$;

reset role;

do $$
declare
  r record;
  v_failed integer;
begin
  for r in select * from pg_temp.smoke_result order by n loop
    raise notice '% %: %', case when r.ok then 'PASS' else 'FAIL' end, r.name, coalesce(r.detail, '');
  end loop;
  select count(*) into v_failed from pg_temp.smoke_result where not ok;
  if v_failed > 0 or (select count(*) from pg_temp.smoke_result) <> 11 then
    raise exception 'anon_browse smoke: % of % case(s) failed', v_failed, (select count(*) from pg_temp.smoke_result);
  end if;
  raise notice 'anon_browse smoke: all 11 cases passed';
end $$;

rollback;
