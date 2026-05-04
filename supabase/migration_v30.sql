-- ============================================================
-- GymApp Migration v30
-- Fix users_manager_read RLS — include ops staff in manager's gym
-- ============================================================
--
-- CONTEXT:
-- The existing users_manager_read policy only allowed managers to
-- SELECT users with role='trainer' assigned to their gym via
-- trainer_gyms. This had two gaps:
--
--   1. Full-time ops staff (role='staff') assigned to the manager's
--      gym via users.manager_gym_id were invisible to the manager.
--
--   2. Part-time ops staff (role='staff', employment_type='part_time')
--      rostered at the gym via trainer_gyms were also invisible.
--
--   3. No explicit exclusion of admin and business_ops rows —
--      those were implicitly excluded by the trainer-only role check,
--      but the intent was not clear.
--
-- This migration replaces the policy with one that:
--   - Allows manager to see trainers in their gym (via trainer_gyms)
--   - Allows manager to see ops staff in their gym (via manager_gym_id
--     OR via trainer_gyms for part-timers)
--   - Explicitly excludes admin and business_ops rows
--   - Always allows a manager to see their own record
--
-- SAFE TO RE-RUN: drops the existing policy before recreating.
-- ============================================================

drop policy if exists "users_manager_read" on users;

create policy "users_manager_read" on users
  for select using (
    get_user_role() = 'manager'
    and (
      -- Manager can always see their own record
      id = auth.uid()
      or (
        -- Exclude admin and business_ops from manager visibility
        role not in ('admin', 'business_ops')
        and (
          -- Trainers and part-time ops staff assigned to this gym via trainer_gyms
          id in (
            select tg.trainer_id from trainer_gyms tg
            where tg.gym_id = get_manager_gym_id()
          )
          -- Full-time ops staff assigned to this gym via manager_gym_id
          or (role = 'staff' and manager_gym_id = get_manager_gym_id())
        )
      )
    )
  );

-- Verify: show the updated policy
select policyname, cmd, qual
from pg_policies
where tablename = 'users' and policyname = 'users_manager_read';

select 'Migration v30 complete — users_manager_read updated' as status;
