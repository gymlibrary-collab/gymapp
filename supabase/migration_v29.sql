-- ============================================================
-- GymApp Migration v29
-- Business Ops: full write access on trainer_gyms and users
-- ============================================================
--
-- CONTEXT:
-- Business Ops manages all staff across all gym outlets — hiring,
-- gym assignment, role changes, status, and payroll configuration.
-- The existing RLS had two gaps:
--
--   1. trainer_gyms — no Biz Ops policy at all. All writes currently
--      go through /api/trainers which uses the service role (adminClient)
--      and bypasses RLS. Adding explicit policies closes the gap
--      defensively and supports any future direct-client writes.
--
--   2. users table — Biz Ops had SELECT only (users_biz_ops_read).
--      No INSERT or UPDATE policy existed for Biz Ops. The API's
--      adminClient bypassed this, but it should be explicit.
--
-- SAFE TO RE-RUN: all statements use drop if exists before create.
-- ============================================================

-- ── trainer_gyms: Biz Ops full access ───────────────────────
-- Biz Ops can assign any staff member to any gym outlet.
-- This covers trainers, part-time ops staff (whose gym memberships
-- flow through trainer_gyms for roster filtering), managers, and
-- full-time ops staff where applicable.

drop policy if exists "trainer_gyms_biz_ops" on trainer_gyms;

create policy "trainer_gyms_biz_ops" on trainer_gyms
  for all
  using (get_user_role() = 'business_ops')
  with check (get_user_role() = 'business_ops');

-- ── users: Biz Ops update access ────────────────────────────
-- Biz Ops can update any staff record (role, status, gym assignment,
-- commission rates, employment details, leave entitlement, etc).
-- INSERT remains restricted to admin + manager (account creation
-- goes through /api/trainers which uses adminClient anyway).

drop policy if exists "users_biz_ops_update" on users;

create policy "users_biz_ops_update" on users
  for update
  using (get_user_role() = 'business_ops')
  with check (get_user_role() = 'business_ops');

-- ── Verify: list all trainer_gyms and users policies ────────
select tablename, policyname, cmd, qual
from pg_policies
where tablename in ('trainer_gyms', 'users')
order by tablename, policyname;

select 'Migration v29 complete — Biz Ops write access granted on trainer_gyms and users' as status;
