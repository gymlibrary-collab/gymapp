-- ============================================================
-- GymApp Migration v9
-- Adds app_name to app_settings
-- Run in Supabase SQL Editor
-- ============================================================

alter table app_settings
  add column if not exists app_name text default 'GymApp';

update app_settings set app_name = 'GymApp' where id = 'global';

select 'Migration v9 complete' as status;
