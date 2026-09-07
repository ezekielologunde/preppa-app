alter table plans drop constraint plans_status_check;
alter table plans add constraint plans_status_check check (status = any (array['draft'::text,'active'::text,'archived'::text]));
