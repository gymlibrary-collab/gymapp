-- ============================================================
-- GymApp Migration v23
-- Add rejected_at timestamp to leave_applications
-- Run in Supabase SQL Editor after v22
-- ============================================================

alter table leave_applications
  add column if not exists rejected_at timestamptz;

select 'Migration v23 complete' as status;
