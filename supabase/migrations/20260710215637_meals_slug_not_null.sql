
-- The one real prevention gap: meals.slug was UNIQUE but nullable, so a NULL slug
-- (unroutable row) slipped through. Now that every meal has a slug, enforce NOT NULL.
alter table public.meals alter column slug set not null;
