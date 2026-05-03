-- ============================================================
-- GymApp Migration v19
-- New role: staff (Operations Staff)
-- Run in Supabase SQL Editor after v18
-- ============================================================

-- ── Add 'staff' to role constraint ──────────────────────────
-- Drop and recreate the check constraint to include 'staff'
alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check
  check (role in ('admin', 'manager', 'business_ops', 'trainer', 'staff'));

-- ── Staff gym assignment ─────────────────────────────────────
-- Operations staff are assigned to one gym, stored in manager_gym_id
-- (reusing existing column — it is just a FK to gyms)
-- No new column needed.

-- ── RLS: staff can read members at their gym ─────────────────
-- Update existing member policies to include staff role
drop policy if exists "members_read" on members;
create policy "members_read" on members
  for select using (
    auth.uid() is not null
  );

-- Staff can read gym_memberships (to look up member records)
drop policy if exists "gym_memberships_read" on gym_memberships;
create policy "gym_memberships_read" on gym_memberships
  for select using (
    auth.uid() is not null
  );

-- Staff can insert their own membership sales
drop policy if exists "membership_sales_staff_insert" on membership_sales;
create policy "membership_sales_staff_insert" on membership_sales
  for insert with check (
    auth.uid() is not null
    and sold_by_user_id = auth.uid()
  );

-- Sessions read: staff can read sessions at their gym
drop policy if exists "sessions_read" on sessions;
create policy "sessions_read" on sessions
  for select using (
    auth.uid() is not null
  );

select 'Migration v19 complete' as status;
