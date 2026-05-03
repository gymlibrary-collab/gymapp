-- ============================================================
-- GymApp Migration v27
-- Restrict SELECT on users table by role
-- Run in Supabase SQL Editor after v26
-- ============================================================

-- Drop any existing broad read policies
drop policy if exists "users_read_all" on users;
drop policy if exists "users_authenticated_read" on users;

-- Own record: everyone can read their own row
create policy "users_read_own" on users
  for select using (id = auth.uid());

-- Admin: full access (already covered by users_admin_full for all ops)
-- Business Ops: can read all users
create policy "users_biz_ops_read_all" on users
  for select using (get_user_role() = 'business_ops');

-- Manager: can read users in their own gym only
-- (their trainers via trainer_gyms + their ops staff via manager_gym_id)
create policy "users_manager_read_gym" on users
  for select using (
    get_user_role() = 'manager'
    and (
      -- Ops staff assigned to this manager's gym
      manager_gym_id = get_manager_gym_id()
      -- Trainers assigned to this manager's gym
      or id in (
        select trainer_id from trainer_gyms
        where gym_id = get_manager_gym_id()
      )
    )
  );

-- Admin: read all (supplement the admin_full policy which covers all ops)
create policy "users_admin_read_all" on users
  for select using (get_user_role() = 'admin');

select 'Migration v27 complete' as status;
