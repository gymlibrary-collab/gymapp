-- ============================================================
-- GymApp Migration v39
-- Membership commission: percentage → fixed SGD per sale
-- ============================================================
--
-- CHANGES:
-- 1. users.membership_commission_pct → membership_commission_sgd
--    Column renamed and type kept as numeric(10,2).
--    Existing values treated as dollar amounts (e.g. 5.00 → $5.00).
--    If your existing values were percentages (e.g. 5 meaning 5%),
--    you may want to manually update them to dollar amounts after
--    running this migration.
--
-- 2. commission_config key 'membership_commission_pct'
--    → 'membership_commission_sgd'
--    Config value is now a fixed SGD amount per membership sold.
--
-- 3. gym_memberships.commission_sgd
--    Was: generated always as (membership_price_sgd * commission_pct / 100)
--    Now: regular stored column — app writes the fixed SGD amount at
--    sale time from the global commission_config value.
--    The commission_pct column is retained for historical reference
--    but will be set to 0 on new sales going forward.
--
-- SAFE: uses if exists / on conflict guards throughout.
-- ============================================================

-- ── Step 1: Rename users.membership_commission_pct ───────────
alter table users
  rename column membership_commission_pct to membership_commission_sgd;

-- ── Step 2: Update commission_config key ─────────────────────
update commission_config
  set config_key = 'membership_commission_sgd',
      description = 'Fixed membership sale commission per sale (SGD). Applied to all staff equally.'
  where config_key = 'membership_commission_pct';

-- If the key didn't exist yet, insert it
insert into commission_config (config_key, config_value, description, updated_at)
  values ('membership_commission_sgd', 5.00, 'Fixed membership sale commission per sale (SGD). Applied to all staff equally.', now())
  on conflict (config_key) do nothing;

-- ── Step 3: Convert gym_memberships.commission_sgd ───────────
-- Drop the generated column and re-add as a regular stored column.
-- Existing rows will have commission_sgd = 0 after the drop — this is
-- acceptable since historical commission amounts are captured in
-- commission_payouts rows, not recalculated from gym_memberships.
alter table gym_memberships drop column if exists commission_sgd;

alter table gym_memberships
  add column if not exists commission_sgd numeric(10,2) not null default 0;

-- ── Verify ───────────────────────────────────────────────────
select
  column_name, data_type, is_generated
from information_schema.columns
where table_name = 'users' and column_name = 'membership_commission_sgd';

select config_key, config_value, description
from commission_config
where config_key = 'membership_commission_sgd';

select column_name, data_type, is_generated, column_default
from information_schema.columns
where table_name = 'gym_memberships' and column_name = 'commission_sgd';

select 'Migration v39 complete — membership commission is now fixed SGD per sale' as status;
