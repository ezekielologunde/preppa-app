
-- Reversible-repair backup: full JSONB pre-image of every row touched by the
-- 2026-07-10 data-quality repair. RLS on, no policy (locked; service role bypasses).
create table if not exists public.data_repair_backup_20260710 (
  id bigserial primary key,
  op text not null,               -- 'update' | 'delete'
  table_name text not null,
  row_pk text,
  snapshot jsonb not null,
  note text,
  created_at timestamptz not null default now()
);
alter table public.data_repair_backup_20260710 enable row level security;
comment on table public.data_repair_backup_20260710 is 'Pre-image snapshots for the 2026-07-10 data-quality repair (rollback source).';
