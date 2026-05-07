-- ============================================================
-- GymApp Migration v64
-- WhatsApp templates:
--   1. Add recipient_type, recipient_scope, trigger_description,
--      created_by_biz_ops columns
--   2. Standardise all existing template labels
--   3. Set recipient metadata on existing templates
-- ============================================================

alter table whatsapp_templates
  add column if not exists recipient_type text,
  add column if not exists recipient_scope text check (recipient_scope in ('individual', 'group')),
  add column if not exists trigger_description text,
  add column if not exists created_by_biz_ops boolean not null default false,
  add column if not exists send_pattern text check (send_pattern in ('event_triggered','scheduled_loop','manual_trigger'));

-- Standardise labels (stable notification_type keys)
update whatsapp_templates set label = 'Session reminder — to trainer and member'   where notification_type = 'pt_reminder_24h';
update whatsapp_templates set label = 'Session reminder — to trainer'              where notification_type = 'pt_reminder_trainer_24h';
update whatsapp_templates set label = 'Session reminder — to member'               where notification_type = 'pt_reminder_client_24h';
update whatsapp_templates set label = 'Roster shift reminder — to staff member'    where notification_type = 'roster_reminder_24h';
update whatsapp_templates set label = 'Session notes submitted — to manager'       where notification_type = 'manager_note_alert';
update whatsapp_templates set label = 'Session completed — to member'              where notification_type = 'session_note_member_confirm';
update whatsapp_templates set label = 'Leave approved — to staff member'           where notification_type = 'leave_approved';
update whatsapp_templates set label = 'Leave rejected — to staff member'           where notification_type = 'leave_rejected';
update whatsapp_templates set label = 'Leave submitted — to manager'               where notification_type = 'leave_submitted';
update whatsapp_templates set label = 'Membership sale submitted — to manager'     where notification_type = 'membership_sale_submitted';
update whatsapp_templates set label = 'PT package sale submitted — to manager'     where notification_type = 'pt_package_submitted';
update whatsapp_templates set label = 'Birthday greeting — to member'              where notification_type = 'birthday_member';
update whatsapp_templates set label = 'Leave escalated — to Biz Ops'              where notification_type = 'escalation_leave';
update whatsapp_templates set label = 'Membership sale escalated — to Biz Ops'    where notification_type = 'escalation_membership';
update whatsapp_templates set label = 'PT package sale escalated — to Biz Ops'    where notification_type = 'escalation_pt_package';
update whatsapp_templates set label = 'PT session notes escalated — to Biz Ops'   where notification_type = 'escalation_pt_session';

-- Set recipient metadata on existing templates
update whatsapp_templates set recipient_type = 'individual_trainer', recipient_scope = 'individual' where notification_type in ('pt_reminder_24h','pt_reminder_trainer_24h');
update whatsapp_templates set recipient_type = 'individual_member',  recipient_scope = 'individual' where notification_type in ('pt_reminder_client_24h','session_note_member_confirm','birthday_member');
update whatsapp_templates set recipient_type = 'individual_manager', recipient_scope = 'individual' where notification_type in ('manager_note_alert','leave_submitted','membership_sale_submitted','pt_package_submitted');
update whatsapp_templates set recipient_type = 'individual_staff',   recipient_scope = 'individual' where notification_type in ('leave_approved','leave_rejected','roster_reminder_24h');
update whatsapp_templates set recipient_type = 'individual_biz_ops', recipient_scope = 'individual' where notification_type in ('escalation_leave','escalation_membership','escalation_pt_package','escalation_pt_session');

-- Standardise whatsapp_notifications_config labels too
update whatsapp_notifications_config set label = 'Session reminder — to trainer'             where id = 'pt_reminder_trainer_24h';
update whatsapp_notifications_config set label = 'Session reminder — to member'              where id = 'pt_reminder_client_24h';
update whatsapp_notifications_config set label = 'Session notes submitted — to manager'      where id = 'manager_note_alert';
update whatsapp_notifications_config set label = 'Session completed — to member'             where id = 'session_note_member_confirm';
update whatsapp_notifications_config set label = 'Leave approved — to staff member'          where id = 'leave_approved';
update whatsapp_notifications_config set label = 'Leave rejected — to staff member'          where id = 'leave_rejected';
update whatsapp_notifications_config set label = 'Leave submitted — to manager'              where id = 'leave_submitted';
update whatsapp_notifications_config set label = 'Membership sale submitted — to manager'    where id = 'membership_sale_submitted';
update whatsapp_notifications_config set label = 'PT package sale submitted — to manager'    where id = 'pt_package_submitted';
update whatsapp_notifications_config set label = 'Birthday greeting — to member'             where id = 'birthday_member';
update whatsapp_notifications_config set label = 'Leave escalated — to Biz Ops'             where id = 'escalation_leave';
update whatsapp_notifications_config set label = 'Membership sale escalated — to Biz Ops'   where id = 'escalation_membership';
update whatsapp_notifications_config set label = 'PT package sale escalated — to Biz Ops'   where id = 'escalation_pt_package';
update whatsapp_notifications_config set label = 'PT session notes escalated — to Biz Ops'  where id = 'escalation_pt_session';

select 'Migration v64 complete' as status;
