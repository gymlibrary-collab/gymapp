-- ============================================================
-- GymApp Migration v35
-- Payslips: replace generated CPF columns with stored columns
-- Add CPF audit columns, December adjustment columns, config seed
-- ============================================================
--
-- CONTEXT:
-- employee_cpf_amount, employer_cpf_amount, net_salary, total_employer_cost
-- were DB-generated columns computed as (basic_salary + bonus_amount) * rate / 100
-- This was wrong — no OW ceiling ($8,000), no AW/OW distinction,
-- wrong rounding rules. The app now calculates and writes all values.
--
-- EXISTING PAYSLIPS:
-- Draft payslips will show $0 CPF after this — delete and regenerate them.
-- Approved/paid payslips: net_salary set from old formula as best-effort.
-- Do not regenerate approved/paid payslips — the PDF is the source of truth.
--
-- SAFE TO RE-RUN: uses drop column + add column pattern.
-- ============================================================

-- Step 1: Drop generated CPF columns
alter table payslips drop column if exists total_employer_cost;
alter table payslips drop column if exists net_salary;
alter table payslips drop column if exists employer_cpf_amount;
alter table payslips drop column if exists employee_cpf_amount;

-- Step 2: Re-add as regular stored columns (app writes these explicitly)
alter table payslips
  add column if not exists employee_cpf_amount  numeric(12,2) not null default 0,
  add column if not exists employer_cpf_amount  numeric(12,2) not null default 0,
  add column if not exists net_salary           numeric(12,2) not null default 0,
  add column if not exists total_employer_cost  numeric(12,2) not null default 0;

-- Step 3: CPF calculation audit trail columns
alter table payslips
  add column if not exists capped_ow            numeric(12,2) default 0,
  add column if not exists aw_subject_to_cpf    numeric(12,2) default 0,
  add column if not exists employee_cpf_aw      numeric(12,2) default 0,
  add column if not exists employer_cpf_aw      numeric(12,2) default 0,
  add column if not exists ow_ceiling_used      numeric(12,2) default 8000,
  add column if not exists annual_ceiling_used  numeric(12,2) default 102000,
  add column if not exists ytd_ow_before        numeric(12,2) default 0,
  add column if not exists ytd_aw_cpf_before    numeric(12,2) default 0,
  add column if not exists low_income_flag      boolean default false;

-- Step 4: December year-end CPF adjustment columns
alter table payslips
  add column if not exists cpf_adjustment_amount  numeric(12,2) default 0,
  add column if not exists cpf_adjustment_note    text;

-- Step 5: Seed CPF ceiling config into commission_config
insert into commission_config (config_key, config_value, description, updated_at)
values
  ('cpf_ow_ceiling',     8000,   'Monthly Ordinary Wage CPF ceiling (SGD). Effective 1 Jan 2026.', now()),
  ('cpf_annual_ceiling', 102000, 'Annual total wage CPF ceiling (OW + AW, SGD). Effective 1 Jan 2026.', now())
on conflict (config_key) do update
  set config_value = excluded.config_value,
      description  = excluded.description,
      updated_at   = now();

-- Step 6: Backfill net_salary on approved/paid payslips from gross_salary
-- (best-effort — these used the old formula, PDF is source of truth)
update payslips
set
  net_salary          = greatest(0, gross_salary),
  total_employer_cost = gross_salary
where status in ('approved', 'paid')
  and net_salary = 0;

-- Verify
select column_name, data_type
from information_schema.columns
where table_name = 'payslips'
  and column_name in (
    'employee_cpf_amount','employer_cpf_amount','net_salary',
    'total_employer_cost','capped_ow','aw_subject_to_cpf',
    'cpf_adjustment_amount','cpf_adjustment_note','low_income_flag'
  )
order by column_name;

select config_key, config_value
from commission_config
where config_key in ('cpf_ow_ceiling','cpf_annual_ceiling');

select 'Migration v35 complete. Delete all draft payslips and regenerate after deploying code.' as status;
