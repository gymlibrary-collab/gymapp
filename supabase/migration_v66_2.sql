-- ============================================================
-- GymApp Migration v66 — users table RLS
-- 
-- PREREQUISITES (must be done before running this):
-- 1. Backfill complete: all auth.users have role in raw_app_meta_data
-- 2. Verified: select au.email, au.raw_app_meta_data->>'role' as app_role,
--              u.role as db_role from auth.users au join public.users u on u.id = au.id
--    All app_role = db_role
-- 3. /api/trainers deployed with app_metadata: { role } on create/update
--
-- ROLLBACK (if anything breaks):
--   alter table users disable row level security;
--   (All existing policies remain — just re-enable when ready to retry)
--
-- AFTER RUNNING:
-- All active users must log out and log back in for their JWT to
-- include the app_metadata role claim.
-- ============================================================

-- ── Step 1: Drop all existing users policies ─────────────────
drop policy if exists "users_admin_all"              on users;
drop policy if exists "users_admin_full"             on users;
drop policy if exists "users_admin_read_all"         on users;
drop policy if exists "users_admin_read_archived"    on users;
drop policy if exists "users_biz_ops_read"           on users;
drop policy if exists "users_biz_ops_read_all"       on users;
drop policy if exists "users_manager_insert"         on users;
drop policy if exists "users_manager_read"           on users;
drop policy if exists "users_manager_read_gym"       on users;
drop policy if exists "users_manager_update_trainer" on users;
drop policy if exists "users_read_own"               on users;
drop policy if exists "users_trainer_read_self"      on users;
drop policy if exists "users_update_own"             on users;

-- ── Step 2: Create new policies using app_metadata ───────────
-- Uses auth.jwt()->'app_metadata'->>'role' instead of get_user_role()
-- get_user_role() queries the users table causing infinite recursion when RLS is on

-- Everyone: always read own row (no role check, no recursion)
create policy "users_read_own" on users
  for select using (id = auth.uid());

-- Admin: full access to all rows including archived
create policy "users_admin_all" on users
  for all using (
    (auth.jwt()->'app_metadata'->>'role') = 'admin'
  );

-- Business Ops: read all active and archived users
create policy "users_biz_ops_read_all" on users
  for select using (
    (auth.jwt()->'app_metadata'->>'role') = 'business_ops'
  );

-- Manager: read users in their gym only
-- (their trainers via trainer_gyms + ops staff via manager_gym_id)
create policy "users_manager_read_gym" on users
  for select using (
    (auth.jwt()->'app_metadata'->>'role') = 'manager'
    and (
      manager_gym_id = get_manager_gym_id()
      or id in (
        select trainer_id from trainer_gyms
        where gym_id = get_manager_gym_id()
      )
    )
  );

-- Everyone: update own row (profile edits, notification seen flags)
create policy "users_update_own" on users
  for update using (id = auth.uid());

-- Manager: update trainers in their gym
create policy "users_manager_update_trainer" on users
  for update using (
    (auth.jwt()->'app_metadata'->>'role') = 'manager'
    and role = 'trainer'
    and id in (
      select trainer_id from trainer_gyms
      where gym_id = get_manager_gym_id()
    )
  );

-- ── Step 3: Enable RLS ────────────────────────────────────────
alter table users enable row level security;

select 'Migration v66 complete — users RLS enabled' as status;
