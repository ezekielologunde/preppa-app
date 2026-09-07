-- "Request a meal plan" brief: a demand-side request that a cook answers by PUBLISHING a
-- plan (not a one-off quote/deposit). Reuses the service_requests routing + notify.
alter type service_category add value if not exists 'meal_plan';
