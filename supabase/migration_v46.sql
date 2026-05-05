-- ============================================================
-- GymApp Migration v46
-- Create payslip_deletions audit table
-- ============================================================
--
-- Records every deletion of an approved or paid payslip by an
-- admin. Provides an immutable audit trail accessible via the
-- admin portal without requiring direct database access.
-- ============================================================

create table if not exists payslip_deletions (
  id uuid primary key default uuid_generate_v4(),

  -- Snapshot of the deleted payslip (denormalised for audit integrity)
  payslip_id uuid, -- original payslip id (now deleted — no FK)
  user_id uuid references users(id) on delete set null,
  staff_name text not null,
  gym_id uuid references gyms(id) on delete set null,
  gym_name text,
  month integer not null check (month between 1 and 12),
  year integer not null,
  employment_type text,
  basic_salary numeric(10,2),
  bonus_amount numeric(10,2),
  gross_salary numeric(10,2),
  net_salary numeric(10,2),
  status_at_deletion text not null, -- 'approved' or 'paid'

  -- Audit fields
  deleted_by uuid references users(id) on delete set null,
  deleted_by_name text not null,
  deleted_at timestamptz default now() not null,
  reason text not null check (length(trim(reason)) >= 10)
);

-- Index for admin audit page queries
create index if not exists payslip_deletions_deleted_at
  on payslip_deletions (deleted_at desc);

create index if not exists payslip_deletions_user_id
  on payslip_deletions (user_id);

-- RLS: admin can read all, no one else can read
alter table payslip_deletions enable row level security;

create policy "payslip_deletions_admin_read" on payslip_deletions
  for select using (get_user_role() = 'admin');

create policy "payslip_deletions_admin_insert" on payslip_deletions
  for insert with check (get_user_role() = 'admin');

-- Verify
select 'Migration v46 complete — payslip_deletions audit table created' as status;
