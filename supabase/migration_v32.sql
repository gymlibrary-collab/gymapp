-- ============================================================
-- GymApp Migration v32
-- Gyms table: write access for Biz Ops (all fields) and
-- manager (logo_url only — their assigned gym only)
-- ============================================================
--
-- CONTEXT:
-- The gyms table only had SELECT policies for business_ops and manager.
-- This caused two silent failures:
--   1. Biz Ops gym updates (name, address, size, etc.) returned no error
--      but wrote nothing — RLS blocked the UPDATE silently.
--   2. Manager logo uploads to Storage succeeded but the logo_url write
--      to gyms was also silently blocked.
--
-- WHAT THIS ADDS:
--   gyms_biz_ops_write — Biz Ops can INSERT, UPDATE, DELETE any gym row.
--   gyms_manager_update — Manager can UPDATE logo_url on their own gym.
--     (Name, address, size etc. remain Biz Ops only — managers cannot
--      change those fields, but RLS cannot restrict by column so we rely
--      on the UI being read-only for those fields on the manager portal.)
--
-- SAFE TO RE-RUN: uses drop if exists before create.
-- ============================================================

-- ── Biz Ops: full write access on gyms ──────────────────────
drop policy if exists "gyms_biz_ops_write" on gyms;

create policy "gyms_biz_ops_write" on gyms
  for all
  using (get_user_role() = 'business_ops')
  with check (get_user_role() = 'business_ops');

-- ── Manager: can update their own gym (logo upload) ─────────
-- Note: Postgres RLS cannot restrict by column, so the policy
-- allows UPDATE on the whole row. The My Gym page only ever
-- writes logo_url — name, address, size, date_opened are
-- read-only in the manager UI.
drop policy if exists "gyms_manager_update" on gyms;

create policy "gyms_manager_update" on gyms
  for update
  using (get_user_role() = 'manager' and id = get_manager_gym_id())
  with check (get_user_role() = 'manager' and id = get_manager_gym_id());

-- Verify
select policyname, cmd, qual
from pg_policies
where tablename = 'gyms'
order by policyname;

select 'Migration v32 complete — gyms write policies added' as status;
