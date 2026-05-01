// ============================================================
// GymApp — Shared TypeScript Types
// ============================================================

export type UserRole = 'admin' | 'manager' | 'trainer'
export type ClientStatus = 'active' | 'inactive' | 'lost'
export type PackageStatus = 'active' | 'completed' | 'expired' | 'cancelled'
export type SessionStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show'
export type PayoutStatus = 'pending' | 'approved' | 'paid'
export type Gender = 'male' | 'female' | 'other' | 'prefer_not_to_say'

export interface Gym {
  id: string
  name: string
  address?: string
  phone?: string
  is_active: boolean
  created_at: string
}

export interface User {
  id: string
  full_name: string
  email: string
  phone?: string
  role: UserRole
  is_active: boolean
  commission_signup_pct: number
  commission_session_pct: number
  created_at: string
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

export interface PackageTemplate {
  id: string
  name: string
  description?: string
  total_sessions: number
  default_price_sgd: number
  is_active: boolean
  created_by: string
  created_at: string
}

export interface Client {
  id: string
  gym_id: string
  trainer_id: string
  full_name: string
  phone: string
  email?: string
  date_of_birth?: string
  gender?: Gender
  health_notes?: string
  status: ClientStatus
  created_at: string
  gym?: Gym
  trainer?: User
  packages?: Package[]
}

export interface Package {
  id: string
  template_id?: string
  client_id: string
  trainer_id: string
  gym_id: string
  package_name: string
  total_sessions: number
  sessions_used: number
  total_price_sgd: number
  price_per_session_sgd: number
  start_date: string
  end_date?: string
  status: PackageStatus
  signup_commission_pct: number
  signup_commission_sgd: number
  session_commission_pct: number
  signup_commission_paid: boolean
  created_at: string
  client?: Client
  trainer?: User
  gym?: Gym
  sessions?: Session[]
}

export interface Session {
  id: string
  package_id: string
  client_id: string
  trainer_id: string
  gym_id: string
  scheduled_at: string
  duration_minutes: number
  location?: string
  status: SessionStatus
  performance_notes?: string
  session_commission_pct?: number
  session_commission_sgd?: number
  commission_paid: boolean
  marked_complete_by?: string
  marked_complete_at?: string
  reminder_24h_sent: boolean
  reminder_24h_sent_at?: string
  created_at: string
  client?: Client
  trainer?: User
  gym?: Gym
  package?: Package
}

export interface CommissionPayout {
  id: string
  trainer_id: string
  gym_id: string
  month: number
  year: number
  signup_commissions_sgd: number
  session_commissions_sgd: number
  total_commission_sgd: number
  sessions_conducted: number
  new_clients: number
  status: PayoutStatus
  approved_by?: string
  approved_at?: string
  paid_at?: string
  generated_at: string
  trainer?: User
  gym?: Gym
}

export interface WhatsappLog {
  id: string
  session_id: string
  recipient_type: 'trainer' | 'client'
  recipient_phone: string
  message: string
  status: 'sent' | 'failed' | 'pending'
  twilio_sid?: string
  sent_at: string
}

// ============================================================
// Dashboard / Report Types
// ============================================================

export interface MonthlyPayoutReport {
  trainer: User
  gym: Gym
  month: number
  year: number
  sessions: Session[]
  packages: Package[]
  signup_commission_total: number
  session_commission_total: number
  total_commission: number
  sessions_conducted: number
  new_clients: number
}

export interface TrainerPerformance {
  trainer_id: string
  trainer_name: string
  gym_id: string
  gym_name: string
  period: string
  new_clients: number
  retained_clients: number
  lost_clients: number
  revenue: number
  sessions_conducted: number
  top_clients: TopClient[]
}

export interface TopClient {
  client_id: string
  client_name: string
  sessions_completed: number
  total_spent_sgd: number
}

export interface DashboardStats {
  total_clients: number
  active_packages: number
  sessions_this_month: number
  commission_this_month: number
  upcoming_sessions: Session[]
  recent_activity: ActivityItem[]
}

export interface ActivityItem {
  type: 'session_completed' | 'package_assigned' | 'client_added' | 'payout_approved'
  description: string
  timestamp: string
  actor?: string
}
