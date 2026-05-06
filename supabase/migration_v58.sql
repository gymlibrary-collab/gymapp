-- ============================================================
-- GymApp Migration v58
-- 48-hour escalation for PT package and session note acks
-- ============================================================

-- PT packages — escalation to Biz Ops after 48 hours
alter table packages
  add column if not exists escalated_to_biz_ops boolean default false,
  add column if not exists escalated_at timestamptz;

-- Sessions — escalation to Biz Ops after 48 hours
alter table sessions
  add column if not exists escalated_to_biz_ops boolean default false,
  add column if not exists escalated_at timestamptz;

-- Index for dashboard escalation check
create index if not exists packages_escalation
  on packages (trainer_id, manager_confirmed, escalated_to_biz_ops, created_at);

create index if not exists sessions_escalation
  on sessions (trainer_id, manager_confirmed, escalated_to_biz_ops, notes_submitted_at);

select 'Migration v58 complete — escalation columns added' as status;
