-- ============================================================
-- GymApp Migration v62
-- commission_payouts: add CPF fields for AW treatment
-- Commission is Additional Wages (AW) under Singapore CPF rules
-- net_commission_sgd derived from source columns directly
-- (cannot reference generated column total_commission_sgd)
-- ============================================================

alter table commission_payouts
  add column if not exists is_cpf_liable boolean not null default true,
  add column if not exists employee_cpf_rate numeric(5,2) not null default 0,
  add column if not exists employer_cpf_rate numeric(5,2) not null default 0,
  add column if not exists aw_subject_to_cpf numeric(12,2) not null default 0,
  add column if not exists employee_cpf_amount numeric(12,2) not null default 0,
  add column if not exists employer_cpf_amount numeric(12,2) not null default 0,
  add column if not exists net_commission_sgd numeric(12,2)
    generated always as (
      pt_signup_commission_sgd + pt_session_commission_sgd + membership_commission_sgd
      - employee_cpf_amount
    ) stored;

select 'Migration v62 complete' as status;
