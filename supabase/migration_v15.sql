-- ============================================================
-- GymApp Migration v15
-- Adds gym size/date fields and package effective dates
-- Run in Supabase SQL Editor
-- ============================================================

-- Gym club enhancements
alter table gyms
  add column if not exists size_sqft numeric(10,2),
  add column if not exists date_opened date;

-- Package template enhancements
alter table package_templates
  add column if not exists effective_from date,
  add column if not exists validity_days int default 365,
  add column if not exists is_archived boolean default false,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references users(id);

-- Set existing packages effective_from to today if null
update package_templates
  set effective_from = current_date
  where effective_from is null;

-- Admin can now read gyms (for gym management)
-- Drop existing admin gym policy if any and recreate
drop policy if exists "gyms_admin_write" on gyms;
drop policy if exists "gyms_admin_all" on gyms;

create policy "gyms_admin_all" on gyms
  for all using (get_user_role() = 'admin');

-- Admin can read users table for dashboard stats (limited)
-- This is read-only for counting purposes
drop policy if exists "users_admin_full" on users;

create policy "users_admin_full" on users
  for all using (get_user_role() = 'admin');

-- Package templates: admin can manage, others read
drop policy if exists "templates_admin_write" on package_templates;
drop policy if exists "templates_admin_all" on package_templates;

create policy "templates_admin_all" on package_templates
  for all using (get_user_role() in ('admin', 'business_ops'));

create policy "templates_read_all" on package_templates
  for select using (auth.uid() is not null);

select 'Migration v15 complete' as status;
