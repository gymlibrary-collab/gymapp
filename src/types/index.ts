export type UserRole = 'admin' | 'manager' | 'business_ops' | 'trainer' | 'staff'
export type EmploymentType = 'full_time' | 'part_time'
export type ClientStatus = 'active' | 'inactive' | 'lost'
export type PackageStatus = 'active' | 'completed' | 'expired' | 'cancelled'
export type SessionStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show'
export type PayoutStatus = 'draft' | 'approved' | 'paid'
export type RosterStatus = 'scheduled' | 'completed' | 'absent' | 'cancelled'
export type MembershipSaleStatus = 'pending' | 'confirmed' | 'rejected'
export type PayslipStatus = 'draft' | 'approved' | 'paid'
export type Gender = 'male' | 'female' | 'other' | 'prefer_not_to_say'

export interface Gym {
  id: string; name: string; address?: string; phone?: string
  logo_url?: string; size_sqft?: number; date_opened?: string
  is_active: boolean; created_at: string
}

export interface User {
  id: string; full_name: string; email: string; phone?: string
  role: UserRole; employment_type: EmploymentType
  manager_gym_id?: string; is_active: boolean; is_archived: boolean
  archived_at?: string; is_also_trainer?: boolean
  commission_signup_pct: number; commission_session_pct: number
  membership_commission_sgd: number; hourly_rate?: number
  date_of_birth?: string; date_of_joining?: string
  date_of_departure?: string; departure_reason?: string
  nric?: string; nationality?: string; created_at: string
}

export interface TrainerGym {
  id: string; trainer_id: string; gym_id: string
  is_primary: boolean; assigned_at: string; gym?: Gym; trainer?: User
}

export interface PackageTemplate {
  id: string; name: string; description?: string
  total_sessions: number; default_price_sgd: number
  effective_from?: string; is_active: boolean; is_archived: boolean
  archived_at?: string; created_by: string; created_at: string
}

export interface Client {
  id: string; gym_id: string; trainer_id: string
  full_name: string; phone: string; email?: string
  date_of_birth?: string; gender?: Gender; health_notes?: string
  status: ClientStatus; created_at: string
  gym?: Gym; trainer?: User; packages?: Package[]
}

export interface Package {
  id: string; template_id?: string; client_id: string
  trainer_id: string; gym_id: string; package_name: string
  total_sessions: number; sessions_used: number
  total_price_sgd: number; price_per_session_sgd: number
  start_date: string; end_date?: string; status: PackageStatus
  signup_commission_pct: number; signup_commission_sgd: number
  session_commission_pct: number; signup_commission_paid: boolean
  created_at: string; client?: Client; trainer?: User; gym?: Gym
}

export interface Session {
  id: string; package_id: string; client_id: string
  trainer_id: string; gym_id: string; scheduled_at: string
  duration_minutes: number; location?: string; status: SessionStatus
  performance_notes?: string; is_notes_complete: boolean
  notes_submitted_at?: string; session_commission_pct?: number
  session_commission_sgd?: number; commission_paid: boolean
  marked_complete_by?: string; marked_complete_at?: string
  reminder_24h_sent: boolean; created_at: string
  client?: Client; trainer?: User; gym?: Gym; package?: Package
}

export interface DutyRoster {
  id: string; user_id: string; gym_id: string
  shift_date: string; shift_start: string; shift_end: string
  hours_worked: number; hourly_rate: number; gross_pay: number
  status: RosterStatus; is_locked: boolean; locked_at?: string
  whatsapp_reminder_sent: boolean; notes?: string
  created_by: string; created_at: string
  user?: User; gym?: Gym
}

export interface MembershipSale {
  id: string; gym_id: string; sold_by_user_id: string
  member_name: string; member_phone: string; member_email?: string
  membership_number?: string; date_of_joining: string
  membership_type: string; membership_price_sgd: number
  commission_pct: number; commission_sgd: number
  commission_paid: boolean; status: MembershipSaleStatus
  confirmed_by?: string; confirmed_at?: string
  rejection_reason?: string; notes?: string; created_at: string
  sold_by?: User; gym?: Gym
}

export interface CommissionPayout {
  id: string; user_id: string; gym_id: string
  period_start: string; period_end: string
  pt_signup_commission_sgd: number; pt_session_commission_sgd: number
  membership_commission_sgd: number; total_commission_sgd: number
  pt_signups_count: number; pt_sessions_count: number
  membership_sales_count: number; status: PayoutStatus
  approved_by?: string; approved_at?: string; paid_at?: string
  notes?: string; generated_at: string; user?: User; gym?: Gym
}

export interface StaffPayroll {
  id: string; user_id: string; is_cpf_liable: boolean
  current_salary: number; updated_at: string
}

export interface SalaryHistory {
  id: string; user_id: string; salary_amount: number
  effective_from: string
  change_type: 'initial' | 'increment' | 'adjustment' | 'promotion'
  change_amount: number; notes?: string
  created_by: string; created_at: string
}

export interface Payslip {
  id: string; user_id: string; month: number; year: number
  employment_type: EmploymentType
  basic_salary: number; bonus_amount: number; gross_salary: number
  total_hours?: number; hourly_rate_used?: number
  is_cpf_liable: boolean; employee_cpf_rate: number
  employer_cpf_rate: number; employee_cpf_amount: number
  employer_cpf_amount: number; net_salary: number
  total_employer_cost: number; status: PayslipStatus
  approved_by?: string; approved_at?: string; paid_at?: string
  notes?: string; generated_at: string
}

export interface CpfRate {
  id: string; effective_from: string
  employee_rate: number; employer_rate: number
  notes?: string; created_at: string
}

export interface CommissionConfig {
  id: string; config_key: string; config_value: number
  description?: string; updated_at: string
}
