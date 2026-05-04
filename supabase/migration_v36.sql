-- ============================================================
-- GymApp Migration v36
-- Update CPF bracket labels and set 2026 rates
-- Effective 1 Jan 2026 (CPF Board)
-- ============================================================
--
-- Bracket boundaries (age_from/age_to) stay the same —
-- they are already correct for whole-number age comparisons:
--   age_from=56 correctly captures "> 55" since getAge() returns
--   whole numbers (a person who has turned 56 has age=56).
--
-- What changes:
--   1. Labels updated to match CPF Board policy wording (> 55 not 56-60)
--   2. Rates set to 2026 values
--
-- Rates source:
--   https://www.cpf.gov.sg/service/article/what-are-the-changes-to-the-cpf-contribution-rates-for-senior-workers-from-1-january-2026
--
-- SAFE TO RE-RUN: uses update with where clause.
-- ============================================================

-- Bracket 1: <= 55 years old (37% total: 20% EE / 17% ER)
update cpf_age_brackets
set label = '55 & Below',
    employee_rate = 20.00,
    employer_rate = 17.00,
    effective_from = '2026-01-01',
    updated_at = now()
where age_from = 0 and age_to = 55;

-- Bracket 2: > 55 and <= 60 (34% total: 18% EE / 16% ER)
update cpf_age_brackets
set label = 'Above 55 to 60',
    employee_rate = 18.00,
    employer_rate = 16.00,
    effective_from = '2026-01-01',
    updated_at = now()
where age_from = 56 and age_to = 60;

-- Bracket 3: > 60 and <= 65 (25% total: 12.5% EE / 12.5% ER)
update cpf_age_brackets
set label = 'Above 60 to 65',
    employee_rate = 12.50,
    employer_rate = 12.50,
    effective_from = '2026-01-01',
    updated_at = now()
where age_from = 61 and age_to = 65;

-- Bracket 4: > 65 and <= 70 (16.5% total: 7.5% EE / 9% ER)
update cpf_age_brackets
set label = 'Above 65 to 70',
    employee_rate = 7.50,
    employer_rate = 9.00,
    effective_from = '2026-01-01',
    updated_at = now()
where age_from = 66 and age_to = 70;

-- Bracket 5: > 70 (12.5% total: 5% EE / 7.5% ER)
update cpf_age_brackets
set label = 'Above 70',
    employee_rate = 5.00,
    employer_rate = 7.50,
    effective_from = '2026-01-01',
    updated_at = now()
where age_from = 71 and age_to is null;

-- Verify
select age_from, age_to, label, employee_rate, employer_rate,
       employee_rate + employer_rate as total_rate, effective_from
from cpf_age_brackets
order by age_from;

select 'Migration v36 complete — 2026 CPF rates and labels applied' as status;
