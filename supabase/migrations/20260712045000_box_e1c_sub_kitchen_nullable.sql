-- A cross-kitchen box subscription belongs to no single kitchen (items carry kitchen_id).
alter table subscriptions alter column kitchen_id drop not null;
