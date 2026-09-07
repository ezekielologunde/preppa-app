-- Cook-side dashboard: "what must I cook this week" (prep rollup) + subscriber roster.
-- Rollup groups by the per-ITEM kitchen_id, so a cook sees their portion of BOX cycles too.

-- portions by delivery date + meal, across the caller's kitchen(s)
create or replace function cook_prep_rollup()
returns table(delivery_date date, meal_id uuid, meal_name text, total_portions int, subscriber_count int)
language sql security definer set search_path to 'public' as $$
  select cy.delivery_date, ci.meal_id, m.name,
         sum(ci.qty * coalesce(m.serves,1))::int as total_portions,
         count(distinct cy.subscription_id)::int as subscriber_count
  from subscription_cycles cy
  join subscription_cycle_items ci on ci.cycle_id = cy.id
  join meals m on m.id = ci.meal_id
  join kitchens k on k.id = ci.kitchen_id
  where k.owner_id = auth.uid()
    and cy.status in ('selection_closed','charged','order_created')
    and not cy.skipped
    and cy.delivery_date >= current_date - 1
  group by cy.delivery_date, ci.meal_id, m.name
  order by cy.delivery_date, m.name;
$$;

-- distinct customer-provided allergies per delivery date (labelled customer-provided, not medical)
create or replace function cook_prep_allergens()
returns table(delivery_date date, allergens text[])
language sql security definer set search_path to 'public' as $$
  select cy.delivery_date, array_agg(distinct a) filter (where a is not null and a <> '')
  from subscription_cycles cy
  join subscription_cycle_items ci on ci.cycle_id = cy.id
  join kitchens k on k.id = ci.kitchen_id
  join subscription_preferences pref on pref.subscription_id = cy.subscription_id
  left join lateral unnest(coalesce(pref.allergies,'{}')) a on true
  where k.owner_id = auth.uid()
    and cy.status in ('selection_closed','charged','order_created')
    and not cy.skipped
    and cy.delivery_date >= current_date - 1
  group by cy.delivery_date;
$$;

-- the caller's plan subscribers (single-kitchen plans; box customers are counted in the rollup by portion)
create or replace function cook_subscribers()
returns table(subscription_id uuid, customer_name text, plan_name text, lifecycle text, price_cents int, preferred_day text, created_at timestamptz)
language sql security definer set search_path to 'public' as $$
  select s.id, coalesce(p.display_name,'Customer'), pl.name, s.lifecycle::text, pl.price_cents, s.preferred_day, s.created_at
  from subscriptions s
  join kitchens k on k.id = s.kitchen_id and k.owner_id = auth.uid()
  join plans pl on pl.id = s.plan_id
  join profiles p on p.id = s.customer_id
  where s.lifecycle not in ('cancelled','completed','draft')
  order by s.created_at desc;
$$;

revoke all on function cook_prep_rollup()    from public, anon;
revoke all on function cook_prep_allergens() from public, anon;
revoke all on function cook_subscribers()    from public, anon;
grant execute on function cook_prep_rollup()    to authenticated, service_role;
grant execute on function cook_prep_allergens() to authenticated, service_role;
grant execute on function cook_subscribers()    to authenticated, service_role;
