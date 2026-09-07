
-- Performance fix (multiple_permissive_policies advisor): kitchen_capacity, meals,
-- plan_items, and plans each had an owner "ALL" policy (which implicitly covers SELECT)
-- stacked alongside a dedicated public-read SELECT policy. Postgres must OR both together
-- on every SELECT. In every case here, the dedicated read policy's own OR-clause already
-- covers the owner's case (verified against each policy's qual before this migration), so
-- the ALL policy's SELECT grant is pure duplication. Splitting each ALL policy into
-- INSERT/UPDATE/DELETE-only removes the redundant SELECT evaluation with no access change.

-- kitchen_capacity: owner write, still using is_active_kitchen_owner; capacity_read (qual=true) already covers reads.
drop policy capacity_owner_write on public.kitchen_capacity;
create policy capacity_owner_insert on public.kitchen_capacity for insert to public
  with check (is_active_kitchen_owner(kitchen_id));
create policy capacity_owner_update on public.kitchen_capacity for update to public
  using (is_active_kitchen_owner(kitchen_id)) with check (is_active_kitchen_owner(kitchen_id));
create policy capacity_owner_delete on public.kitchen_capacity for delete to public
  using (is_active_kitchen_owner(kitchen_id));

-- meals: meals_select_live_public already ORs in is_kitchen_owner(kitchen_id).
drop policy meals_write_own on public.meals;
create policy meals_owner_insert on public.meals for insert to public
  with check (is_active_kitchen_owner(kitchen_id));
create policy meals_owner_update on public.meals for update to public
  using (is_active_kitchen_owner(kitchen_id)) with check (is_active_kitchen_owner(kitchen_id));
create policy meals_owner_delete on public.meals for delete to public
  using (is_active_kitchen_owner(kitchen_id));

-- plan_items: plan_items_read already ORs in the owner's-kitchen-plans subquery.
drop policy plan_items_owner_write on public.plan_items;
create policy plan_items_owner_insert on public.plan_items for insert to public
  with check (plan_id in (select p.id from plans p join kitchens k on k.id = p.kitchen_id where k.owner_id = (select auth.uid())));
create policy plan_items_owner_update on public.plan_items for update to public
  using (plan_id in (select p.id from plans p join kitchens k on k.id = p.kitchen_id where k.owner_id = (select auth.uid())))
  with check (plan_id in (select p.id from plans p join kitchens k on k.id = p.kitchen_id where k.owner_id = (select auth.uid())));
create policy plan_items_owner_delete on public.plan_items for delete to public
  using (plan_id in (select p.id from plans p join kitchens k on k.id = p.kitchen_id where k.owner_id = (select auth.uid())));

-- plans: plans_read_active already ORs in the owner's-kitchen subquery.
drop policy plans_owner_write on public.plans;
create policy plans_owner_insert on public.plans for insert to public
  with check (is_active_kitchen_owner(kitchen_id));
create policy plans_owner_update on public.plans for update to public
  using (is_active_kitchen_owner(kitchen_id)) with check (is_active_kitchen_owner(kitchen_id));
create policy plans_owner_delete on public.plans for delete to public
  using (is_active_kitchen_owner(kitchen_id));
