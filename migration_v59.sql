-- ============================================================
-- GymApp Migration v59
-- Membership expiry action flow
-- ============================================================

-- ── gym_memberships additions ────────────────────────────────
alter table gym_memberships
  add column if not exists membership_actioned boolean default false,
  add column if not exists escalated_to_biz_ops boolean default false,
  add column if not exists escalated_at timestamptz;

-- ── non_renewal_records table ────────────────────────────────
create table if not exists non_renewal_records (
  id uuid primary key default uuid_generate_v4(),
  member_id uuid references members(id) on delete cascade,
  gym_membership_id uuid references gym_memberships(id) on delete set null,
  gym_id uuid references gyms(id) on delete set null,
  reason text not null check (reason in (
    'Relocating',
    'Financial',
    'Health',
    'Schedule',
    'Switched gym',
    'Travel',
    'Completed fitness goals',
    'Dissatisfied with service',
    'Temporary pause',
    'Other'
  )),
  reason_other text, -- only populated when reason = 'Other'
  recorded_by uuid references users(id) on delete set null,
  recorded_at timestamptz default now() not null
);

create index if not exists non_renewal_records_member
  on non_renewal_records (member_id);
create index if not exists non_renewal_records_gym
  on non_renewal_records (gym_id, recorded_at desc);

-- RLS
alter table non_renewal_records enable row level security;

create policy "non_renewal_manager_read" on non_renewal_records
  for select using (get_user_role() in ('manager', 'business_ops', 'admin'));

create policy "non_renewal_manager_insert" on non_renewal_records
  for insert with check (get_user_role() = 'manager');

-- ── Index for escalation check ───────────────────────────────
create index if not exists gym_memberships_expiry_action
  on gym_memberships (gym_id, status, sale_status, end_date, membership_actioned, escalated_to_biz_ops);

select 'Migration v59 complete' as status;
