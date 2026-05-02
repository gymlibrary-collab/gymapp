-- ============================================================
-- GymApp Migration v12
-- Allows managers to also act as trainers
-- Adds is_also_trainer flag and trainer gym assignments for managers
-- Run in Supabase SQL Editor
-- ============================================================

-- Add flag to mark a manager as also being a trainer
alter table users
  add column if not exists is_also_trainer boolean default false;

-- Manager-trainers need commission rates already on the table (already exist)
-- Manager-trainers will appear in trainer_gyms linked to their manager_gym_id

-- Update RLS: manager-trainers can insert clients under their own trainer_id
drop policy if exists "clients_trainer_insert" on clients;
create policy "clients_trainer_insert" on clients
  for insert with check (
    trainer_id = auth.uid()
    and (
      get_user_role() = 'trainer'
      or (get_user_role() = 'manager' and (select is_also_trainer from users where id = auth.uid()))
    )
  );

-- Manager-trainers can insert sessions
drop policy if exists "sessions_trainer_insert" on sessions;
create policy "sessions_trainer_insert" on sessions
  for insert with check (
    trainer_id = auth.uid()
    and (
      get_user_role() = 'trainer'
      or (get_user_role() = 'manager' and (select is_also_trainer from users where id = auth.uid()))
    )
  );

-- Manager-trainers can insert packages
drop policy if exists "packages_trainer_insert" on packages;
create policy "packages_trainer_insert" on packages
  for insert with check (
    trainer_id = auth.uid()
    and (
      get_user_role() = 'trainer'
      or (get_user_role() = 'manager' and (select is_also_trainer from users where id = auth.uid()))
    )
  );

select 'Migration v12 complete' as status;
