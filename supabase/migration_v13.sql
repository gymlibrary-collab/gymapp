-- ============================================================
-- GymApp Migration v13
-- Adds staff profile fields and CPF rate history
-- Run in Supabase SQL Editor
-- ============================================================

-- Add staff profile fields
alter table users
  add column if not exists date_of_birth date,
  add column if not exists date_of_joining date,
  add column if not exists date_of_departure date,
  add column if not exists departure_reason text;

-- CPF contribution rate history table
-- Rates apply from effective_from until the next rate's effective_from
create table if not exists cpf_rates (
  id uuid primary key default uuid_generate_v4(),
  effective_from date not null,
  employee_rate numeric(5,2) not null,  -- % deducted from employee salary
  employer_rate numeric(5,2) not null,  -- % contributed by employer
  notes text,
  created_by uuid references users(id),
  created_at timestamptz default now()
);

-- Seed with current Singapore CPF rates (as of 2024, age 55 and below)
insert into cpf_rates (effective_from, employee_rate, employer_rate, notes)
values ('2024-01-01', 20.00, 17.00, 'Standard rates for employees aged 55 and below')
on conflict do nothing;

-- RLS
alter table cpf_rates enable row level security;

-- Business Ops and Admin can read
create policy "cpf_rates_read" on cpf_rates
  for select using (
    get_user_role() in ('admin', 'business_ops', 'manager')
  );

-- Only Business Ops can insert new rates
create policy "cpf_rates_business_ops_insert" on cpf_rates
  for insert with check (get_user_role() = 'business_ops');

-- Allow trainers to update their own member's session notes within 30 mins
-- (handled in application logic, not RLS)

select 'Migration v13 complete' as status;
