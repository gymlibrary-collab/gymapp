-- ============================================================
-- GymApp Complete Database Schema
-- Run this entire file in Supabase SQL Editor
-- ============================================================

create extension if not exists "uuid-ossp";

-- ============================================================
-- GYMS
-- ============================================================
create table gyms (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  address text,
  phone text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ============================================================
-- USERS (Admin, Manager, Trainer — linked to Supabase Auth)
-- ============================================================
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  phone text,
  role text not null check (role in ('admin', 'manager', 'trainer')),
  is_active boolean default true,
  commission_signup_pct numeric(5,2) default 10.00,
  commission_session_pct numeric(5,2) default 15.00,
  created_at timestamptz default now()
);

-- ============================================================
-- TRAINER <-> GYM ASSIGNMENTS
-- ============================================================
create table trainer_gyms (
  id uuid primary key default uuid_generate_v4(),
  trainer_id uuid references users(id) on delete cascade,
  gym_id uuid references gyms(id) on delete cascade,
  is_primary boolean default true,
  assigned_at timestamptz default now(),
  unique(trainer_id, gym_id)
);

-- ============================================================
-- PACKAGE TEMPLATES (created by Admin)
-- ============================================================
create table package_templates (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  total_sessions int not null,
  default_price_sgd numeric(10,2) not null,
  is_active boolean default true,
  created_by uuid references users(id),
  created_at timestamptz default now()
);

-- ============================================================
-- CLIENTS (created by Trainers)
-- ============================================================
create table clients (
  id uuid primary key default uuid_generate_v4(),
  gym_id uuid references gyms(id) on delete cascade,
  trainer_id uuid references users(id) on delete set null,
  full_name text not null,
  phone text not null,
  email text,
  date_of_birth date,
  gender text check (gender in ('male', 'female', 'other', 'prefer_not_to_say')),
  health_notes text,
  status text not null default 'active' check (status in ('active', 'inactive', 'lost')),
  created_at timestamptz default now()
);

-- ============================================================
-- CLIENT PACKAGES (trainer assigns template to client)
-- ============================================================
create table packages (
  id uuid primary key default uuid_generate_v4(),
  template_id uuid references package_templates(id),
  client_id uuid references clients(id) on delete cascade,
  trainer_id uuid references users(id) on delete set null,
  gym_id uuid references gyms(id) on delete cascade,
  package_name text not null,
  total_sessions int not null,
  sessions_used int not null default 0,
  total_price_sgd numeric(10,2) not null,
  price_per_session_sgd numeric(10,2) generated always as (total_price_sgd / total_sessions) stored,
  start_date date not null,
  end_date date,
  status text not null default 'active' check (status in ('active', 'completed', 'expired', 'cancelled')),
  signup_commission_pct numeric(5,2) not null,
  signup_commission_sgd numeric(10,2) generated always as (total_price_sgd * signup_commission_pct / 100) stored,
  session_commission_pct numeric(5,2) not null,
  signup_commission_paid boolean default false,
  created_at timestamptz default now()
);

-- ============================================================
-- SESSIONS (scheduled by Trainer, completed by Manager)
-- ============================================================
create table sessions (
  id uuid primary key default uuid_generate_v4(),
  package_id uuid references packages(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  trainer_id uuid references users(id) on delete set null,
  gym_id uuid references gyms(id) on delete cascade,
  scheduled_at timestamptz not null,
  duration_minutes int default 60,
  location text,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled', 'no_show')),
  performance_notes text,
  session_commission_pct numeric(5,2),
  session_commission_sgd numeric(10,2),
  commission_paid boolean default false,
  marked_complete_by uuid references users(id),
  marked_complete_at timestamptz,
  reminder_24h_sent boolean default false,
  reminder_24h_sent_at timestamptz,
  created_at timestamptz default now()
);

-- ============================================================
-- MONTHLY COMMISSION PAYOUTS
-- ============================================================
create table commission_payouts (
  id uuid primary key default uuid_generate_v4(),
  trainer_id uuid references users(id) on delete cascade,
  gym_id uuid references gyms(id) on delete cascade,
  month int not null check (month between 1 and 12),
  year int not null,
  signup_commissions_sgd numeric(10,2) default 0,
  session_commissions_sgd numeric(10,2) default 0,
  total_commission_sgd numeric(10,2) default 0,
  sessions_conducted int default 0,
  new_clients int default 0,
  status text default 'pending' check (status in ('pending', 'approved', 'paid')),
  approved_by uuid references users(id),
  approved_at timestamptz,
  paid_at timestamptz,
  generated_at timestamptz default now(),
  unique(trainer_id, gym_id, month, year)
);

-- ============================================================
-- WHATSAPP LOG
-- ============================================================
create table whatsapp_logs (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references sessions(id) on delete cascade,
  recipient_type text check (recipient_type in ('trainer', 'client')),
  recipient_phone text not null,
  message text not null,
  status text default 'sent' check (status in ('sent', 'failed', 'pending')),
  twilio_sid text,
  sent_at timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table gyms enable row level security;
alter table users enable row level security;
alter table trainer_gyms enable row level security;
alter table package_templates enable row level security;
alter table clients enable row level security;
alter table packages enable row level security;
alter table sessions enable row level security;
alter table commission_payouts enable row level security;
alter table whatsapp_logs enable row level security;

create or replace function get_user_role()
returns text as $$
  select role from users where id = auth.uid();
$$ language sql security definer;

-- GYMS
create policy "gyms_read" on gyms for select using (auth.uid() is not null);
create policy "gyms_admin_write" on gyms for all using (get_user_role() = 'admin');

-- USERS
create policy "users_read" on users for select using (
  get_user_role() in ('admin', 'manager') or id = auth.uid()
);
create policy "users_admin_manager_insert" on users for insert with check (
  get_user_role() in ('admin', 'manager')
);
create policy "users_update_own" on users for update using (id = auth.uid());
create policy "users_admin_update_all" on users for update using (get_user_role() = 'admin');

-- PACKAGE TEMPLATES
create policy "templates_read" on package_templates for select using (auth.uid() is not null);
create policy "templates_admin_write" on package_templates for all using (get_user_role() = 'admin');

-- CLIENTS
create policy "clients_read" on clients for select using (
  get_user_role() in ('admin', 'manager') or trainer_id = auth.uid()
);
create policy "clients_trainer_insert" on clients for insert with check (
  get_user_role() = 'trainer' and trainer_id = auth.uid()
);
create policy "clients_update" on clients for update using (
  get_user_role() in ('admin', 'manager') or trainer_id = auth.uid()
);

-- PACKAGES
create policy "packages_read" on packages for select using (
  get_user_role() in ('admin', 'manager') or trainer_id = auth.uid()
);
create policy "packages_trainer_insert" on packages for insert with check (
  get_user_role() = 'trainer' and trainer_id = auth.uid()
);
create policy "packages_admin_update" on packages for update using (
  get_user_role() in ('admin', 'manager')
);

-- SESSIONS
create policy "sessions_read" on sessions for select using (
  get_user_role() in ('admin', 'manager') or trainer_id = auth.uid()
);
create policy "sessions_trainer_insert" on sessions for insert with check (
  get_user_role() = 'trainer' and trainer_id = auth.uid()
);
create policy "sessions_update" on sessions for update using (
  get_user_role() in ('admin', 'manager') or trainer_id = auth.uid()
);

-- PAYOUTS
create policy "payouts_manager_admin" on commission_payouts for all using (
  get_user_role() in ('admin', 'manager')
);
create policy "payouts_trainer_read" on commission_payouts for select using (
  trainer_id = auth.uid()
);

-- WHATSAPP LOGS
create policy "whatsapp_admin_manager" on whatsapp_logs for all using (
  get_user_role() in ('admin', 'manager')
);

-- ============================================================
-- SEED DATA
-- ============================================================
insert into gyms (name, address, phone) values
  ('FitZone Orchard', '391 Orchard Road, #B1-01, Singapore 238872', '+65 6123 4567'),
  ('FitZone Tampines', '4 Tampines Central 5, #03-01, Singapore 529510', '+65 6234 5678');
