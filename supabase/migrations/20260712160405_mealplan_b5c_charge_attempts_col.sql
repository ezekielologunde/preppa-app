alter table subscription_cycles add column if not exists charge_attempts int not null default 0;
