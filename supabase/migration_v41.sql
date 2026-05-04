-- ============================================================
-- GymApp Migration v41
-- RLS cleanup, security tightening, and performance optimisation
-- ============================================================
--
-- CHANGES:
--
-- 1. PERFORMANCE: Mark get_user_role() and get_manager_gym_id()
--    as STABLE so Postgres can cache the result per query instead
--    of executing a subquery once per row per policy.
--
-- 2. SECURITY — members, gym_memberships, sessions:
--    Replace auth.uid() IS NOT NULL (any user, any gym) with
--    properly scoped policies per role.
--
-- 3. SECURITY — members_write, gym_memberships_insert,
--    membership_sales_staff_insert:
--    Add role restrictions so only appropriate roles can insert.
--
-- 4. CLEANUP — users table:
--    Drop redundant overlapping policies. Keep one policy per
--    access pattern.
--
-- 5. CLEANUP — package_templates:
--    Drop duplicate identical SELECT policy.
--
-- Run in Supabase SQL Editor. Safe to re-run (uses drop if exists).
-- ============================================================


-- ── 1. Mark helper functions as STABLE ──────────────────────
-- STABLE tells Postgres the function returns the same value for
-- the same arguments within a single query — allows result caching.
-- This reduces subquery executions from (rows × policies) to 1
-- per query for get_user_role() and get_manager_gym_id().

create or replace function get_user_role()
returns text
language sql
stable
security definer
as $$
  select role from users where id = auth.uid();
$$;

create or replace function get_manager_gym_id()
returns uuid
language sql
stable
security definer
as $$
  select manager_gym_id from users where id = auth.uid();
$$;


-- ── 2. members table — scoped read and write policies ────────

drop policy if exists "members_read" on members;
create policy "members_read" on members
  for select using (
    -- Manager: their gym only
    (get_user_role() = 'manager' and gym_id = get_manager_gym_id())
    -- Trainer: members they created (their clients)
    or (get_user_role() = 'trainer' and created_by = auth.uid())
    -- Staff: members at their assigned gym (manager_gym_id reused for staff gym)
    or (get_user_role() = 'staff' and gym_id = (
      select manager_gym_id from users where id = auth.uid()
    ))
    -- Biz Ops: all gyms (for reporting/oversight)
    or get_user_role() = 'business_ops'
    -- Admin: all
    or get_user_role() = 'admin'
  );

drop policy if exists "members_write" on members;
create policy "members_write" on members
  for insert with check (
    -- Only manager, trainer, and staff can register new members
    get_user_role() in ('manager', 'trainer', 'staff')
  );


-- ── 3. gym_memberships table — scoped read and insert ────────

drop policy if exists "gym_memberships_read" on gym_memberships;
create policy "gym_memberships_read" on gym_memberships
  for select using (
    -- Manager: their gym only
    (get_user_role() = 'manager' and gym_id = get_manager_gym_id())
    -- Trainer/Staff: only sales they made themselves
    or ((get_user_role() in ('trainer', 'staff')) and sold_by_user_id = auth.uid())
    -- Biz Ops: all
    or get_user_role() = 'business_ops'
    -- Admin: all
    or get_user_role() = 'admin'
  );

drop policy if exists "gym_memberships_insert" on gym_memberships;
create policy "gym_memberships_insert" on gym_memberships
  for insert with check (
    -- Only manager, trainer, and staff can log membership sales
    get_user_role() in ('manager', 'trainer', 'staff')
    and sold_by_user_id = auth.uid()
  );


-- ── 4. sessions table — scoped read ─────────────────────────

drop policy if exists "sessions_read" on sessions;
create policy "sessions_read" on sessions
  for select using (
    -- Manager: their gym only
    (get_user_role() = 'manager' and gym_id = get_manager_gym_id())
    -- Trainer: sessions where they are the trainer
    or (get_user_role() = 'trainer' and trainer_id = auth.uid())
    -- Staff: sessions at their assigned gym
    or (get_user_role() = 'staff' and gym_id = (
      select manager_gym_id from users where id = auth.uid()
    ))
    -- Biz Ops: all (for reporting)
    or get_user_role() = 'business_ops'
    -- Admin: all
    or get_user_role() = 'admin'
  );


-- ── 5. membership_sales insert — add role restriction ────────

drop policy if exists "membership_sales_staff_insert" on membership_sales;
create policy "membership_sales_staff_insert" on membership_sales
  for insert with check (
    get_user_role() in ('manager', 'trainer', 'staff')
    and sold_by_user_id = auth.uid()
  );


-- ── 6. users table — drop redundant policies ─────────────────
-- Keep:
--   users_admin_full       — covers ALL operations for admin
--   users_biz_ops_read_all — scoped biz ops read (v40)
--   users_biz_ops_update   — biz ops update
--   users_manager_read     — scoped manager read (v30, most precise)
--   users_manager_update_trainer — manager update trainer commission
--   users_admin_manager_insert   — create new staff accounts
--   users_read_own         — own row read
--   users_update_own       — own row update
--
-- Drop:
--   users_admin_read_all      — redundant, covered by users_admin_full
--   users_admin_read_archived — redundant, covered by users_admin_full
--   users_read                — overly broad; own-row covered by users_read_own
--                               admin covered by users_admin_full
--                               manager covered by users_manager_read
--   users_manager_read_gym    — superseded by users_manager_read (v30)

drop policy if exists "users_admin_read_all" on users;
drop policy if exists "users_admin_read_archived" on users;
drop policy if exists "users_read" on users;
drop policy if exists "users_manager_read_gym" on users;


-- ── 7. package_templates — drop duplicate SELECT policy ──────

drop policy if exists "templates_read_all" on package_templates;
-- templates_read (auth.uid() IS NOT NULL) remains — identical policy, keep one


-- ── Verify ───────────────────────────────────────────────────

select tablename, policyname, cmd, qual
from pg_policies
where tablename in (
  'users', 'members', 'gym_memberships', 'sessions',
  'membership_sales', 'package_templates'
)
order by tablename, policyname;

select proname,
  case provolatile
    when 'i' then 'IMMUTABLE'
    when 's' then 'STABLE'
    when 'v' then 'VOLATILE'
  end as volatility
from pg_proc
where proname in ('get_user_role', 'get_manager_gym_id')
  and pronamespace = 'public'::regnamespace;

select 'Migration v41 complete' as status;
