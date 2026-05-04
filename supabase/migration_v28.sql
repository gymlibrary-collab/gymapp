-- ============================================================
-- GymApp Migration v28
-- Part-time operations staff: role = 'staff' (was 'trainer')
-- ============================================================
--
-- CONTEXT:
-- Part-time staff were previously stored as role='trainer' +
-- employment_type='part_time'. This was a data model inconsistency —
-- they are operations staff who handle sales, member lookup, and
-- shift work, not trainers. Their portal nav, payroll, and roster
-- logic all already keyed off employment_type='part_time', so the
-- role change has minimal downstream impact.
--
-- WHAT THIS DOES:
-- 1. Updates existing part-timer user records: role trainer → staff
-- 2. No change to employment_type, hourly_rate, trainer_gyms, or
--    any other columns — those stay as-is.
--
-- SAFE TO RE-RUN: uses WHERE clause so already-updated records
-- are not affected.
--
-- RUN THIS BEFORE deploying the matching code changes.
-- ============================================================

-- Step 1: Update existing part-timer records
update users
set role = 'staff'
where employment_type = 'part_time'
  and role = 'trainer'
  and is_archived = false;

-- Step 2: Also update archived part-timers for consistency
update users
set role = 'staff'
where employment_type = 'part_time'
  and role = 'trainer'
  and is_archived = true;

-- Step 3: Verify — should return 0 rows after migration
select id, full_name, role, employment_type
from users
where employment_type = 'part_time' and role = 'trainer';

select 'Migration v28 complete — part-timers now role=staff' as status;
