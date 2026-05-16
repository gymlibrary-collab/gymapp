// ============================================================
// GymApp TypeScript Types
// Updated: 16 May 2026 — v90 restructure
// ============================================================

export type UserRole = 'admin' | 'manager' | 'business_ops' | 'trainer' | 'staff'
export type EmploymentType = 'full_time' | 'part_time'
export type PaymentType = 'salary' | 'commission' | 'combined'
export type PackageStatus = 'active' | 'completed' | 'expired' | 'cancelled'
export type SessionStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show'
export type PayslipStatus = 'draft' | 'approved' | 'paid'
export type RosterStatus = 'scheduled' | 'completed' | 'absent' | 'disputed'
export type MembershipSaleStatus = 'pending' | 'confirmed' | 'rejected'
export type CommissionSourceType = 'pt_session' | 'pt_signup' | 'membership'
export type Gender = 'male' | 'female' | 'other' | 'prefer_not_to_say'

// ── Core entities ─────────────────────────────────────────────

export interface Gym {
  id: string
  name: string
  address?: string
  phone?: string
  logo_url?: string
  size_sqft?: number
  date_opened?: string
  is_active: boolean
  fy_start_month: number
  created_at: string
}

export interface User {
  id: string
  full_name: string
  nickname?: string
  email: string
  phone?: string
  role: UserRole
  employment_type: EmploymentType
  manager_gym_id?: string
  is_active: boolean
  is_archived: boolean
  is_also_trainer?: boolean
  hourly_rate?: number
  commission_signup_pct: number
  commission_session_pct: number
  membership_commission_sgd: number
  date_of_birth?: string
  date_of_joining?: string
  nric?: string
  nationality?: string
  address?: string
  leave_entitlement_days: number
  leave_carry_forward_days: number
  medical_leave_entitlement_days: number
  hospitalisation_leave_entitlement_days: number
  max_sessions_per_week?: number
  monthly_session_target?: number
  payslip_notif_seen_at?: string
  commission_notif_seen_at?: string
  archived_at?: string
  created_at: string
  // Relations
  trainer_gyms?: TrainerGym[]
  staff_payroll?: StaffPayroll
}

// users_safe view — non-sensitive cross-staff data
// Excludes: nric, address, salary (hourly_rate included — needed for roster display)
// Includes commission rates: business policy visibility
export interface UserSafe {
  id: string
  full_name: string
  nickname?: string
  email: string
  phone?: string
  nationality?: string
  role: UserRole
  employment_type: EmploymentType
  is_active: boolean
  is_archived: boolean
  is_also_trainer?: boolean
  manager_gym_id?: string
  hourly_rate?: number
  commission_signup_pct: number
  commission_session_pct: number
  membership_commission_sgd: number
  leave_entitlement_days: number
  leave_carry_forward_days: number
  medical_leave_entitlement_days: number
  hospitalisation_leave_entitlement_days: number
  max_sessions_per_week?: number
  monthly_session_target?: number
  payslip_notif_seen_at?: string
  commission_notif_seen_at?: string
  date_of_birth?: string
  date_of_joining?: string
  created_at: string
  archived_at?: string
}

export interface TrainerGym {
  id: string
  trainer_id: string
  gym_id: string
  is_primary: boolean
  assigned_at: string
  gym?: Gym
  trainer?: User
}

// ── Payroll profile ───────────────────────────────────────────

export interface StaffPayroll {
  id: string
  user_id: string
  current_salary?: number
  is_cpf_liable: boolean
  monthly_allowance: number
  allowance_label?: string
  others_monthly_amount: number
  others_label?: string
  others_cpf_liable: boolean
  updated_at: string
  created_at: string
}

// ── Members ───────────────────────────────────────────────────

export interface Member {
  id: string
  gym_id: string
  full_name: string
  phone?: string
  email?: string
  date_of_birth?: string
  gender?: Gender
  created_at: string
  gym?: Gym
}

export interface MembershipType {
  id: string
  gym_id: string
  name: string
  duration_days: number
  price_sgd: number
  is_active: boolean
  created_at: string
}

export interface GymMembership {
  id: string
  gym_id: string
  member_id: string
  membership_type_id?: string
  membership_type_name?: string
  sold_by_user_id?: string
  start_date: string
  end_date?: string
  price_sgd?: number
  commission_sgd: number  // frozen at sale — audit only, paid status on commission_items
  status: string
  sale_status: MembershipSaleStatus
  membership_actioned: boolean
  escalated_to_biz_ops: boolean
  escalated_to_manager: boolean
  escalated_at?: string
  confirmed_at?: string
  confirmed_by?: string
  rejected_at?: string
  rejected_by?: string
  rejection_reason?: string
  cancelled_at?: string
  cancelled_by?: string
  cancellation_reason?: string
  cancellation_end_date?: string
  created_at: string
  member?: Member
  gym?: Gym
  sold_by?: User
}

// ── PT packages and sessions ──────────────────────────────────

export interface PackageTemplate {
  id: string
  gym_id: string
  package_name: string
  total_sessions: number
  price_sgd: number
  validity_days: number
  is_active: boolean
  created_at: string
}

export interface Package {
  id: string
  gym_id: string
  trainer_id?: string
  member_id: string
  secondary_member_id?: string
  package_name: string
  total_sessions: number
  sessions_used: number
  total_price_sgd?: number
  signup_commission_sgd: number  // frozen at creation — audit only
  signup_commission_pct?: number
  // No signup_commission_paid — replaced by commission_items.payslip_id
  status: PackageStatus
  start_date?: string
  end_date_calculated?: string
  manager_confirmed: boolean
  confirmed_at?: string
  confirmed_by?: string
  cancelled_at?: string
  cancelled_by?: string
  cancellation_reason?: string
  created_at: string
  gym?: Gym
  trainer?: User
  member?: Member
}

export interface Session {
  id: string
  gym_id: string
  trainer_id?: string
  member_id?: string
  package_id?: string
  attending_member_id?: string
  is_secondary_member: boolean
  scheduled_at?: string
  duration_minutes: number
  location?: string
  status: SessionStatus
  notes?: string
  performance_notes?: string
  notes_submitted_at?: string
  session_commission_sgd: number  // frozen at mark-complete — audit only
  session_commission_pct?: number
  // No commission_paid — replaced by commission_items.payslip_id
  manager_confirmed: boolean
  confirmed_by?: string
  confirmed_at?: string
  marked_complete_at?: string
  reminder_sent_at?: string
  reminder_scheduled_at?: string
  escalated_to_manager: boolean
  escalated_at?: string
  renewal_status?: 'renewing' | 'not_renewing' | 'undecided'
  renewal_reason?: string
  created_at: string
  gym?: Gym
  trainer?: User
  member?: Member
  package?: Package
}

// ── Commission items (new) ────────────────────────────────────

export interface CommissionItem {
  id: string
  user_id: string
  gym_id?: string
  source_type: CommissionSourceType
  source_id: string            // FK to sessions.id / packages.id / gym_memberships.id
  amount: number               // frozen at confirmation time — never changes
  period_month: number         // SGT month when work was done
  period_year: number          // SGT year when work was done
  payslip_id?: string          // null = unpaid; stamped when commission payslip marked paid
  created_at: string
  // Relations
  payslip?: Payslip
  user?: User
  gym?: Gym
}

// ── Payslips (unified) ────────────────────────────────────────

export interface Payslip {
  id: string
  user_id: string
  gym_id?: string
  period_month: number
  period_year: number
  payment_type: PaymentType
  commission_period_month?: number   // which month's commission is included
  commission_period_year?: number
  employment_type?: EmploymentType
  // Earnings rows (0 when not applicable to this payment_type)
  salary_amount: number              // OW: roster pay or fixed salary
  commission_amount: number          // OW: summed from commission_items
  allowance_amount: number           // OW: from staff_payroll.monthly_allowance
  bonus_amount: number               // AW: annual bonus
  others_amount: number              // OW or non-CPF depending on others_cpf_liable
  others_label?: string
  others_cpf_liable: boolean
  gross_salary: number               // sum of all above
  deduction_amount: number
  deduction_reason?: string
  net_salary: number
  // CPF (frozen at generation)
  is_cpf_liable: boolean
  employee_cpf_rate?: number
  employer_cpf_rate?: number
  ow_ceiling_used?: number
  annual_aw_ceiling_used?: number
  ow_subject_to_cpf?: number         // = capped_ow in DB
  aw_subject_to_cpf?: number
  employee_cpf_amount: number
  employer_cpf_amount: number
  total_employer_cost?: number
  ytd_ow_before?: number
  ytd_aw_before?: number
  low_income_flag: boolean
  cpf_adjustment_note?: string
  // Part-timer specific
  total_hours?: number
  hourly_rate_used?: number
  // Status
  status: PayslipStatus
  notes?: string
  generated_by?: string
  generated_at: string
  approved_by?: string
  approved_at?: string
  paid_at?: string
  created_at: string
  // Relations
  user?: User
  gym?: Gym
}

// ── CPF configuration ─────────────────────────────────────────

export interface CpfAgeBracket {
  id: string
  year: number
  label: string
  age_min: number
  age_max?: number
  employee_rate: number
  employer_rate: number
  ow_ceiling?: number           // monthly OW ceiling for this year
  annual_aw_ceiling?: number    // annual AW ceiling for this year
  effective_from?: string
  created_at: string
}

export interface CpfSubmission {
  id: string
  gym_id?: string
  payroll_month: number
  payroll_year: number
  total_employee_cpf: number
  total_employer_cpf: number
  total_wages: number
  staff_count: number
  status: 'pending' | 'submitted'
  generated_at: string
  submitted_by?: string
  submitted_at?: string
}

// ── Duty roster ───────────────────────────────────────────────

export interface DutyRoster {
  id: string
  user_id: string
  gym_id: string
  shift_date: string
  shift_start: string
  shift_end: string
  hours_worked: number
  hourly_rate: number
  gross_pay: number             // frozen at shift creation: hours × rate
  status: RosterStatus
  is_locked: boolean
  locked_at?: string
  payslip_id?: string           // stamped on payslip generation, cleared ON DELETE SET NULL
  dispute_reason?: string
  disputed_at?: string
  disputed_by?: string
  dispute_resolved_at?: string
  dispute_resolved_by?: string
  created_by?: string
  created_at: string
  user?: User
  gym?: Gym
}

// ── Leave ─────────────────────────────────────────────────────

export interface LeaveApplication {
  id: string
  user_id: string
  leave_type: 'annual' | 'medical' | 'hospitalisation' | 'other'
  start_date: string
  end_date: string
  days_requested: number
  reason?: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  reviewed_by?: string
  reviewed_at?: string
  review_note?: string
  escalated_to_biz_ops: boolean
  escalated_at?: string
  created_at: string
  user?: User
}

// ── App settings ──────────────────────────────────────────────

export interface AppSettings {
  id: string
  app_name: string
  login_logo_url?: string
  admin_sidebar_logo_url?: string
  payslip_logo_url?: string
  company_name?: string
  auto_logout_minutes: number
  leave_reset_year?: number
  max_leave_carry_forward_days: number
  fy_start_month: number
  combined_payslip_enabled: boolean  // once true, cannot be reversed
  // Escalation thresholds
  escalation_leave_hours?: number
  escalation_pt_package_hours?: number
  escalation_pt_session_hours?: number
  escalation_membership_sales_hours?: number
  escalation_membership_expiry_days?: number
  created_at: string
}

// ── Salary history ────────────────────────────────────────────

export interface SalaryHistory {
  id: string
  user_id: string
  changed_by?: string
  old_value?: number
  new_value?: number
  field_name?: string
  changed_at: string
}

// ── Commission config ─────────────────────────────────────────

export interface CommissionConfig {
  id: string
  gym_id: string
  default_signup_pct: number
  default_session_pct: number
  default_membership_commission_sgd: number
  updated_at: string
}
