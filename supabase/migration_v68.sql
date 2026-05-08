-- =============================================================================
-- migration_v68.sql
--
-- RLS optimisations — no functional changes, policy behaviour unchanged.
--
--   1. Drop trainer_gyms_trainer_read — fully redundant with trainer_gyms_read
--      which already covers trainers with correct role scoping.
--      trainer_gyms_trainer_read had no role check (weaker policy).
--
--   2. Rename gyms_biz_ops_write → gyms_biz_ops_all — naming only.
--      The policy grants ALL operations, not just write.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Drop redundant trainer_gyms_trainer_read
--    trainer_gyms_read already includes:
--      (get_user_role() = 'trainer') AND (trainer_id = auth.uid())
--    The separate trainer_gyms_trainer_read adds nothing and lacks a role check.
-- -----------------------------------------------------------------------------
drop policy if exists "trainer_gyms_trainer_read" on trainer_gyms;


-- -----------------------------------------------------------------------------
-- 2. Rename gyms_biz_ops_write → gyms_biz_ops_all
-- -----------------------------------------------------------------------------
drop policy if exists "gyms_biz_ops_write" on gyms;

create policy "gyms_biz_ops_all" on gyms
  for all
  using (get_user_role() = 'business_ops')
  with check (get_user_role() = 'business_ops');
