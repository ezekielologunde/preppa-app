alter table plan_items add column if not exists week_index int not null default 0;
alter table plans add column if not exists rotation_weeks int not null default 1;
alter table plans add constraint plans_rotation_weeks_check check (rotation_weeks between 1 and 4);
alter table plan_items add constraint plan_items_week_index_check check (week_index between 0 and 3);
