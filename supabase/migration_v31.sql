-- ============================================================
-- GymApp Migration v31
-- Backfill public_holidays.year where null
-- ============================================================
--
-- CONTEXT:
-- The public_holidays insert in config/public-holidays/page.tsx
-- was missing the `year` column. The year column is separate from
-- holiday_date (not derived/generated), so any holidays added before
-- this fix will have year = null, causing them to be invisible in
-- the year selector and in the Biz Ops dashboard alert check.
--
-- This migration backfills year from the holiday_date column.
-- The application code has been updated to always include year
-- in new inserts going forward.
--
-- SAFE TO RE-RUN: WHERE clause restricts to null rows only.
-- ============================================================

update public_holidays
set year = extract(year from holiday_date::date)::int
where year is null;

-- Verify: should return 0 rows after migration
select id, holiday_date, name, year
from public_holidays
where year is null;

select 'Migration v31 complete — public_holidays.year backfilled' as status;
