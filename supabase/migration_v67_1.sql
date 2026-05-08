-- =============================================================================
-- migration_v67.sql
-- 
-- Two goals:
--   1. Fix members_read RLS — extend trainer scope from created_by-only
--      to gym-scoped (trainers see all active members at their assigned gym)
--   2. Sync repo to live DB state — commit the policy cleanup and additions
--      that were applied directly in Supabase and never committed to migrations
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. FIX: members_read — trainer scope
--
-- BEFORE: trainer sees only members WHERE created_by = auth.uid()
--         This means a trainer can't see members registered by staff/manager,
--         blocking PT onboarding for any member they didn't personally register.
--
-- AFTER:  trainer sees members at any gym they are assigned to (via trainer_gyms)
--         This matches how the members page and pt/onboard page actually work.
-- -----------------------------------------------------------------------------
drop policy if exists "members_read" on members;

create policy "members_read" on members
  for select
  using (
    -- Manager sees all members at their gym
    ((get_user_role() = 'manager') and (gym_id = get_manager_gym_id()))
    or
    -- Trainer sees all active members at any gym they are assigned to
    ((get_user_role() = 'trainer') and (
      gym_id in (
        select gym_id from trainer_gyms where trainer_id = auth.uid()
      )
    ))
    or
    -- Staff sees all members at their assigned gym
    ((get_user_role() = 'staff') and (
      gym_id = (select manager_gym_id from users where id = auth.uid())
    ))
    or
    -- Biz ops and admin see all
    get_user_role() = 'business_ops'
    or
    get_user_role() = 'admin'
  );


-- -----------------------------------------------------------------------------
-- 2. SYNC: app_settings — biz_ops write access
--
-- Repo had: app_settings_admin_write (admin only)
-- Live has: app_settings_privileged_write (admin OR business_ops)
-- Biz Ops manages escalation thresholds, leave policy, logos — they need write.
-- -----------------------------------------------------------------------------
drop policy if exists "app_settings_admin_write" on app_settings;
drop policy if exists "app_settings_privileged_write" on app_settings;

create policy "app_settings_privileged_write" on app_settings
  for all
  using (get_user_role() = any(array['admin', 'business_ops']));


-- -----------------------------------------------------------------------------
-- 3. SYNC: payslip_deletions — biz_ops access
--
-- Repo had: admin_read + admin_insert
-- Live has: admin_read + biz_ops_insert + biz_ops_read
-- Biz Ops is the role that actually approves and executes payslip deletions.
-- -----------------------------------------------------------------------------
drop policy if exists "payslip_deletions_admin_insert" on payslip_deletions;
drop policy if exists "payslip_deletions_biz_ops_insert" on payslip_deletions;
drop policy if exists "payslip_deletions_biz_ops_read" on payslip_deletions;

create policy "payslip_deletions_biz_ops_insert" on payslip_deletions
  for insert
  with check (get_user_role() = 'business_ops');

create policy "payslip_deletions_biz_ops_read" on payslip_deletions
  for select
  using (get_user_role() = 'business_ops');

-- Admin read stays as-is (already exists in live)


-- -----------------------------------------------------------------------------
-- 4. SYNC: commission_payouts — remove old overlapping policies
--
-- Repo schema.sql created 4 policies. migration_v16 created 2 replacements.
-- Both sets coexist in repo. Live DB already has only the 2 clean policies
-- (old ones were manually dropped). Align repo to live state.
-- -----------------------------------------------------------------------------
drop policy if exists "payouts_admin_all" on commission_payouts;
drop policy if exists "payouts_manager_all" on commission_payouts;
drop policy if exists "payouts_biz_ops_read" on commission_payouts;
drop policy if exists "payouts_trainer_read" on commission_payouts;
-- The two live policies (commission_payouts_biz_ops, commission_payouts_staff_read)
-- already exist — no need to recreate.


-- -----------------------------------------------------------------------------
-- 5. SYNC: sessions — remove old overlapping policies
--
-- schema.sql created sessions_manager_read, sessions_trainer_read,
-- sessions_admin_all, sessions_manager_update, sessions_trainer_update.
-- migration_v41 created sessions_read (comprehensive) as replacement.
-- Live DB already cleaned these up. Align repo to live.
-- -----------------------------------------------------------------------------
drop policy if exists "sessions_admin_all" on sessions;
drop policy if exists "sessions_manager_read" on sessions;
drop policy if exists "sessions_trainer_read" on sessions;
drop policy if exists "sessions_manager_update" on sessions;
drop policy if exists "sessions_trainer_update" on sessions;
-- sessions_read, sessions_trainer_insert, sessions_update, sessions_biz_ops_read
-- already exist in live — no need to recreate.


-- -----------------------------------------------------------------------------
-- 6. SYNC: packages — remove old overlapping policies
--
-- schema.sql created packages_manager_read, packages_trainer_read,
-- packages_admin_all, packages_manager_update (old form).
-- migration_v17 created cleaner replacements.
-- Live DB already cleaned these up.
-- -----------------------------------------------------------------------------
drop policy if exists "packages_admin_all" on packages;
drop policy if exists "packages_manager_read" on packages;
drop policy if exists "packages_trainer_read" on packages;
-- packages_read, packages_trainer_insert, packages_admin_update, packages_biz_ops_read
-- already exist in live — no need to recreate.


-- -----------------------------------------------------------------------------
-- 7. SYNC: clients — ensure clients_read policy exists
--
-- Live DB has clients_read: admin/manager OR trainer_id = auth.uid()
-- This allows managers and trainers to read their own client records.
-- Repo only had role-specific SELECT policies from schema.sql.
-- -----------------------------------------------------------------------------
drop policy if exists "clients_read" on clients;
drop policy if exists "clients_admin_all" on clients;
drop policy if exists "clients_manager_read" on clients;
drop policy if exists "clients_trainer_read" on clients;
drop policy if exists "clients_trainer_update" on clients;

create policy "clients_read" on clients
  for select
  using (
    (get_user_role() = any(array['admin', 'manager']))
    or
    (trainer_id = auth.uid())
  );

drop policy if exists "clients_biz_ops_read" on clients;

create policy "clients_biz_ops_read" on clients
  for select
  using (get_user_role() = 'business_ops');

drop policy if exists "clients_trainer_insert" on clients;

create policy "clients_trainer_insert" on clients
  for insert
  with check (
    (trainer_id = auth.uid())
    and (
      (get_user_role() = 'trainer')
      or (
        (get_user_role() = 'manager')
        and (select is_also_trainer from users where id = auth.uid())
      )
    )
  );

drop policy if exists "clients_update" on clients;

create policy "clients_update" on clients
  for update
  using (
    (get_user_role() = any(array['admin', 'manager']))
    or (trainer_id = auth.uid())
  );


-- -----------------------------------------------------------------------------
-- 8. SYNC: gyms — ensure biz_ops and manager write policies exist
-- (these were added live in v32 but may not be in all repo forks)
-- -----------------------------------------------------------------------------
drop policy if exists "gyms_manager_read" on gyms;
drop policy if exists "gyms_trainer_read" on gyms;
drop policy if exists "gyms_biz_ops_read" on gyms;

-- Consolidated: all authenticated users can read gyms
-- (already exists as gyms_read in live — just dropping the old split policies)
-- gyms_admin_all, gyms_biz_ops_write, gyms_manager_update, gyms_read
-- all already exist in live — no need to recreate.
