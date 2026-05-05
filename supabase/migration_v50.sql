-- ============================================================
-- GymApp Migration v50
-- Add manager confirmation to packages table
-- ============================================================
--
-- PT package sales now require manager acknowledgement before
-- the signup commission counts towards a payout.
-- Existing packages are set to manager_confirmed = true so
-- historical commission generation is not disrupted.
-- ============================================================

alter table packages
  add column if not exists manager_confirmed boolean default false,
  add column if not exists manager_confirmed_by uuid references users(id) on delete set null,
  add column if not exists manager_confirmed_at timestamptz;

-- Backfill: mark all existing packages as confirmed so
-- historical commission payouts are not affected
update packages set manager_confirmed = true
  where manager_confirmed is null or manager_confirmed = false;

-- Verify
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'packages'
  and column_name in ('manager_confirmed', 'manager_confirmed_by', 'manager_confirmed_at');

select 'Migration v50 complete — manager_confirmed added to packages' as status;
