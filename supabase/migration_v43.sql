-- ============================================================
-- GymApp Migration v43
-- Redesign users table RLS to eliminate infinite recursion
-- ============================================================
--
-- ROOT CAUSE:
-- All policies on the users table called get_user_role(), which
-- does SELECT role FROM users WHERE id = auth.uid(). This query
-- on users triggered RLS evaluation, which called get_user_role()
-- again — infinite recursion → 500 error for all users.
--
-- SOLUTION:
-- Create a SECURITY DEFINER view (user_roles) that exposes only
-- the current user's own role and gym_id. Policies on users
-- reference this view instead of calling get_user_role().
-- The view bypasses RLS by virtue of SECURITY DEFINER, breaking
-- the recursion permanently.
--
-- SECURITY:
-- - RLS remains enabled on users table
-- - The view only exposes the calling user's own row
-- - get_user_role() and get_manager_gym_id() are updated to use
--   the view instead of querying users directly
-- - All access patterns are preserved
-- ============================================================


-- ── Step 1: Create security definer view ─────────────────────
-- This view runs as its owner (postgres) and bypasses RLS.
-- It only ever returns the current user's own role + gym.

create or replace view current_user_role
  with (security_invoker = false)
as
  select role, manager_gym_id
  from users
  where id = auth.uid();

-- Grant access to authenticated users
grant select on current_user_role to authenticated;
grant select on current_user_role to anon;


-- ── Step 2: Update helper functions to use the view ──────────

create or replace function get_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from current_user_role limit 1;
$$;

create or replace function get_manager_gym_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select manager_gym_id from current_user_role limit 1;
$$;


-- ── Step 3: Restore users table RLS with correct policies ────

-- RLS is currently disabled (emergency measure) — re-enable it
alter table users enable row level security;

-- Drop any leftover policies
drop policy if exists "users_read_jwt" on users;
drop policy if exists "users_write_jwt" on users;
drop policy if exists "users_read_own" on users;
drop policy if exists "users_update_own" on users;
drop policy if exists "users_admin_full" on users;
drop policy if exists "users_admin_manager_insert" on users;
drop policy if exists "users_biz_ops_read_all" on users;
drop policy if exists "users_biz_ops_update" on users;
drop policy if exists "users_manager_read" on users;
drop policy if exists "users_manager_read_gym" on users;
drop policy if exists "users_manager_update_trainer" on users;
drop policy if exists "users_trainer_staff_read_own" on users;
drop policy if exists "users_trainer_staff_self_read" on users;
drop policy if exists "users_admin_read_all" on users;
drop policy if exists "users_admin_read_archived" on users;
drop policy if exists "users_read" on users;

-- ── SELECT policies ──────────────────────────────────────────

-- Any authenticated user can read their own row
create policy "users_read_own" on users
  for select using (id = auth.uid());

-- Admin: read all rows
create policy "users_admin_read" on users
  for select using (
    (select role from current_user_role) = 'admin'
  );

-- Biz Ops: read manager/trainer/staff rows + own row
create policy "users_biz_ops_read" on users
  for select using (
    (select role from current_user_role) = 'business_ops'
    and (
      id = auth.uid()
      or role in ('manager', 'trainer', 'staff')
    )
  );

-- Manager: read own row + trainers at their gym + staff at their gym
create policy "users_manager_read" on users
  for select using (
    (select role from current_user_role) = 'manager'
    and (
      id = auth.uid()
      or (
        role not in ('admin', 'business_ops')
        and (
          id in (
            select trainer_id from trainer_gyms
            where gym_id = (select manager_gym_id from current_user_role)
          )
          or (
            role = 'staff'
            and manager_gym_id = (select manager_gym_id from current_user_role)
          )
        )
      )
    )
  );

-- ── INSERT policies ──────────────────────────────────────────

-- Admin and Biz Ops can create new staff accounts
create policy "users_admin_biz_ops_insert" on users
  for insert with check (
    (select role from current_user_role) in ('admin', 'business_ops')
  );

-- ── UPDATE policies ──────────────────────────────────────────

-- Admin: update any row
create policy "users_admin_update" on users
  for update using (
    (select role from current_user_role) = 'admin'
  );

-- Biz Ops: update manager/trainer/staff rows
create policy "users_biz_ops_update" on users
  for update using (
    (select role from current_user_role) = 'business_ops'
    and role in ('manager', 'trainer', 'staff')
  ) with check (
    (select role from current_user_role) = 'business_ops'
  );

-- Manager: update trainers at their gym
create policy "users_manager_update" on users
  for update using (
    (select role from current_user_role) = 'manager'
    and role = 'trainer'
    and id in (
      select trainer_id from trainer_gyms
      where gym_id = (select manager_gym_id from current_user_role)
    )
  );

-- Any authenticated user: update their own row (phone, address etc)
create policy "users_update_own" on users
  for update using (id = auth.uid());


-- ── Step 4: Verify ───────────────────────────────────────────

select policyname, cmd, qual
from pg_policies
where tablename = 'users'
order by cmd, policyname;

select proname,
  case provolatile when 's' then 'STABLE' when 'v' then 'VOLATILE' end as volatility,
  proconfig
from pg_proc
where proname in ('get_user_role', 'get_manager_gym_id')
  and pronamespace = 'public'::regnamespace;

-- Test: this should no longer cause infinite recursion
select count(*) as users_readable from users;

notify pgrst, 'reload schema';

select 'Migration v43 complete — users RLS redesigned without recursion' as status;
