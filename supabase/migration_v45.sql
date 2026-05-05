-- ============================================================
-- GymApp Migration v45
-- Add financial year start month to gyms table
-- ============================================================
--
-- fy_start_month: integer 1-12 representing the month the
-- financial year begins. Default is 1 (January).
-- Example: 4 = April, meaning FY runs April to March.
-- ============================================================

alter table gyms
  add column if not exists fy_start_month integer
    not null default 1
    check (fy_start_month between 1 and 12);

-- Verify
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'gyms' and column_name = 'fy_start_month';

select 'Migration v45 complete — fy_start_month added to gyms' as status;
