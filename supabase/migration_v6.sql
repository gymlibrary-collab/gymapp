-- ============================================================
-- GymApp Migration v6
-- Adds global logo settings for login and admin sidebar
-- Run in Supabase SQL Editor
-- ============================================================

-- Global app settings table (login logo, admin sidebar logo)
create table if not exists app_settings (
  id text primary key default 'global',
  login_logo_url text,
  admin_sidebar_logo_url text,
  updated_at timestamptz default now()
);

-- Insert default row
insert into app_settings (id) values ('global')
on conflict (id) do nothing;

-- RLS
alter table app_settings enable row level security;

create policy "app_settings_read_all" on app_settings
  for select using (auth.uid() is not null);

create policy "app_settings_admin_write" on app_settings
  for all using (get_user_role() = 'admin');

-- Storage policy for app logos
do $$
begin
  if not exists (
    select 1 from storage.buckets where id = 'app-logos'
  ) then
    insert into storage.buckets (id, name, public)
    values ('app-logos', 'app-logos', true);
  end if;
end $$;

create policy "app_logos_read_all" on storage.objects
  for select using (bucket_id = 'app-logos');

create policy "app_logos_admin_write" on storage.objects
  for insert with check (bucket_id = 'app-logos' and get_user_role() = 'admin');

create policy "app_logos_admin_update" on storage.objects
  for update using (bucket_id = 'app-logos' and get_user_role() = 'admin');

select 'Migration v6 complete' as status;
