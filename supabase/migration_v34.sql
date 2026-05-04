-- ============================================================
-- GymApp Migration v34
-- Update CPF age brackets to correct Singapore boundaries
-- ============================================================
--
-- CONTEXT:
-- Previous brackets had incorrect boundary ages (e.g. 55-60 overlap).
-- Correct Singapore CPF Board age brackets are:
--   1. Up to and including 55   (age_from=0,  age_to=55)
--   2. 56 to 60                 (age_from=56, age_to=60)
--   3. 61 to 65                 (age_from=61, age_to=65)
--   4. 66 to 70                 (age_from=66, age_to=70)
--   5. Above 70                 (age_from=71, age_to=null)
--
-- Rates are set to 0.00 as placeholders — update via the
-- CPF Configuration page in the Business Operations portal
-- after running this migration.
--
-- WARNING: This deletes all existing cpf_age_brackets rows
-- for the next year and re-inserts with correct boundaries.
-- Historical payslips are not affected (rates are stored on
-- the payslip row at generation time, not read from this table
-- retroactively).
-- ============================================================

-- Step 1: Remove existing brackets
delete from cpf_age_brackets;

-- Step 2: Insert correct brackets with placeholder rates
-- ⚠️ UPDATE RATES via Business Operations → CPF Configuration before running payroll
insert into cpf_age_brackets (age_from, age_to, label, employee_rate, employer_rate, effective_from) values
  (0,    55,   'Up to 55',  0.00, 0.00, current_date),
  (56,   60,   '56 to 60',  0.00, 0.00, current_date),
  (61,   65,   '61 to 65',  0.00, 0.00, current_date),
  (66,   70,   '66 to 70',  0.00, 0.00, current_date),
  (71,   null, 'Above 70',  0.00, 0.00, current_date);

-- Verify
select age_from, age_to, label, employee_rate, employer_rate, effective_from
from cpf_age_brackets
order by age_from;

select 'Migration v34 complete — update rates via CPF Configuration before running payroll' as status;
