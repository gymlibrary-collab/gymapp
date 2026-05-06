-- ============================================================
-- GymApp Migration v53
-- Batch C: Package validity + Membership duration in months
-- ============================================================

-- ── Package templates: validity period ───────────────────────
-- validity_months: how long the package is valid from start date
-- Used to auto-calculate end_date_calculated when a package is sold
alter table package_templates
  add column if not exists validity_months integer not null default 3
    check (validity_months > 0);

-- ── Membership types: duration in months ─────────────────────
-- duration_months: more intuitive than duration_days for display
-- duration_days is kept for backward compatibility
alter table membership_types
  add column if not exists duration_months integer
    check (duration_months > 0);

-- Backfill duration_months from duration_days for existing types
update membership_types set duration_months =
  case
    when duration_days <= 7   then null  -- trial, leave as null
    when duration_days <= 31  then 1
    when duration_days <= 92  then 3
    when duration_days <= 185 then 6
    else 12
  end
where duration_months is null;

-- Verify
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'package_templates'
  and column_name = 'validity_months';

select column_name, data_type
from information_schema.columns
where table_name = 'membership_types'
  and column_name = 'duration_months';

select 'Migration v53 complete' as status;
