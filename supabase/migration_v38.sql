-- ============================================================
-- GymApp Migration v38
-- Add address column to users table
-- ============================================================

alter table users
  add column if not exists address text;

select 'Migration v38 complete — address column added to users' as status;
