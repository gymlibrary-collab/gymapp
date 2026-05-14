-- ============================================================
-- Migration v85: Fix trainer_gyms_read using SECURITY DEFINER
--
-- PROBLEM:
--   Current policy restricts managers to gym_id = get_manager_gym_id()
--   only — they can't see all trainer_gyms rows for part-timers
--   assigned to multiple gyms. Previous fix (v79) caused infinite
--   recursion via self-referencing subquery.
--
-- SOLUTION:
--   Use a SECURITY DEFINER function to break the recursion.
--   The function reads trainer_gyms as its owner (bypasses RLS
--   internally) and returns trainer_ids for a given gym.
--   This allows managers to see ALL trainer_gyms rows for any
--   staff member assigned to their gym.
--
--   Also adds trainer_id = auth.uid() for all roles (own rows)
--   which allows part-timers to read their own assignments
--   directly from the client — eliminating API round-trips.
--
-- SECURITY:
--   - Read-only, no write access changes
--   - get_gym_staff_ids only returns trainer_id values
--   - No sensitive data exposed
-- ============================================================

-- 1. Create SECURITY DEFINER function to safely get staff IDs for a gym
CREATE OR REPLACE FUNCTION get_gym_staff_ids(p_gym_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT trainer_id FROM trainer_gyms WHERE gym_id = p_gym_id
$$;

-- 2. Replace trainer_gyms_read with non-recursive policy
DROP POLICY IF EXISTS "trainer_gyms_read" ON trainer_gyms;

CREATE POLICY "trainer_gyms_read" ON trainer_gyms
  FOR SELECT USING (
    -- Admin: full access
    get_user_role() = 'admin'
    -- Biz Ops: full access
    OR get_user_role() = 'business_ops'
    -- Any authenticated user: own rows (covers part-timers, trainers, all roles)
    OR trainer_id = auth.uid()
    -- Manager: all rows for staff in their gym (uses SECURITY DEFINER to avoid recursion)
    OR (
      get_user_role() = 'manager'
      AND trainer_id = ANY(SELECT get_gym_staff_ids(get_manager_gym_id()))
    )
    -- Full-time staff: rows for their assigned gym
    OR (
      get_user_role() = 'staff'
      AND gym_id = (SELECT manager_gym_id FROM users WHERE id = auth.uid())
    )
  );

-- 3. Verify
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'trainer_gyms'
ORDER BY policyname;
