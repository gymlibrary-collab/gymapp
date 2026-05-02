-- ============================================================
-- GymApp Migration v14
-- Payroll infrastructure: salary, increments, bonuses, payslips
-- Run in Supabase SQL Editor
-- ============================================================

-- ── STAFF PAYROLL PROFILE ──────────────────────────────────
-- Sensitive payroll details per staff member
-- Only visible to business_ops role
create table if not exists staff_payroll (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade unique,
  is_cpf_liable boolean default true,
  current_salary numeric(12,2) default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── SALARY HISTORY ─────────────────────────────────────────
-- Tracks every salary change (joining rate, increments)
create table if not exists salary_history (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade,
  salary_amount numeric(12,2) not null,
  effective_from date not null,
  change_type text not null check (change_type in ('initial', 'increment', 'adjustment', 'promotion')),
  change_amount numeric(12,2),   -- positive = increase, negative = decrease
  notes text,
  created_by uuid references users(id),
  created_at timestamptz default now()
);

-- ── BONUS PAYOUTS ──────────────────────────────────────────
create table if not exists staff_bonuses (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade,
  bonus_type text not null check (bonus_type in ('performance', 'annual', 'discretionary', 'other')),
  amount numeric(12,2) not null,
  month int check (month between 1 and 12),
  year int not null,
  notes text,
  created_by uuid references users(id),
  created_at timestamptz default now()
);

-- ── PAYSLIPS ───────────────────────────────────────────────
create table if not exists payslips (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade,
  month int not null check (month between 1 and 12),
  year int not null,
  -- Salary components
  basic_salary numeric(12,2) not null default 0,
  bonus_amount numeric(12,2) not null default 0,
  gross_salary numeric(12,2) generated always as (basic_salary + bonus_amount) stored,
  -- CPF (if liable)
  is_cpf_liable boolean default true,
  employee_cpf_rate numeric(5,2) default 20.00,
  employer_cpf_rate numeric(5,2) default 17.00,
  employee_cpf_amount numeric(12,2) generated always as (
    case when is_cpf_liable then (basic_salary + bonus_amount) * employee_cpf_rate / 100 else 0 end
  ) stored,
  employer_cpf_amount numeric(12,2) generated always as (
    case when is_cpf_liable then (basic_salary + bonus_amount) * employer_cpf_rate / 100 else 0 end
  ) stored,
  -- Net pay
  net_salary numeric(12,2) generated always as (
    (basic_salary + bonus_amount) - (
      case when is_cpf_liable then (basic_salary + bonus_amount) * employee_cpf_rate / 100 else 0 end
    )
  ) stored,
  -- Total cost to employer
  total_employer_cost numeric(12,2) generated always as (
    (basic_salary + bonus_amount) + (
      case when is_cpf_liable then (basic_salary + bonus_amount) * employer_cpf_rate / 100 else 0 end
    )
  ) stored,
  -- Status
  status text not null default 'draft' check (status in ('draft', 'approved', 'paid')),
  approved_by uuid references users(id),
  approved_at timestamptz,
  paid_at timestamptz,
  notes text,
  generated_by uuid references users(id),
  generated_at timestamptz default now(),
  unique(user_id, month, year)
);

-- ── RLS ────────────────────────────────────────────────────
alter table staff_payroll enable row level security;
alter table salary_history enable row level security;
alter table staff_bonuses enable row level security;
alter table payslips enable row level security;

-- Only business_ops can see and manage payroll data
create policy "payroll_business_ops" on staff_payroll
  for all using (get_user_role() = 'business_ops');

create policy "salary_history_business_ops" on salary_history
  for all using (get_user_role() = 'business_ops');

create policy "bonuses_business_ops" on staff_bonuses
  for all using (get_user_role() = 'business_ops');

create policy "payslips_business_ops" on payslips
  for all using (get_user_role() = 'business_ops');

-- Staff can read their own payslips only
create policy "payslips_own_read" on payslips
  for select using (user_id = auth.uid());

-- Initialise payroll records for all existing staff
insert into staff_payroll (user_id, is_cpf_liable, current_salary)
select id, true, 0
from users
where is_archived = false
on conflict (user_id) do nothing;

select 'Migration v14 complete' as status;
