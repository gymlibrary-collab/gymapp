-- ============================================================
-- GymApp Migration v63
-- whatsapp_notifications_config: per-touchpoint enable/disable
-- All disabled by default — Biz Ops enables each one manually
-- ============================================================

create table if not exists whatsapp_notifications_config (
  id text primary key,                    -- notification_type key
  label text not null,                    -- human-readable name
  description text not null,             -- who gets it and when
  recipient text not null,               -- 'staff' | 'manager' | 'member' | 'biz_ops' | 'trainer' | 'client'
  category text not null,               -- grouping: 'sessions' | 'leave' | 'sales' | 'escalation' | 'member'
  is_enabled boolean not null default false,
  updated_at timestamptz default now(),
  updated_by uuid references users(id)
);

-- Seed all 14 touchpoints — all disabled by default
insert into whatsapp_notifications_config (id, label, description, recipient, category) values
  ('pt_reminder_trainer_24h',    'PT session reminder — to trainer',             'Sent to trainer 24h before a scheduled PT session',                          'trainer',   'sessions'),
  ('pt_reminder_client_24h',     'PT session reminder — to member',              'Sent to member 24h before a scheduled PT session',                           'client',    'sessions'),
  ('manager_note_alert',         'Session notes submitted — to manager',         'Sent to manager when trainer submits PT session notes for confirmation',       'manager',   'sessions'),
  ('session_note_member_confirm','Session completed — to member',                'Sent to member after trainer submits session notes confirming session done',   'member',    'sessions'),
  ('leave_submitted',            'Leave application submitted — to manager',     'Sent to manager when a staff member submits a leave application',             'manager',   'leave'),
  ('leave_approved',             'Leave approved — to staff',                    'Sent to staff when their leave application is approved',                      'staff',     'leave'),
  ('leave_rejected',             'Leave rejected — to staff',                    'Sent to staff when their leave application is rejected',                      'staff',     'leave'),
  ('membership_sale_submitted',  'Membership sale submitted — to manager',       'Sent to manager when a membership sale is logged and awaiting confirmation',   'manager',   'sales'),
  ('pt_package_submitted',       'PT package sale submitted — to manager',       'Sent to manager when a PT package sale is logged and awaiting confirmation',   'manager',   'sales'),
  ('birthday_member',            'Birthday greeting — to member',                'Sent to member on their birthday',                                            'member',    'member'),
  ('escalation_leave',           'Leave escalation — to Biz Ops',               'Sent to Biz Ops when a leave application escalates without manager action',    'biz_ops',   'escalation'),
  ('escalation_membership',      'Membership sale escalation — to Biz Ops',     'Sent to Biz Ops when a membership sale escalates without manager action',      'biz_ops',   'escalation'),
  ('escalation_pt_package',      'PT package sale escalation — to Biz Ops',     'Sent to Biz Ops when a PT package sale escalates without manager action',     'biz_ops',   'escalation'),
  ('escalation_pt_session',      'PT session escalation — to Biz Ops',          'Sent to Biz Ops when PT session notes escalate without manager action',       'biz_ops',   'escalation')
on conflict (id) do nothing;

-- RLS
alter table whatsapp_notifications_config enable row level security;

create policy "wa_notif_config_read" on whatsapp_notifications_config
  for select using (auth.uid() is not null);

create policy "wa_notif_config_write" on whatsapp_notifications_config
  for all using (get_user_role() in ('admin', 'business_ops'));

-- Extend whatsapp_queue notification_type check to include new types
alter table whatsapp_queue
  drop constraint if exists whatsapp_queue_notification_type_check;

alter table whatsapp_queue
  add constraint whatsapp_queue_notification_type_check
  check (notification_type in (
    'pt_reminder_24h', 'pt_reminder_trainer_24h', 'pt_reminder_client_24h',
    'roster_reminder_24h', 'manager_note_alert', 'session_note_member_confirm',
    'leave_submitted', 'leave_approved', 'leave_rejected',
    'membership_sale_submitted', 'pt_package_submitted',
    'birthday_member',
    'escalation_leave', 'escalation_membership',
    'escalation_pt_package', 'escalation_pt_session'
  ));

-- Seed two new WhatsApp templates
insert into whatsapp_templates (notification_type, label, template, available_placeholders, is_active)
values
  (
    'session_note_member_confirm',
    'Session completed — member confirmation',
    'Hi {{member_name}}, your PT session with {{trainer_name}} at {{gym_name}} on {{session_date}} at {{session_time}} has been completed and recorded. See you next time!',
    '[{"key":"member_name","label":"Member name","description":"Full name of the member"},{"key":"trainer_name","label":"Trainer name","description":"Full name of the trainer"},{"key":"gym_name","label":"Gym name","description":"Name of the gym outlet"},{"key":"session_date","label":"Session date","description":"Date of the session (e.g. 15 Jan 2026)"},{"key":"session_time","label":"Session time","description":"Time of the session (e.g. 10:00 AM)"}]',
    false
  ),
  (
    'birthday_member',
    'Birthday greeting — member',
    'Happy Birthday {{member_name}}! Wishing you a wonderful {{age}}th birthday. The team at {{gym_name}} is grateful to have you with us. Keep up the great work!',
    '[{"key":"member_name","label":"Member name","description":"Full name of the member"},{"key":"gym_name","label":"Gym name","description":"Name of the gym outlet"},{"key":"age","label":"Age","description":"Member age turning today"}]',
    false
  )
on conflict (notification_type) do nothing;

select 'Migration v63 complete' as status;
