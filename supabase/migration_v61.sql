-- ============================================================
-- GymApp Migration v61
-- commission_payouts: add unique constraint on user_id + period
-- user_id already exists in the live table (from migration_v16)
-- ============================================================

-- Add unique constraint for duplicate detection (if not already present)
alter table commission_payouts
  drop constraint if exists commission_payouts_user_period_unique;

alter table commission_payouts
  add constraint commission_payouts_user_period_unique
  unique (user_id, period_start, period_end);

-- Index for fast lookups by user
create index if not exists commission_payouts_user_id_idx
  on commission_payouts (user_id, period_start);

select 'Migration v61 complete' as status;
