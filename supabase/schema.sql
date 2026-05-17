-- ============================================================
-- GymApp Database Schema — Current Production State
-- Last updated: 15 May 2026
--
-- HOW TO USE:
-- 1. Run this entire file in Supabase SQL Editor on a fresh project
-- 2. Then run the RLS policies section at the bottom
-- 3. Then run the views section
-- 4. Then run the triggers section
-- 5. Set up Google OAuth in Supabase Authentication settings
-- 6. Insert your first admin user manually via Supabase table editor
--
-- NOTE: This schema reflects the live production state as of the
-- date above. Individual migration files (v1–v89) document the
-- historical evolution.
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- CORE TABLES
-- ============================================================

-- App-wide settings (single row: id = 'global')
CREATE TABLE app_settings (
  id text PRIMARY KEY DEFAULT 'global',
  app_name text DEFAULT 'GymApp',
  company_name text DEFAULT 'Gym Operations Suite',
  -- Logo URLs
  login_logo_url text,
  admin_sidebar_logo_url text,
  payslip_logo_url text,
  -- Operational settings
  auto_logout_minutes integer DEFAULT 10,
  leave_reset_year integer DEFAULT 2026,
  leave_reset_reminder_seen_at timestamptz,
  max_leave_carry_forward_days integer DEFAULT 5,
  -- Payroll mode
  combined_payslip_enabled boolean DEFAULT false,  -- one-way switch; once true cannot be reversed
  -- Escalation thresholds
  escalation_leave_hours integer DEFAULT 48,
  escalation_membership_sales_hours integer DEFAULT 48,
  escalation_pt_package_hours integer DEFAULT 48,
  escalation_pt_session_hours integer DEFAULT 48,
  escalation_membership_expiry_days integer DEFAULT 7,
  updated_at timestamptz DEFAULT now()
);

-- Gyms
CREATE TABLE gyms (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  address text,
  phone text,
  logo_url text,
  is_active boolean DEFAULT true,
  fy_start_month integer DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

-- Users (all roles: admin, business_ops, manager, trainer, staff)
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
  archived_by uuid REFERENCES users(id) ON DELETE SET NULL,
  offboarding_completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Part-timer gym assignments (many-to-many users ↔ gyms)
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

-- Membership types (templates per gym)
CREATE TABLE membership_types (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  name text NOT NULL,
  duration_days integer NOT NULL,
  price_sgd numeric(10,2) NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Active gym memberships
CREATE TABLE gym_memberships (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  membership_type_id uuid REFERENCES membership_types(id) ON DELETE SET NULL,
  sold_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  start_date date NOT NULL,
  end_date date,
  price_sgd numeric(10,2),
  commission_sgd numeric(10,2) DEFAULT 0,
  status text DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
  sale_status text DEFAULT 'pending' CHECK (sale_status IN ('pending', 'confirmed', 'rejected')),
  membership_actioned boolean DEFAULT false,
  confirmed_at timestamptz,
  confirmed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  rejected_at timestamptz,
  rejected_by uuid REFERENCES users(id) ON DELETE SET NULL,
  rejection_reason text,
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES users(id) ON DELETE SET NULL,
  cancellation_reason text,
  cancellation_end_date date,
  created_at timestamptz DEFAULT now()
);

-- Membership cancellation requests (from staff to manager)
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

-- Non-renewal tracking
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
  scheduled_at timestamptz,
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
  renewal_status text CHECK (renewal_status IN ('renewing', 'not_renewing', 'undecided')),
  renewal_reason text,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- PAYROLL
-- ============================================================

CREATE TABLE payslips (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  gym_id uuid REFERENCES gyms(id) ON DELETE SET NULL,
  period_month integer NOT NULL,
  period_year integer NOT NULL,
  payment_type text DEFAULT 'salary',            -- 'salary' | 'commission' | 'combined'
  employment_type text DEFAULT 'full_time',
  -- Salary fields
  salary_amount numeric DEFAULT 0,               -- OW: roster pay (part-timer) or fixed salary (full-timer)
  total_hours numeric,                           -- part-timer: hours from locked roster shifts
  hourly_rate_used numeric,                      -- part-timer: rate at generation time
  -- Commission fields
  commission_amount numeric DEFAULT 0,           -- OW: from commission_items for this period
  commission_period_month integer,               -- may differ from period_month (late confirmations)
  commission_period_year integer,
  -- Allowance / others
  allowance_amount numeric DEFAULT 0,
  others_amount numeric DEFAULT 0,
  others_label text,
  others_cpf_liable boolean DEFAULT false,
  -- Bonus and deductions
  bonus_amount numeric DEFAULT 0,
  deduction_amount numeric DEFAULT 0,
  deduction_reason text,
  -- Computed totals
  gross_salary numeric,
  net_salary numeric,
  total_employer_cost numeric,
  -- CPF fields
  is_cpf_liable boolean DEFAULT true,
  employee_cpf_rate numeric DEFAULT 20.00,       -- snapshot at generation
  employer_cpf_rate numeric DEFAULT 17.00,       -- snapshot at generation
  ow_ceiling_used numeric DEFAULT 8000,          -- snapshot at generation
  annual_aw_ceiling_used numeric DEFAULT 102000, -- snapshot at generation
  capped_ow numeric DEFAULT 0,
  aw_subject_to_cpf numeric DEFAULT 0,
  employee_cpf_amount numeric DEFAULT 0,
  employer_cpf_amount numeric DEFAULT 0,
  ytd_ow_before numeric DEFAULT 0,               -- YTD ordinary wages before this payslip
  ytd_aw_before numeric DEFAULT 0,               -- YTD additional wages before this payslip
  low_income_flag boolean DEFAULT false,
  cpf_adjustment_note text,
  -- Status
  status text DEFAULT 'draft',                   -- 'draft' | 'approved' | 'paid'
  notes text,
  generated_by uuid REFERENCES users(id),
  generated_at timestamptz DEFAULT now(),
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, gym_id, period_month, period_year, payment_type)
);

-- Payslip deletion audit trail
CREATE TABLE payslip_deletions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  payslip_snapshot jsonb,
  deleted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  deletion_reason text,
  deleted_at timestamptz DEFAULT now()
);

-- Staff bonuses (standalone, separate from payslip generation)
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

-- Pending deductions (created when dispute approved on paid payslip)
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

-- commission_payouts table removed in v90 — replaced by unified payslips + commission_items

-- CPF age brackets config
CREATE TABLE cpf_age_brackets (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  label text NOT NULL,
  age_from integer NOT NULL,
  age_to integer,
  employee_rate numeric(5,4) NOT NULL,
  employer_rate numeric(5,4) NOT NULL,
  -- Ceilings stored once per period (same value on all brackets sharing an effective_from)
  ow_ceiling numeric(10,2),           -- monthly OW ceiling (e.g. 6800.00)
  annual_aw_ceiling numeric(10,2),    -- annual AW ceiling (e.g. 102000.00)
  -- Period versioning — multiple periods coexist; app picks most recent <= payroll month
  effective_from date,                -- NULL = applies to all periods (legacy)
  notes text,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
-- Supports up to 3 concurrent periods: old / current / pending (future).
-- getCpfBracketRates() and getCpfCeilings() filter by effective_from <= payroll month start.
-- Changeover: POST /api/cpf-changeover deletes oldest period rows when a new one takes effect.

-- CPF submissions (annual reconciliation)
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

-- Commission config per gym
CREATE TABLE commission_config (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  default_signup_pct numeric(5,2) DEFAULT 10.00,
  default_session_pct numeric(5,2) DEFAULT 15.00,
  default_membership_commission_sgd numeric(10,2) DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(gym_id)
);

-- Salary history (for audit)
-- Commission items — source of truth for all commissions earned
-- Created atomically when session/package/membership is confirmed by manager
-- payslip_id stamped when commission is paid; NULL = unpaid
CREATE TABLE commission_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gym_id uuid REFERENCES gyms(id) ON DELETE SET NULL,
  source_type text NOT NULL,                     -- 'pt_session' | 'pt_package' | 'membership'
  source_id uuid NOT NULL,                       -- FK to sessions.id / packages.id / gym_memberships.id
  amount numeric NOT NULL,                       -- commission amount in SGD
  period_month integer NOT NULL,                 -- payroll period this item belongs to
  period_year integer NOT NULL,
  payslip_id uuid REFERENCES payslips(id) ON DELETE SET NULL,  -- NULL = unpaid
  created_at timestamptz DEFAULT now(),
  UNIQUE(source_type, source_id)                 -- one commission item per source event
);
CREATE INDEX commission_items_source_lookup ON commission_items(source_type, source_id);
CREATE INDEX commission_items_user_period_unpaid ON commission_items(user_id, period_year, period_month) WHERE payslip_id IS NULL;


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
  -- One row per staff member — their payroll profile (not per-period)
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- Salary
  current_salary numeric,                        -- full-timer monthly gross
  -- Allowance (included in OW, CPF-liable)
  monthly_allowance numeric DEFAULT 0,
  allowance_label text,
  -- Others (CPF liability configurable)
  others_monthly_amount numeric DEFAULT 0,
  others_label text,
  others_cpf_liable boolean DEFAULT false,
  -- CPF
  is_cpf_liable boolean DEFAULT true,
  updated_at timestamptz DEFAULT now(),
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
  -- Dispute fields
  dispute_reason text,
  disputed_at timestamptz,
  disputed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  dispute_resolved_at timestamptz,
  dispute_resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Preset shift times per gym
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
  name text NOT NULL UNIQUE,
  template text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE whatsapp_notifications_config (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  notification_type text NOT NULL UNIQUE,
  is_enabled boolean DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE whatsapp_queue (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  notification_type text NOT NULL,
  phone text NOT NULL,
  name text,
  placeholders jsonb,
  fallback_message text,
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
  scheduled_for date,
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
-- BIRTHDAY REMINDERS (views/materialized data)
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
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION get_manager_gym_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT manager_gym_id FROM users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION get_gym_staff_ids(p_gym_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT trainer_id FROM trainer_gyms WHERE gym_id = p_gym_id;
$$;

-- ============================================================
-- TRIGGER: protect sensitive user fields from browser updates
-- ============================================================

CREATE OR REPLACE FUNCTION protect_sensitive_user_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role (adminClient) has no auth.uid() — allow all changes
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Unauthorised: role cannot be changed directly.';
  END IF;
  IF NEW.employment_type IS DISTINCT FROM OLD.employment_type THEN
    RAISE EXCEPTION 'Unauthorised: employment_type cannot be changed directly.';
  END IF;
  IF NEW.hourly_rate IS DISTINCT FROM OLD.hourly_rate THEN
    RAISE EXCEPTION 'Unauthorised: hourly_rate cannot be changed directly.';
  END IF;
  IF NEW.manager_gym_id IS DISTINCT FROM OLD.manager_gym_id THEN
    RAISE EXCEPTION 'Unauthorised: manager_gym_id cannot be changed directly.';
  END IF;
  IF NEW.is_archived IS DISTINCT FROM OLD.is_archived THEN
    RAISE EXCEPTION 'Unauthorised: is_archived cannot be changed directly.';
  END IF;
  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'Unauthorised: is_active cannot be changed directly.';
  END IF;
  IF NEW.commission_signup_pct IS DISTINCT FROM OLD.commission_signup_pct THEN
    RAISE EXCEPTION 'Unauthorised: commission fields cannot be changed directly.';
  END IF;
  IF NEW.commission_session_pct IS DISTINCT FROM OLD.commission_session_pct THEN
    RAISE EXCEPTION 'Unauthorised: commission fields cannot be changed directly.';
  END IF;
  IF NEW.membership_commission_sgd IS DISTINCT FROM OLD.membership_commission_sgd THEN
    RAISE EXCEPTION 'Unauthorised: commission fields cannot be changed directly.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_sensitive_user_fields
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION protect_sensitive_user_fields();

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

GRANT SELECT ON users_safe TO authenticated;
GRANT SELECT ON users_safe TO anon;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
-- Reflects live DB state as of 17 May 2026.
-- Run diagnostic_full_rls_picture.sql to verify against live DB.

-- ── ENABLE RLS ───────────────────────────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE gyms ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainer_gyms ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE duty_roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_payroll ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_bonuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE cpf_age_brackets ENABLE ROW LEVEL SECURITY;
ALTER TABLE cpf_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payslip_deletions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE roster_shift_presets ENABLE ROW LEVEL SECURITY;

-- ── USERS ────────────────────────────────────────────────────
CREATE POLICY "users_read_own" ON users FOR SELECT USING (id = auth.uid());
CREATE POLICY "users_admin_read" ON users FOR SELECT USING (get_user_role() = 'admin');
CREATE POLICY "users_biz_ops_read" ON users FOR SELECT USING (get_user_role() = 'business_ops');
CREATE POLICY "users_manager_read" ON users FOR SELECT USING (
  get_user_role() = 'manager' AND (id = auth.uid() OR manager_gym_id = get_manager_gym_id())
);
CREATE POLICY "users_update_own" ON users FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role IS NOT DISTINCT FROM (SELECT role FROM users WHERE id = auth.uid())
    AND is_active IS NOT DISTINCT FROM (SELECT is_active FROM users WHERE id = auth.uid())
    AND is_archived IS NOT DISTINCT FROM (SELECT is_archived FROM users WHERE id = auth.uid())
    AND email IS NOT DISTINCT FROM (SELECT email FROM users WHERE id = auth.uid())
    AND employment_type IS NOT DISTINCT FROM (SELECT employment_type FROM users WHERE id = auth.uid())
    AND is_also_trainer IS NOT DISTINCT FROM (SELECT is_also_trainer FROM users WHERE id = auth.uid())
    AND manager_gym_id IS NOT DISTINCT FROM (SELECT manager_gym_id FROM users WHERE id = auth.uid())
    AND residency_status IS NOT DISTINCT FROM (SELECT residency_status FROM users WHERE id = auth.uid())
    AND nric IS NOT DISTINCT FROM (SELECT nric FROM users WHERE id = auth.uid())
    AND date_of_birth IS NOT DISTINCT FROM (SELECT date_of_birth FROM users WHERE id = auth.uid())
    AND date_of_joining IS NOT DISTINCT FROM (SELECT date_of_joining FROM users WHERE id = auth.uid())
    AND nationality IS NOT DISTINCT FROM (SELECT nationality FROM users WHERE id = auth.uid())
  );
CREATE POLICY "users_admin_update" ON users FOR UPDATE USING (get_user_role() = 'admin');
CREATE POLICY "users_biz_ops_update" ON users FOR UPDATE USING (get_user_role() = 'business_ops');
CREATE POLICY "users_manager_update" ON users FOR UPDATE USING (
  get_user_role() = 'manager'
  AND id IN (SELECT trainer_id FROM trainer_gyms WHERE gym_id = get_manager_gym_id())
);
CREATE POLICY "users_admin_all" ON users FOR ALL USING (get_user_role() = 'admin');

-- ── GYMS ─────────────────────────────────────────────────────
CREATE POLICY "gyms_admin_all" ON gyms FOR ALL USING (get_user_role() = 'admin');
CREATE POLICY "gyms_biz_ops_all" ON gyms FOR ALL
  USING (get_user_role() = 'business_ops')
  WITH CHECK (get_user_role() = 'business_ops');
CREATE POLICY "gyms_read" ON gyms FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "gyms_manager_read" ON gyms FOR SELECT USING (
  get_user_role() = 'manager'
  AND (id = get_manager_gym_id() OR id IN (SELECT get_gym_staff_ids(get_manager_gym_id())))
);
CREATE POLICY "gyms_manager_update" ON gyms FOR UPDATE
  USING (get_user_role() = 'manager' AND id = get_manager_gym_id())
  WITH CHECK (get_user_role() = 'manager' AND id = get_manager_gym_id());
CREATE POLICY "gyms_staff_read" ON gyms FOR SELECT USING (
  get_user_role() = 'staff'
  AND id IN (SELECT gym_id FROM trainer_gyms WHERE trainer_id = auth.uid())
);

-- ── TRAINER_GYMS ─────────────────────────────────────────────
CREATE POLICY "trainer_gyms_read" ON trainer_gyms FOR SELECT USING (
  get_user_role() = 'admin'
  OR get_user_role() = 'business_ops'
  OR trainer_id = auth.uid()
  OR (get_user_role() = 'manager' AND gym_id = get_manager_gym_id())
  OR (get_user_role() = 'staff' AND gym_id = get_manager_gym_id())
);
CREATE POLICY "trainer_gyms_admin" ON trainer_gyms FOR ALL USING (get_user_role() = 'admin');
CREATE POLICY "trainer_gyms_biz_ops" ON trainer_gyms FOR ALL
  USING (get_user_role() = 'business_ops')
  WITH CHECK (get_user_role() = 'business_ops');
CREATE POLICY "trainer_gyms_manager_insert" ON trainer_gyms FOR INSERT
  WITH CHECK (get_user_role() = 'manager' AND gym_id = get_manager_gym_id());
CREATE POLICY "trainer_gyms_manager_delete" ON trainer_gyms FOR DELETE
  USING (get_user_role() = 'manager' AND gym_id = get_manager_gym_id());

-- ── MEMBERS ───────────────────────────────────────────────────
CREATE POLICY "members_read" ON members FOR SELECT USING (
  (get_user_role() = 'manager' AND gym_id = get_manager_gym_id())
  OR (get_user_role() = 'trainer' AND gym_id IN (SELECT gym_id FROM trainer_gyms WHERE trainer_id = auth.uid()))
  OR (get_user_role() = 'staff' AND gym_id = (SELECT manager_gym_id FROM users WHERE id = auth.uid()))
  OR get_user_role() = 'business_ops'
  OR get_user_role() = 'admin'
);
CREATE POLICY "members_write" ON members FOR INSERT
  WITH CHECK (get_user_role() IN ('manager', 'trainer', 'staff'));
CREATE POLICY "members_update" ON members FOR UPDATE USING (
  get_user_role() IN ('manager', 'business_ops')
  OR (get_user_role() = 'trainer' AND created_by = auth.uid())
);

-- ── GYM_MEMBERSHIPS ───────────────────────────────────────────
CREATE POLICY "gym_memberships_read" ON gym_memberships FOR SELECT USING (
  (get_user_role() = 'manager' AND gym_id = get_manager_gym_id())
  OR (get_user_role() IN ('trainer', 'staff') AND sold_by_user_id = auth.uid())
  OR get_user_role() = 'business_ops'
  OR get_user_role() = 'admin'
);
CREATE POLICY "gym_memberships_insert" ON gym_memberships FOR INSERT
  WITH CHECK (
    get_user_role() IN ('manager', 'trainer', 'staff')
    AND sold_by_user_id = auth.uid()
  );
CREATE POLICY "gym_memberships_confirm" ON gym_memberships FOR UPDATE
  USING (get_user_role() IN ('manager', 'business_ops'));

-- ── PACKAGES ──────────────────────────────────────────────────
CREATE POLICY "packages_read" ON packages FOR SELECT USING (
  get_user_role() IN ('admin', 'manager')
  OR trainer_id = auth.uid()
);
CREATE POLICY "packages_biz_ops_read" ON packages FOR SELECT USING (get_user_role() = 'business_ops');
CREATE POLICY "packages_trainer_insert" ON packages FOR INSERT WITH CHECK (
  trainer_id = auth.uid()
  AND (
    get_user_role() = 'trainer'
    OR (get_user_role() = 'manager' AND (SELECT is_also_trainer FROM users WHERE id = auth.uid()))
  )
);
CREATE POLICY "packages_admin_update" ON packages FOR UPDATE
  USING (get_user_role() IN ('admin', 'manager'));

-- ── SESSIONS ──────────────────────────────────────────────────
CREATE POLICY "sessions_read" ON sessions FOR SELECT USING (
  (get_user_role() = 'manager' AND gym_id = get_manager_gym_id())
  OR (get_user_role() = 'trainer' AND (trainer_id = auth.uid() OR gym_id IN (SELECT gym_id FROM trainer_gyms WHERE trainer_id = auth.uid())))
  OR (get_user_role() = 'staff' AND gym_id = (SELECT manager_gym_id FROM users WHERE id = auth.uid()))
  OR get_user_role() IN ('business_ops', 'admin')
);
CREATE POLICY "sessions_biz_ops_read" ON sessions FOR SELECT USING (get_user_role() = 'business_ops');
CREATE POLICY "sessions_trainer_insert" ON sessions FOR INSERT WITH CHECK (
  trainer_id = auth.uid()
  AND (
    get_user_role() = 'trainer'
    OR (get_user_role() = 'manager' AND (SELECT is_also_trainer FROM users WHERE id = auth.uid()))
  )
);
CREATE POLICY "sessions_update" ON sessions FOR UPDATE USING (
  get_user_role() IN ('admin', 'manager')
  OR trainer_id = auth.uid()
);

-- ── PAYSLIPS ──────────────────────────────────────────────────
CREATE POLICY "payslips_own_read" ON payslips FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "payslips_business_ops" ON payslips FOR ALL USING (get_user_role() = 'business_ops');

-- ── DUTY ROSTER ───────────────────────────────────────────────
CREATE POLICY "duty_roster_staff_read" ON duty_roster FOR SELECT USING (
  user_id = auth.uid()
  OR get_user_role() IN ('manager', 'business_ops')
);
CREATE POLICY "duty_roster_manager_write" ON duty_roster FOR ALL USING (
  get_user_role() = 'business_ops'
  OR (get_user_role() = 'manager' AND gym_id = get_manager_gym_id())
);

-- ── LEAVE_APPLICATIONS ────────────────────────────────────────
CREATE POLICY "leave_own" ON leave_applications FOR ALL USING (
  user_id = auth.uid()
  OR get_user_role() IN ('manager', 'business_ops', 'admin')
);

-- ── ACTIVITY_LOGS ─────────────────────────────────────────────
CREATE POLICY "activity_logs_admin_read" ON activity_logs FOR SELECT USING (
  get_user_role() = 'admin'
);

-- ── STAFF_PAYROLL ─────────────────────────────────────────────
CREATE POLICY "staff_payroll_own_read" ON staff_payroll FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "staff_payroll_biz_ops_admin_all" ON staff_payroll FOR ALL USING (
  get_user_role() IN ('admin', 'business_ops')
);
CREATE POLICY "staff_payroll_manager_read" ON staff_payroll FOR SELECT USING (
  get_user_role() = 'manager'
  AND user_id IN (SELECT trainer_id FROM trainer_gyms WHERE gym_id = get_manager_gym_id())
);

-- ── SALARY_HISTORY ────────────────────────────────────────────
CREATE POLICY "salary_history_business_ops" ON salary_history FOR ALL
  USING (get_user_role() = 'business_ops');

-- ── COMMISSION_ITEMS ──────────────────────────────────────────
CREATE POLICY "commission_items_own_read" ON commission_items FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "commission_items_manager_read" ON commission_items FOR SELECT USING (
  get_user_role() = 'manager' AND gym_id = get_manager_gym_id()
);
CREATE POLICY "commission_items_biz_ops_admin_all" ON commission_items FOR ALL USING (
  get_user_role() IN ('admin', 'business_ops')
);

-- ── STAFF_BONUSES ─────────────────────────────────────────────
CREATE POLICY "bonuses_business_ops" ON staff_bonuses FOR ALL USING (get_user_role() = 'business_ops');

-- ── PENDING_DEDUCTIONS ────────────────────────────────────────
CREATE POLICY "pending_deductions_biz_ops" ON pending_deductions FOR ALL USING (
  get_user_role() IN ('business_ops', 'admin')
);

-- ── COMMISSION_CONFIG ─────────────────────────────────────────
CREATE POLICY "commission_config_read" ON commission_config FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "commission_config_biz_ops_write" ON commission_config FOR ALL USING (
  get_user_role() IN ('admin', 'business_ops')
);

-- ── CPF_AGE_BRACKETS ──────────────────────────────────────────
CREATE POLICY "cpf_brackets_read" ON cpf_age_brackets FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "cpf_brackets_write" ON cpf_age_brackets FOR ALL USING (get_user_role() = 'business_ops');

-- ── CPF_SUBMISSIONS ───────────────────────────────────────────
CREATE POLICY "cpf_submissions_biz_ops" ON cpf_submissions FOR ALL USING (get_user_role() = 'business_ops');

-- ── PAYSLIP_DELETIONS ─────────────────────────────────────────
CREATE POLICY "payslip_deletions_biz_ops_read" ON payslip_deletions FOR SELECT USING (get_user_role() = 'business_ops');
CREATE POLICY "payslip_deletions_biz_ops_insert" ON payslip_deletions FOR INSERT WITH CHECK (get_user_role() = 'business_ops');
CREATE POLICY "payslip_deletions_admin_read" ON payslip_deletions FOR SELECT USING (get_user_role() = 'admin');

-- ── APP_SETTINGS ──────────────────────────────────────────────
CREATE POLICY "app_settings_public_read" ON app_settings FOR SELECT USING (true);
CREATE POLICY "app_settings_privileged_write" ON app_settings FOR ALL USING (
  get_user_role() IN ('admin', 'business_ops')
);

-- ── PUBLIC_HOLIDAYS ───────────────────────────────────────────
CREATE POLICY "holidays_read" ON public_holidays FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "holidays_write" ON public_holidays FOR ALL USING (
  get_user_role() IN ('business_ops', 'admin')
);

-- ── MEMBERSHIP_TYPES ──────────────────────────────────────────
CREATE POLICY "membership_types_read" ON membership_types FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "membership_types_write" ON membership_types FOR ALL USING (get_user_role() = 'business_ops');

-- ── PACKAGE_TEMPLATES ─────────────────────────────────────────
CREATE POLICY "templates_read" ON package_templates FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "templates_admin_all" ON package_templates FOR ALL USING (
  get_user_role() IN ('admin', 'business_ops')
);

-- ── ROSTER_SHIFT_PRESETS ──────────────────────────────────────
CREATE POLICY "roster_presets_read" ON roster_shift_presets FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "roster_presets_write" ON roster_shift_presets FOR ALL USING (
  get_user_role() IN ('manager', 'business_ops')
);

-- ── NOTIFICATION TABLES ───────────────────────────────────────
CREATE POLICY "leave_decision_notif_read" ON leave_decision_notif FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "leave_decision_notif_insert" ON leave_decision_notif FOR INSERT
  WITH CHECK (get_user_role() IN ('manager', 'business_ops', 'admin'));
CREATE POLICY "leave_decision_notif_update" ON leave_decision_notif FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "pkg_rejection_notif_trainer_read" ON pkg_rejection_notif FOR SELECT USING (trainer_id = auth.uid());
CREATE POLICY "pkg_rejection_notif_manager_insert" ON pkg_rejection_notif FOR INSERT
  WITH CHECK (get_user_role() IN ('manager', 'business_ops'));
CREATE POLICY "pkg_rejection_notif_trainer_update" ON pkg_rejection_notif FOR UPDATE USING (trainer_id = auth.uid());

CREATE POLICY "mem_rejection_notif_seller_read" ON mem_rejection_notif FOR SELECT USING (seller_id = auth.uid());
CREATE POLICY "mem_rejection_notif_manager_insert" ON mem_rejection_notif FOR INSERT
  WITH CHECK (get_user_role() IN ('manager', 'business_ops'));
CREATE POLICY "mem_rejection_notif_seller_update" ON mem_rejection_notif FOR UPDATE USING (seller_id = auth.uid());

CREATE POLICY "cancellation_approved_notif_read" ON cancellation_approved_notif FOR SELECT USING (
  EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'business_ops')
);
CREATE POLICY "user_read_own_rejection_notif" ON cancellation_rejection_notif FOR SELECT USING (notified_user_id = auth.uid());

CREATE POLICY "shift_dispute_notif_read" ON shift_dispute_notif FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "shift_dispute_notif_write" ON shift_dispute_notif FOR ALL USING (
  get_user_role() IN ('business_ops', 'admin')
);

CREATE POLICY "manager_dispute_notif_read" ON manager_dispute_notif FOR SELECT USING (manager_id = auth.uid());
CREATE POLICY "manager_dispute_notif_write" ON manager_dispute_notif FOR ALL USING (
  get_user_role() IN ('business_ops', 'admin')
);

-- ── BIRTHDAY REMINDERS ────────────────────────────────────────
CREATE POLICY "trainer_read_member_birthdays" ON member_birthday_reminders FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'trainer'
    AND (
      (trainer_id IS NULL AND EXISTS (SELECT 1 FROM trainer_gyms tg WHERE tg.trainer_id = auth.uid() AND tg.gym_id = member_birthday_reminders.gym_id))
      OR trainer_id = auth.uid()
    )
  )
);
CREATE POLICY "manager_read_gym_member_birthdays" ON member_birthday_reminders FOR SELECT USING (
  trainer_id IS NULL
  AND EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'manager' AND u.manager_gym_id = member_birthday_reminders.gym_id)
);
CREATE POLICY "staff_read_gym_member_birthdays" ON member_birthday_reminders FOR SELECT USING (
  trainer_id IS NULL
  AND EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'staff' AND u.manager_gym_id = member_birthday_reminders.gym_id)
);

CREATE POLICY "bizops_read_all_birthdays" ON staff_birthday_reminders FOR SELECT USING (
  EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'business_ops')
);
CREATE POLICY "manager_read_own_gym_birthdays" ON staff_birthday_reminders FOR SELECT USING (
  EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'manager' AND u.manager_gym_id = staff_birthday_reminders.gym_id)
);

-- ── CLIENTS ───────────────────────────────────────────────────
CREATE POLICY "clients_read" ON clients FOR SELECT USING (
  get_user_role() IN ('admin', 'manager') OR trainer_id = auth.uid()
);
CREATE POLICY "clients_biz_ops_read" ON clients FOR SELECT USING (get_user_role() = 'business_ops');
CREATE POLICY "clients_trainer_insert" ON clients FOR INSERT WITH CHECK (
  trainer_id = auth.uid()
  AND (
    get_user_role() = 'trainer'
    OR (get_user_role() = 'manager' AND (SELECT is_also_trainer FROM users WHERE id = auth.uid()))
  )
);
CREATE POLICY "clients_update" ON clients FOR UPDATE USING (
  get_user_role() IN ('admin', 'manager') OR trainer_id = auth.uid()
);

-- ── MEMBERSHIP_CANCELLATION_REQUESTS ─────────────────────────
CREATE POLICY "bizops_read_all_cancellation_requests" ON membership_cancellation_requests FOR SELECT USING (
  EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'business_ops')
);
CREATE POLICY "staff_trainer_read_gym_cancellation_requests" ON membership_cancellation_requests FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM users u WHERE u.id = auth.uid()
    AND u.role IN ('staff', 'trainer', 'manager')
    AND (
      u.manager_gym_id = membership_cancellation_requests.gym_id
      OR EXISTS (SELECT 1 FROM trainer_gyms tg WHERE tg.trainer_id = auth.uid() AND tg.gym_id = membership_cancellation_requests.gym_id)
    )
  )
);

-- ── NON_RENEWAL_RECORDS ───────────────────────────────────────
CREATE POLICY "non_renewal_manager_read" ON non_renewal_records FOR SELECT USING (
  get_user_role() IN ('manager', 'business_ops', 'admin')
);
CREATE POLICY "non_renewal_manager_insert" ON non_renewal_records FOR INSERT
  WITH CHECK (get_user_role() = 'manager');

-- ── WHATSAPP ──────────────────────────────────────────────────
CREATE POLICY "whatsapp_admin_manager" ON whatsapp_logs FOR ALL USING (
  get_user_role() IN ('admin', 'manager')
);
CREATE POLICY "wa_notif_config_read" ON whatsapp_notifications_config FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "wa_notif_config_write" ON whatsapp_notifications_config FOR ALL USING (
  get_user_role() IN ('admin', 'business_ops')
);
CREATE POLICY "whatsapp_queue_biz_ops" ON whatsapp_queue FOR ALL USING (
  get_user_role() IN ('business_ops', 'admin', 'manager')
);
CREATE POLICY "templates_read" ON whatsapp_templates FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "templates_write" ON whatsapp_templates FOR ALL USING (get_user_role() = 'business_ops');

-- ── CRON_LOGS ─────────────────────────────────────────────────
CREATE POLICY "admin_read_cron_logs" ON cron_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
);

-- ── CPF_RATES ─────────────────────────────────────────────────
CREATE POLICY "cpf_rates_read" ON cpf_rates FOR SELECT USING (
  get_user_role() IN ('admin', 'business_ops', 'manager')
);
CREATE POLICY "cpf_rates_business_ops_insert" ON cpf_rates FOR INSERT
  WITH CHECK (get_user_role() = 'business_ops');
