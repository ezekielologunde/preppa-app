-- Bound public catalog fields at the database boundary. NOT VALID avoids blocking the
-- migration on historical rows, while PostgreSQL still enforces each check for new and
-- updated rows. Historical exceptions can be reviewed before validating the constraints.
alter table public.meals
  add constraint meals_public_name_length
    check (char_length(btrim(name)) between 2 and 120) not valid,
  add constraint meals_public_description_length
    check (description is null or char_length(description) <= 2000) not valid,
  add constraint meals_public_price_range
    check (price_cents between 100 and 100000000) not valid,
  add constraint meals_public_serves_range
    check (serves between 1 and 100) not valid,
  add constraint meals_public_ingredients_length
    check (char_length(ingredients) between 3 and 5000) not valid,
  add constraint meals_public_tags_count
    check (tags is null or cardinality(tags) <= 20) not valid,
  add constraint meals_public_allergens_allowlist
    check (allergens <@ array['Milk','Eggs','Fish','Shellfish','Tree nuts','Peanuts','Wheat','Soy','Sesame']::text[]) not valid;
