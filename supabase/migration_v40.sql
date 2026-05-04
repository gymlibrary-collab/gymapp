-- ============================================================
-- GymApp Migration v40
-- Tighten users_biz_ops_read_all RLS policy
-- ============================================================
--
-- PROBLEM:
-- users_biz_ops_read_all allows Biz Ops to read ALL rows in
-- the users table including admin and business_ops accounts.
-- The application-level filter (.in('role', [...]) was being
-- dropped from the Supabase request URL, so admin and biz_ops
-- accounts were appearing in the Staff Management list.
--
-- FIX:
-- Replace the policy so Biz Ops can only read rows where role
-- is manager, trainer, or staff — plus their own row.
-- Admin accounts are managed in the admin portal only.
-- Biz Ops accounts are managed by admin only.
-- ============================================================

drop policy if exists "users_biz_ops_read_all" on users;

create policy "users_biz_ops_read_all" on users
  for select using (
    get_user_role() = 'business_ops'
    and (
      -- Can always read own record
      id = auth.uid()
      -- Can only read manager, trainer, staff accounts
      or role in ('manager', 'trainer', 'staff')
    )
  );

-- Verify
select policyname, cmd, qual
from pg_policies
where tablename = 'users' and policyname = 'users_biz_ops_read_all';

select 'Migration v40 complete — Biz Ops can no longer read admin/business_ops accounts' as status;
