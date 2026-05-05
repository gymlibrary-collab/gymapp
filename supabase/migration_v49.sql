-- ============================================================
-- GymApp Migration v49
-- Drop unused membership_sales table
-- ============================================================
--
-- The membership_sales table was superseded by gym_memberships
-- (introduced in migration v17) when the members registry was
-- added. All membership sale recording and commission tracking
-- now uses gym_memberships exclusively.
--
-- The commission generation page was incorrectly querying
-- membership_sales — this was fixed in the application code
-- alongside this migration (commission/page.tsx now queries
-- gym_memberships with sale_status = 'confirmed').
--
-- Verified: no remaining code references membership_sales as
-- a table. The string 'membership_sales_count' appears only
-- as a column name in commission_payouts — unrelated.
-- ============================================================

drop table if exists membership_sales cascade;

-- Verify it's gone
select 'membership_sales table dropped' as status
where not exists (
  select 1 from information_schema.tables
  where table_name = 'membership_sales'
    and table_schema = 'public'
);
