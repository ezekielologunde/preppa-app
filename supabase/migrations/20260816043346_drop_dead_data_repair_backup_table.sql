-- Baseline-readiness pass (2026-08-15): public.data_repair_backup_20260710 is a
-- one-time, ad-hoc pre-mutation snapshot (2 rows) from a manual data-repair
-- operation on 2026-07-10 -- not a real app table. Confirmed zero code
-- references anywhere in the repo, zero view dependencies, zero FK
-- references (checked via pg_depend and information_schema before dropping).
-- Its two rows were pre-mutation snapshots for a meal-row fix and a test-kitchen
-- deletion, both long since applied; nothing depends on this table existing.
drop table public.data_repair_backup_20260710;
