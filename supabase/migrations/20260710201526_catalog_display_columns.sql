-- R1 slice 1: make `meals` the source of truth for the buyer catalog. Add the
-- display fields the UI needs (slug = cart-compatible id, tags, protein, image,
-- gradient, prep/dist labels, match flag). rating/review_count are relocated seed
-- values for now (zero UI regression); R7 replaces them with real reviews. Populated
-- from the current data.ts seed, matched by name.
alter table public.meals
  add column if not exists slug text,
  add column if not exists grad text,
  add column if not exists tags text[],
  add column if not exists protein_g smallint,
  add column if not exists image_url text,
  add column if not exists photos text[],
  add column if not exists rating numeric(2,1),
  add column if not exists review_count int,
  add column if not exists prep_label text,
  add column if not exists dist_label text,
  add column if not exists is_match boolean default false;

update public.meals m set
  slug = v.slug, grad = v.grad, tags = v.tags, protein_g = v.protein, image_url = v.img,
  photos = v.photos, rating = v.rating, review_count = v.reviews, prep_label = v.prep,
  dist_label = v.dist, is_match = v.match
from (values
  ('Family Lasagna Tray','lasagna','g4', array['Comfort','Pasta'], 34, 'https://www.themealdb.com/images/media/meals/rvxxuy1468312893.jpg', null::text[], 4.9, 312, '25m', '1.2 km', true),
  ('Honey Garlic Salmon','salmon','g3', array['Healthy','Seafood'], 42, 'https://www.themealdb.com/images/media/meals/ikizdm1763760862.jpg', null::text[], 4.8, 204, '30m', '0.8 km', true),
  ('Smoky Jollof & Chicken','jollof','g1', array['West African','Spicy'], 38, 'https://www.themealdb.com/images/media/meals/wyxwsp1486979827.jpg', null::text[], 4.9, 412, '20m', '0.6 km', false),
  ('Slow-Braised Short Rib','shortrib','g6', array['Comfort','Soul food'], 45, 'https://www.themealdb.com/images/media/meals/pbzcrx1763765096.jpg', array['https://www.themealdb.com/images/media/meals/pbzcrx1763765096.jpg','https://www.themealdb.com/images/media/meals/lmc6r51764365554.jpg','https://www.themealdb.com/images/media/meals/rvxxuy1468312893.jpg'], 4.9, 540, '35m', '1.6 km', true),
  ('Oaxacan Mole Tacos','tacos','g7', array['Mexican','Vegan opt.'], 18, 'https://www.themealdb.com/images/media/meals/uvuyxu1503067369.jpg', null::text[], 4.7, 198, '25m', '2.1 km', false),
  ('Chicken Biryani Box','biryani','g8', array['Halal','Desi'], 40, 'https://www.themealdb.com/images/media/meals/xrttsx1487339558.jpg', null::text[], 4.8, 276, '30m', '1.4 km', true),
  ('Rainbow Poke Bowl','poke','g5', array['Healthy','Fresh'], 32, 'https://www.themealdb.com/images/media/meals/yypwwq1511304979.jpg', null::text[], 4.7, 142, '20m', '0.8 km', false),
  ('Honey Cornbread (6)','cornbread','g4', array['Sides','Baked'], 6, 'https://www.themealdb.com/images/media/meals/lmc6r51764365554.jpg', null::text[], 5.0, 88, '15m', '1.6 km', false)
) as v(name, slug, grad, tags, protein, img, photos, rating, reviews, prep, dist, match)
where m.name = v.name;

create unique index if not exists meals_slug_key on public.meals(slug) where slug is not null;
