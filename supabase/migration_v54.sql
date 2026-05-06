-- ============================================================
-- GymApp Migration v54
-- Add offboarding_completed_at to users table
-- ============================================================
--
-- Records when Biz Ops formally completed the offboarding
-- checklist for a departing staff member. Null means either
-- not yet departed or offboarding not yet formally completed.
-- ============================================================

alter table users
  add column if not exists offboarding_completed_at timestamptz;

-- Verify
select column_name, data_type
from information_schema.columns
where table_name = 'users'
  and column_name = 'offboarding_completed_at';

select 'Migration v54 complete — offboarding_completed_at added to users' as status;
