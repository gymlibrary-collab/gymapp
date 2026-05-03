-- ============================================================
-- GymApp Migration v22
-- Public holidays table, leave flow fixes
-- Run in Supabase SQL Editor after v21
-- ============================================================

-- ── Public holidays (Business Ops maintains per year) ───────
create table if not exists public_holidays (
  id uuid primary key default uuid_generate_v4(),
  holiday_date date not null unique,
  name text not null,
  year int not null generated always as (extract(year from holiday_date)::int) stored,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

-- Index for date lookups
create index if not exists idx_public_holidays_date on public_holidays(holiday_date);
create index if not exists idx_public_holidays_year on public_holidays(year);

-- RLS: all authenticated can read; biz ops manages
alter table public_holidays enable row level security;

create policy "holidays_read" on public_holidays
  for select using (auth.uid() is not null);

create policy "holidays_write" on public_holidays
  for all using (get_user_role() in ('business_ops', 'admin'));

-- Seed Singapore 2025 public holidays
insert into public_holidays (holiday_date, name) values
  ('2025-01-01', 'New Year''s Day'),
  ('2025-01-29', 'Chinese New Year'),
  ('2025-01-30', 'Chinese New Year (Day 2)'),
  ('2025-04-18', 'Good Friday'),
  ('2025-05-01', 'Labour Day'),
  ('2025-05-12', 'Vesak Day'),
  ('2025-06-07', 'Hari Raya Haji'),
  ('2025-08-09', 'National Day'),
  ('2025-10-20', 'Deepavali'),
  ('2025-12-25', 'Christmas Day')
on conflict (holiday_date) do nothing;

-- Seed Singapore 2026 public holidays
insert into public_holidays (holiday_date, name) values
  ('2026-01-01', 'New Year''s Day'),
  ('2026-02-17', 'Chinese New Year'),
  ('2026-02-18', 'Chinese New Year (Day 2)'),
  ('2026-04-03', 'Good Friday'),
  ('2026-05-01', 'Labour Day'),
  ('2026-05-31', 'Vesak Day'),
  ('2026-06-27', 'Hari Raya Haji'),
  ('2026-08-09', 'National Day'),
  ('2026-10-09', 'Deepavali'),
  ('2026-12-25', 'Christmas Day')
on conflict (holiday_date) do nothing;

select 'Migration v22 complete' as status;
