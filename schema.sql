-- ============================================================
-- GymApp Database Schema — Current Production State
-- Last updated: 16 May 2026
--
-- HOW TO USE:
-- 1. Run this entire file in Supabase SQL Editor on a fresh project
-- 2. Enable Google OAuth in Supabase Authentication settings
-- 3. Insert your first admin user manually via Supabase table editor
--
-- NOTE: This reflects the live production DB as of the date above.
-- Individual migration files (v1–v89) document historical evolution.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- CORE TABLES
-- ============================================================

CREATE TABLE app_settings (
  id text PRIMARY KEY DEFAULT 'global',
  app_name text DEFAULT 'GymApp',
  -- Logo URLs
  login_logo_url text,
  admin_sidebar_logo_url text,
  payslip_logo_url text,
  company_name text,
  -- Operational settings
  auto_logout_minutes integer DEFAULT 10,
  leave_reset_year integer,
  max_leave_carry_forward_days integer DEFAULT 0,
  fy_start_month integer DEFAULT 1,
  -- Escalation thresholds
  escalation_leave_hours integer DEFAULT 48,
  escalation_pt_package_hours integer DEFAULT 48,
  escalation_pt_session_hours integer DEFAULT 48,
  escalation_membership_sales_hours integer DEFAULT 48,
  escalation_membership_expiry_days integer DEFAULT 30,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE gyms (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  address text,
  phone text,
  logo_url text,
  size_sqft numeric(10,2),
  date_opened date,
  is_active boolean DEFAULT true,
  fy_start_month integer DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL UNIQUE,
  phone text,
  role text NOT NULL CHECK (role IN ('admin', 'manager', 'business_ops', 'trainer', 'staff')),
  is_active boolean DEFAULT true,
  is_archived boolean DEFAULT false,
  is_also_trainer boolean DEFAULT false,
  commission_signup_pct numeric(5,2) DEFAULT 10.00,
  commission_session_pct numeric(5,2) DEFAULT 15.00,
  membership_commission_sgd numeric(10,2) DEFAULT 0,
  manager_gym_id uuid REFERENCES gyms(id) ON DELETE SET NULL,
  employment_type text CHECK (employment_type IN ('full_time', 'part_time')),
  hourly_rate numeric(10,2),
  nric text,
  nationality text,
  address text,
  nickname text,
  date_of_birth date,
  date_of_joining date,
  date_of_departure date,
  departure_reason text,
  probation_end_date date,
  probation_passed_at timestamptz,
  leave_entitlement_days integer DEFAULT 14,
  leave_carry_forward_days integer DEFAULT 0,
  medical_leave_entitlement_days integer DEFAULT 14,
  hospitalisation_leave_entitlement_days integer DEFAULT 60,
  max_sessions_per_week integer,
  monthly_session_target integer,
  payslip_notif_seen_at timestamptz,
  commission_notif_seen_at timestamptz,
  archived_at timestamptz,
  archived_by uuid,
  offboarding_completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE trainer_gyms (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  trainer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  is_primary boolean DEFAULT true,
  assigned_at timestamptz DEFAULT now(),
  UNIQUE(trainer_id, gym_id)
);

-- ============================================================
-- MEMBERS
-- ============================================================

CREATE TABLE members (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text,
  email text,
  date_of_birth date,
  gender text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE membership_types (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  name text NOT NULL,
  duration_days integer NOT NULL,
  price_sgd numeric(10,2) NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE gym_memberships (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  membership_type_id uuid REFERENCES membership_types(id) ON DELETE SET NULL,
  membership_type_name text,
  sold_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  start_date date NOT NULL,
  end_date date,
  price_sgd numeric(10,2),
  commission_sgd numeric(10,2) DEFAULT 0,
  commission_paid boolean DEFAULT false,
  commission_payout_id uuid,
  status text DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
  sale_status text DEFAULT 'pending' CHECK (sale_status IN ('pending', 'confirmed', 'rejected')),
  membership_actioned boolean DEFAULT false,
  -- Escalation
  escalated_to_biz_ops boolean DEFAULT false,
  escalated_to_manager boolean DEFAULT false,
  escalated_at timestamptz,
  -- Confirmation/rejection
  confirmed_at timestamptz,
  confirmed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  rejected_at timestamptz,
  rejected_by uuid REFERENCES users(id) ON DELETE SET NULL,
  rejection_reason text,
  -- Cancellation
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES users(id) ON DELETE SET NULL,
  cancellation_reason text,
  cancellation_end_date date,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE membership_cancellation_requests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_membership_id uuid NOT NULL REFERENCES gym_memberships(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reason text,
  proposed_end_date date,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE non_renewal_records (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_membership_id uuid NOT NULL REFERENCES gym_memberships(id) ON DELETE CASCADE,
  member_id uuid REFERENCES members(id) ON DELETE CASCADE,
  gym_id uuid REFERENCES gyms(id) ON DELETE CASCADE,
  reason text,
  recorded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- PT PACKAGES & SESSIONS
-- ============================================================

CREATE TABLE package_templates (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  package_name text NOT NULL,
  total_sessions integer NOT NULL,
  price_sgd numeric(10,2) NOT NULL,
  validity_days integer DEFAULT 365,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE packages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  trainer_id uuid REFERENCES users(id) ON DELETE SET NULL,
  member_id uuid REFERENCES members(id) ON DELETE CASCADE,
  secondary_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  package_name text NOT NULL,
  total_sessions integer NOT NULL,
  sessions_used integer DEFAULT 0,
  total_price_sgd numeric(10,2),
  signup_commission_sgd numeric(10,2) DEFAULT 0,
  signup_commission_paid boolean DEFAULT false,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'expired')),
  start_date date,
  end_date_calculated date,
  manager_confirmed boolean DEFAULT false,
  confirmed_at timestamptz,
  confirmed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES users(id) ON DELETE SET NULL,
  cancellation_reason text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  trainer_id uuid REFERENCES users(id) ON DELETE SET NULL,
  member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  package_id uuid REFERENCES packages(id) ON DELETE SET NULL,
  attending_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  is_secondary_member boolean DEFAULT false,
  scheduled_at timestamptz,
  duration_minutes integer DEFAULT 60,
  location text,
  status text DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
  notes text,
  performance_notes text,
  notes_submitted_at timestamptz,
  session_commission_sgd numeric(10,2) DEFAULT 0,
  session_commission_pct numeric(5,2),
  commission_paid boolean DEFAULT false,
  manager_confirmed boolean DEFAULT false,
  confirmed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  confirmed_at timestamptz,
  marked_complete_at timestamptz,
  reminder_sent_at timestamptz,
  reminder_scheduled_at timestamptz,
  -- Escalation
  escalated_to_manager boolean DEFAULT false,
  escalated_at timestamptz,
  -- Renewal tracking
  renewal_status text CHECK (renewal_status IN ('renewing', 'not_renewing', 'undecided')),
  renewal_reason text,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- PAYROLL
-- ============================================================

CREATE TABLE payslips (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gym_id uuid REFERENCES gyms(id) ON DELETE SET NULL,
  month integer NOT NULL,
  year integer NOT NULL,
  employment_type text,
  total_hours numeric(10,2),
  hourly_rate numeric(10,2),
  basic_salary numeric(10,2),
  annual_salary_override numeric(10,2),
  bonus_amount numeric(10,2) DEFAULT 0,
  deduction_amount numeric(10,2) DEFAULT 0,
  deduction_reason text,
  gross_salary numeric(10,2),
  net_salary numeric(10,2),
  is_cpf_liable boolean DEFAULT false,
  employee_cpf_rate numeric(5,4),
  employer_cpf_rate numeric(5,4),
  aw_subject_to_cpf numeric(10,2),
  employee_cpf_amount numeric(10,2) DEFAULT 0,
  employer_cpf_amount numeric(10,2) DEFAULT 0,
  capped_ow numeric(10,2),
  ytd_ow numeric(10,2),
  low_income_flag boolean DEFAULT false,
  cpf_adjustment_note text,
  total_employer_cost numeric(10,2),
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid')),
  notes text,
  approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  paid_at timestamptz,
  generated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, gym_id, month, year)
);

CREATE TABLE payslip_deletions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  payslip_snapshot jsonb,
  deleted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  deletion_reason text,
  deleted_at timestamptz DEFAULT now()
);

CREATE TABLE staff_bonuses (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gym_id uuid REFERENCES gyms(id) ON DELETE SET NULL,
  month integer NOT NULL,
  year integer NOT NULL,
  amount numeric(10,2) NOT NULL,
  bonus_type text DEFAULT 'performance',
  notes text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE pending_deductions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gym_id uuid REFERENCES gyms(id) ON DELETE SET NULL,
  amount numeric(10,2) NOT NULL,
  reason text,
  applied_at timestamptz,
  applied_payslip_id uuid REFERENCES payslips(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE commission_payouts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gym_id uuid REFERENCES gyms(id) ON DELETE SET NULL,
  period_start date,
  period_end date,
  period_month integer,
  period_year integer,
  pt_signup_commission_sgd numeric(10,2) DEFAULT 0,
  pt_session_commission_sgd numeric(10,2) DEFAULT 0,
  membership_commission_sgd numeric(10,2) DEFAULT 0,
  total_commission_sgd numeric(10,2) DEFAULT 0,
  deduction_amount numeric(10,2) DEFAULT 0,
  deduction_reason text,
  net_commission_sgd numeric(10,2),
  is_cpf_liable boolean DEFAULT false,
  employee_cpf_rate numeric(5,4),
  employer_cpf_rate numeric(5,4),
  aw_subject_to_cpf numeric(10,2),
  employee_cpf_amount numeric(10,2) DEFAULT 0,
  employer_cpf_amount numeric(10,2) DEFAULT 0,
  low_income_flag boolean DEFAULT false,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid')),
  approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  paid_at timestamptz,
  generated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE cpf_age_brackets (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  year integer NOT NULL,
  label text NOT NULL,
  age_min integer NOT NULL,
  age_max integer,
  employee_rate numeric(5,4) NOT NULL,
  employer_rate numeric(5,4) NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE cpf_submissions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id uuid REFERENCES gyms(id) ON DELETE SET NULL,
  year integer NOT NULL,
  month integer,
  submission_type text,
  submitted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  submitted_at timestamptz DEFAULT now(),
  notes text
);

CREATE TABLE commission_config (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  default_signup_pct numeric(5,2) DEFAULT 10.00,
  default_session_pct numeric(5,2) DEFAULT 15.00,
  default_membership_commission_sgd numeric(10,2) DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(gym_id)
);

CREATE TABLE salary_history (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  changed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  old_value numeric(10,2),
  new_value numeric(10,2),
  field_name text,
  changed_at timestamptz DEFAULT now()
);

CREATE TABLE staff_payroll (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gym_id uuid REFERENCES gyms(id) ON DELETE SET NULL,
  month integer NOT NULL,
  year integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- DUTY ROSTER (PART-TIMERS)
-- ============================================================

CREATE TABLE duty_roster (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  shift_date date NOT NULL,
  shift_start time NOT NULL,
  shift_end time NOT NULL,
  hours_worked numeric(5,2),
  hourly_rate numeric(10,2),
  gross_pay numeric(10,2),
  status text DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'absent', 'disputed')),
  is_locked boolean DEFAULT false,
  locked_at timestamptz,
  payslip_id uuid REFERENCES payslips(id) ON DELETE SET NULL,
  dispute_reason text,
  disputed_at timestamptz,
  disputed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  dispute_resolved_at timestamptz,
  dispute_resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE roster_shift_presets (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  label text NOT NULL,
  shift_start time NOT NULL,
  shift_end time NOT NULL,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- LEAVE
-- ============================================================

CREATE TABLE leave_applications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  leave_type text NOT NULL CHECK (leave_type IN ('annual', 'medical', 'hospitalisation', 'other')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  days_requested numeric(5,2) NOT NULL,
  reason text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  -- Escalation
  escalated_to_biz_ops boolean DEFAULT false,
  escalated_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public_holidays (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  date date NOT NULL,
  name text NOT NULL,
  year integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(date)
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

CREATE TABLE leave_decision_notif (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  leave_application_id uuid REFERENCES leave_applications(id) ON DELETE CASCADE,
  decision text,
  seen_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE mem_rejection_notif (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  gym_membership_id uuid REFERENCES gym_memberships(id) ON DELETE CASCADE,
  seen_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE pkg_rejection_notif (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  package_id uuid REFERENCES packages(id) ON DELETE CASCADE,
  seen_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE cancellation_approved_notif (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  cancellation_request_id uuid REFERENCES membership_cancellation_requests(id) ON DELETE CASCADE,
  member_name text,
  approved_by_name text,
  cancellation_date date,
  seen_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE cancellation_rejection_notif (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  cancellation_request_id uuid REFERENCES membership_cancellation_requests(id) ON DELETE CASCADE,
  seen_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE shift_dispute_notif (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  biz_ops_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  roster_id uuid REFERENCES duty_roster(id) ON DELETE CASCADE,
  staff_name text,
  shift_date date,
  dispute_reason text,
  resolution text,
  seen_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE manager_dispute_notif (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  manager_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  roster_id uuid REFERENCES duty_roster(id) ON DELETE CASCADE,
  staff_name text,
  shift_date date,
  resolution text,
  seen_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- WHATSAPP
-- ============================================================

CREATE TABLE whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  notification_type text NOT NULL UNIQUE,
  template text NOT NULL,
  is_active boolean DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE whatsapp_notifications_config (
  id text PRIMARY KEY,
  notification_type text NOT NULL UNIQUE,
  is_enabled boolean DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE whatsapp_queue (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  notification_type text NOT NULL,
  phone text,
  name text,
  placeholders jsonb,
  fallback_message text,
  related_id uuid,
  scheduled_for timestamptz,
  sent_at timestamptz,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  error_message text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE whatsapp_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  notification_type text,
  phone text,
  message text,
  status text,
  twilio_sid text,
  error_message text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE session_reminder_members_list (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
  member_id uuid REFERENCES members(id) ON DELETE CASCADE,
  member_name text,
  member_phone text,
  trainer_nickname text,
  session_date text,
  session_time text,
  gym_name text,
  scheduled_for date,
  reminder_sent boolean DEFAULT false,
  reminder_failed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- ACTIVITY & CRON LOGS
-- ============================================================

CREATE TABLE activity_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  user_name text,
  role text,
  action_type text NOT NULL,
  page text,
  description text,
  ip_address text,
  browser text,
  os text,
  device text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE cron_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  cron_name text NOT NULL,
  cron_type text DEFAULT 'daily',
  status text DEFAULT 'running' CHECK (status IN ('running', 'success', 'error')),
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  duration_ms integer,
  result jsonb,
  error_message text
);

-- ============================================================
-- BIRTHDAY REMINDERS
-- ============================================================

CREATE TABLE staff_birthday_reminders (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  full_name text,
  nickname text,
  date_of_birth date,
  gym_ids uuid[],
  days_until_birthday integer,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE member_birthday_reminders (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id uuid REFERENCES members(id) ON DELETE CASCADE,
  full_name text,
  date_of_birth date,
  gym_id uuid REFERENCES gyms(id) ON DELETE CASCADE,
  days_until_birthday integer,
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- FUNCTIONS (SECURITY DEFINER — bypass RLS safely)
-- ============================================================

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION get_manager_gym_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT manager_gym_id FROM users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION get_gym_staff_ids(p_gym_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT trainer_id FROM trainer_gyms WHERE gym_id = p_gym_id;
$$;

-- ============================================================
-- TRIGGER: protect sensitive user fields from browser updates
-- ============================================================

CREATE OR REPLACE FUNCTION protect_sensitive_user_fields()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Unauthorised: role cannot be changed directly.'; END IF;
  IF NEW.employment_type IS DISTINCT FROM OLD.employment_type THEN
    RAISE EXCEPTION 'Unauthorised: employment_type cannot be changed directly.'; END IF;
  IF NEW.hourly_rate IS DISTINCT FROM OLD.hourly_rate THEN
    RAISE EXCEPTION 'Unauthorised: hourly_rate cannot be changed directly.'; END IF;
  IF NEW.manager_gym_id IS DISTINCT FROM OLD.manager_gym_id THEN
    RAISE EXCEPTION 'Unauthorised: manager_gym_id cannot be changed directly.'; END IF;
  IF NEW.is_archived IS DISTINCT FROM OLD.is_archived THEN
    RAISE EXCEPTION 'Unauthorised: is_archived cannot be changed directly.'; END IF;
  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'Unauthorised: is_active cannot be changed directly.'; END IF;
  IF NEW.commission_signup_pct IS DISTINCT FROM OLD.commission_signup_pct THEN
    RAISE EXCEPTION 'Unauthorised: commission fields cannot be changed directly.'; END IF;
  IF NEW.commission_session_pct IS DISTINCT FROM OLD.commission_session_pct THEN
    RAISE EXCEPTION 'Unauthorised: commission fields cannot be changed directly.'; END IF;
  IF NEW.membership_commission_sgd IS DISTINCT FROM OLD.membership_commission_sgd THEN
    RAISE EXCEPTION 'Unauthorised: commission fields cannot be changed directly.'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_sensitive_user_fields
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION protect_sensitive_user_fields();

-- ============================================================
-- VIEWS
-- ============================================================

-- users_safe: non-sensitive columns for client-side cross-user queries
-- Excludes: nric, address, commission_*, departure_reason, probation_*,
--           offboarding_completed_at, archived_by, date_of_departure
DROP VIEW IF EXISTS users_safe;
CREATE VIEW users_safe AS
SELECT
  id, full_name, nickname, email, phone, nationality,
  role, employment_type, is_active, is_archived, is_also_trainer,
  manager_gym_id, hourly_rate,
  leave_entitlement_days, leave_carry_forward_days,
  medical_leave_entitlement_days, hospitalisation_leave_entitlement_days,
  max_sessions_per_week, monthly_session_target,
  payslip_notif_seen_at, commission_notif_seen_at,
  date_of_birth, date_of_joining, created_at, archived_at
FROM public.users;

-- Grant to authenticated only — NOT anon
-- users_safe still contains email, phone, DOB which should not be public
GRANT SELECT ON users_safe TO authenticated;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE gyms ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainer_gyms ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_cancellation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_bonuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE duty_roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE cpf_age_brackets ENABLE ROW LEVEL SECURITY;
ALTER TABLE cpf_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE roster_shift_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_notifications_config ENABLE ROW LEVEL SECURITY;

-- ── USERS ────────────────────────────────────────────────────
CREATE POLICY "users_read_own" ON users FOR SELECT USING (id = auth.uid());
CREATE POLICY "users_admin_read" ON users FOR SELECT USING (get_user_role() = 'admin');
CREATE POLICY "users_biz_ops_read" ON users FOR SELECT USING (get_user_role() = 'business_ops');
CREATE POLICY "users_manager_read" ON users FOR SELECT USING (
  get_user_role() = 'manager' AND (id = auth.uid() OR manager_gym_id = get_manager_gym_id())
);
CREATE POLICY "users_update_own" ON users FOR UPDATE USING (id = auth.uid());
CREATE POLICY "users_admin_update" ON users FOR UPDATE USING (get_user_role() = 'admin');
CREATE POLICY "users_biz_ops_update" ON users FOR UPDATE USING (get_user_role() = 'business_ops');
CREATE POLICY "users_manager_update" ON users FOR UPDATE USING (
  get_user_role() = 'manager' AND
  id IN (SELECT trainer_id FROM trainer_gyms WHERE gym_id = get_manager_gym_id())
);
CREATE POLICY "users_admin_all" ON users FOR ALL USING (get_user_role() = 'admin');

-- ── GYMS ─────────────────────────────────────────────────────
CREATE POLICY "gyms_admin_all" ON gyms FOR ALL USING (get_user_role() = 'admin');
CREATE POLICY "gyms_biz_ops_all" ON gyms FOR ALL USING (get_user_role() = 'business_ops');
CREATE POLICY "gyms_manager_read" ON gyms FOR SELECT USING (
  get_user_role() = 'manager' AND id = get_manager_gym_id()
);
CREATE POLICY "gyms_manager_update" ON gyms FOR UPDATE USING (
  get_user_role() = 'manager' AND id = get_manager_gym_id()
);
CREATE POLICY "gyms_trainer_read" ON gyms FOR SELECT USING (
  (get_user_role() = 'trainer' OR get_user_role() = 'staff')
  AND id IN (SELECT gym_id FROM trainer_gyms WHERE trainer_id = auth.uid())
);

-- ── TRAINER_GYMS ─────────────────────────────────────────────
-- NOTE: no self-referencing subqueries — causes infinite recursion with users RLS
CREATE POLICY "trainer_gyms_read" ON trainer_gyms FOR SELECT USING (
  get_user_role() = 'admin' OR get_user_role() = 'business_ops'
  OR trainer_id = auth.uid()
  OR (get_user_role() = 'manager' AND gym_id = get_manager_gym_id())
  OR (get_user_role() = 'staff' AND gym_id = get_manager_gym_id())
);
CREATE POLICY "trainer_gyms_admin_biz_ops" ON trainer_gyms FOR ALL USING (
  get_user_role() = 'admin' OR get_user_role() = 'business_ops'
);
CREATE POLICY "trainer_gyms_manager_write" ON trainer_gyms FOR INSERT WITH CHECK (
  get_user_role() = 'manager' AND gym_id = get_manager_gym_id()
);
CREATE POLICY "trainer_gyms_manager_delete" ON trainer_gyms FOR DELETE USING (
  get_user_role() = 'manager' AND gym_id = get_manager_gym_id()
);

-- ── MEMBERS ───────────────────────────────────────────────────
CREATE POLICY "members_gym_read" ON members FOR SELECT USING (
  get_user_role() IN ('admin', 'business_ops')
  OR gym_id = get_manager_gym_id()
  OR gym_id IN (SELECT gym_id FROM trainer_gyms WHERE trainer_id = auth.uid())
);
CREATE POLICY "members_staff_write" ON members FOR INSERT WITH CHECK (
  gym_id = get_manager_gym_id()
  OR gym_id IN (SELECT gym_id FROM trainer_gyms WHERE trainer_id = auth.uid())
);
CREATE POLICY "members_admin_biz_ops_all" ON members FOR ALL USING (
  get_user_role() IN ('admin', 'business_ops')
);

-- ── GYM MEMBERSHIPS ───────────────────────────────────────────
CREATE POLICY "gym_memberships_gym_read" ON gym_memberships FOR SELECT USING (
  get_user_role() IN ('admin', 'business_ops')
  OR gym_id = get_manager_gym_id()
  OR gym_id IN (SELECT gym_id FROM trainer_gyms WHERE trainer_id = auth.uid())
);
CREATE POLICY "gym_memberships_admin_biz_ops_all" ON gym_memberships FOR ALL USING (
  get_user_role() IN ('admin', 'business_ops')
);
CREATE POLICY "gym_memberships_manager_write" ON gym_memberships FOR ALL USING (
  get_user_role() = 'manager' AND gym_id = get_manager_gym_id()
);
CREATE POLICY "gym_memberships_staff_insert" ON gym_memberships FOR INSERT WITH CHECK (
  gym_id IN (SELECT gym_id FROM trainer_gyms WHERE trainer_id = auth.uid())
);

-- ── PACKAGES & SESSIONS ───────────────────────────────────────
CREATE POLICY "packages_gym_read" ON packages FOR SELECT USING (
  get_user_role() IN ('admin', 'business_ops')
  OR gym_id = get_manager_gym_id()
  OR trainer_id = auth.uid()
  OR gym_id IN (SELECT gym_id FROM trainer_gyms WHERE trainer_id = auth.uid())
);
CREATE POLICY "packages_admin_biz_ops_all" ON packages FOR ALL USING (
  get_user_role() IN ('admin', 'business_ops')
);
CREATE POLICY "packages_trainer_write" ON packages FOR INSERT WITH CHECK (
  trainer_id = auth.uid()
);
CREATE POLICY "packages_manager_all" ON packages FOR ALL USING (
  get_user_role() = 'manager' AND gym_id = get_manager_gym_id()
);

CREATE POLICY "sessions_gym_read" ON sessions FOR SELECT USING (
  get_user_role() IN ('admin', 'business_ops')
  OR gym_id = get_manager_gym_id()
  OR trainer_id = auth.uid()
  OR gym_id IN (SELECT gym_id FROM trainer_gyms WHERE trainer_id = auth.uid())
);
CREATE POLICY "sessions_admin_biz_ops_all" ON sessions FOR ALL USING (
  get_user_role() IN ('admin', 'business_ops')
);
CREATE POLICY "sessions_trainer_write" ON sessions FOR INSERT WITH CHECK (
  trainer_id = auth.uid()
);
CREATE POLICY "sessions_manager_all" ON sessions FOR ALL USING (
  get_user_role() = 'manager' AND gym_id = get_manager_gym_id()
);

-- ── PAYSLIPS ──────────────────────────────────────────────────
CREATE POLICY "payslips_own_read" ON payslips FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "payslips_business_ops_all" ON payslips FOR ALL USING (get_user_role() = 'business_ops');
CREATE POLICY "payslips_admin_all" ON payslips FOR ALL USING (get_user_role() = 'admin');

-- ── COMMISSION PAYOUTS ────────────────────────────────────────
CREATE POLICY "commission_payouts_own_read" ON commission_payouts FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "commission_payouts_biz_ops_all" ON commission_payouts FOR ALL USING (get_user_role() = 'business_ops');
CREATE POLICY "commission_payouts_admin_all" ON commission_payouts FOR ALL USING (get_user_role() = 'admin');

-- ── PAYROLL SUPPORT TABLES ────────────────────────────────────
CREATE POLICY "staff_bonuses_biz_ops_admin" ON staff_bonuses FOR ALL USING (
  get_user_role() IN ('admin', 'business_ops')
);
CREATE POLICY "pending_deductions_biz_ops_admin" ON pending_deductions FOR ALL USING (
  get_user_role() IN ('admin', 'business_ops')
);
CREATE POLICY "pending_deductions_own_read" ON pending_deductions FOR SELECT USING (user_id = auth.uid());

-- ── DUTY ROSTER ───────────────────────────────────────────────
CREATE POLICY "duty_roster_own_read" ON duty_roster FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "duty_roster_manager_biz_ops_all" ON duty_roster FOR ALL USING (
  get_user_role() = 'business_ops'
  OR (get_user_role() = 'manager' AND gym_id = get_manager_gym_id())
);
CREATE POLICY "duty_roster_own_dispute" ON duty_roster FOR UPDATE USING (
  user_id = auth.uid()
);

-- ── LEAVE ─────────────────────────────────────────────────────
CREATE POLICY "leave_own_read" ON leave_applications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "leave_own_insert" ON leave_applications FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "leave_own_cancel" ON leave_applications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "leave_manager_gym_read" ON leave_applications FOR SELECT USING (
  get_user_role() = 'manager' AND
  user_id IN (SELECT trainer_id FROM trainer_gyms WHERE gym_id = get_manager_gym_id())
);
CREATE POLICY "leave_manager_approve" ON leave_applications FOR UPDATE USING (
  get_user_role() = 'manager' AND
  user_id IN (SELECT trainer_id FROM trainer_gyms WHERE gym_id = get_manager_gym_id())
);
CREATE POLICY "leave_biz_ops_admin_all" ON leave_applications FOR ALL USING (
  get_user_role() IN ('admin', 'business_ops')
);

-- ── ACTIVITY LOGS ─────────────────────────────────────────────
CREATE POLICY "activity_logs_admin_read" ON activity_logs FOR SELECT USING (
  get_user_role() = 'admin'
);
CREATE POLICY "activity_logs_insert_authenticated" ON activity_logs FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
);

-- ── CONFIGURATION (READ-ONLY FOR AUTHENTICATED) ───────────────
CREATE POLICY "commission_config_read" ON commission_config FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "commission_config_biz_ops_write" ON commission_config FOR ALL USING (
  get_user_role() IN ('admin', 'business_ops')
);
CREATE POLICY "cpf_brackets_read" ON cpf_age_brackets FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "cpf_brackets_biz_ops_write" ON cpf_age_brackets FOR ALL USING (
  get_user_role() IN ('admin', 'business_ops')
);
CREATE POLICY "package_templates_read" ON package_templates FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "package_templates_write" ON package_templates FOR ALL USING (
  get_user_role() IN ('admin', 'business_ops', 'manager')
);
CREATE POLICY "membership_types_read" ON membership_types FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "membership_types_write" ON membership_types FOR ALL USING (
  get_user_role() IN ('admin', 'business_ops', 'manager')
);
CREATE POLICY "public_holidays_read" ON public_holidays FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "public_holidays_write" ON public_holidays FOR ALL USING (
  get_user_role() IN ('admin', 'business_ops')
);
CREATE POLICY "roster_presets_read" ON roster_shift_presets FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "roster_presets_write" ON roster_shift_presets FOR ALL USING (
  get_user_role() IN ('admin', 'business_ops', 'manager')
);
CREATE POLICY "whatsapp_templates_read" ON whatsapp_templates FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "whatsapp_templates_write" ON whatsapp_templates FOR ALL USING (
  get_user_role() IN ('admin', 'business_ops')
);
CREATE POLICY "whatsapp_config_read" ON whatsapp_notifications_config FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "whatsapp_config_write" ON whatsapp_notifications_config FOR ALL USING (
  get_user_role() IN ('admin', 'business_ops')
);
