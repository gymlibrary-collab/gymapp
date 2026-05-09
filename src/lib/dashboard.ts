// ============================================================
// src/lib/dashboard.ts — Shared dashboard query functions
//
// ARCHITECTURE:
//   All reusable query logic for dashboard components lives here.
//   Role-specific components import what they need — no duplication.
//
// USAGE:
//   import { fetchTodaySessions, fetchNotifications } from '@/lib/dashboard'
//   const sessions = await fetchTodaySessions(supabase, gymId, todayStart, todayEnd)
//
// ROUTING CONTEXT:
//   /dashboard/page.tsx          — thin router: reads role, renders component
//   /dashboard/_components/      — role-specific dashboard components
//   Each component calls these functions directly.
// ============================================================

// ── Date helpers ─────────────────────────────────────────────

/** Returns ISO string for start of today (00:00:00) */
export function getTodayStart(): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
}

/** Returns ISO string for end of today (23:59:59) */
export function getTodayEnd(): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString()
}

/** Returns ISO string for start of current month */
export function getMonthStart(): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
}

/** Returns YYYY-MM-DD string N days from today */
export function getDaysFromToday(days: number): string {
  const now = new Date()
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
}

/** Returns today as YYYY-MM-DD */
export function getTodayStr(): string {
  return new Date().toISOString().split('T')[0]
}

// ── Session queries ───────────────────────────────────────────

/**
 * Fetches today's sessions for a gym or trainer.
 * Used by: manager, trainer, staff dashboards.
 */
export async function fetchTodaySessions(
  supabase: any,
  options: { gymId?: string; trainerId?: string; todayStart: string; todayEnd: string }
): Promise<any[]> {
  let q = supabase.from('sessions')
    .select('*, member:members(full_name), trainer:users!sessions_trainer_id_fkey(full_name), package:packages(package_name, sessions_used, total_sessions)')
    .gte('scheduled_at', options.todayStart)
    .lte('scheduled_at', options.todayEnd)
    .order('scheduled_at')

  if (options.trainerId) q = q.eq('trainer_id', options.trainerId)
  else if (options.gymId) q = q.eq('gym_id', options.gymId)

  const { data } = await q
  return data || []
}

/**
 * Fetches upcoming sessions (next 5, after today).
 * Used by: manager, trainer, staff dashboards.
 */
export async function fetchUpcomingSessions(
  supabase: any,
  options: { gymId?: string; gymIds?: string[]; trainerId?: string; todayEnd: string }
): Promise<any[]> {
  let q = supabase.from('sessions')
    .select('*, member:members(full_name), trainer:users!sessions_trainer_id_fkey(full_name)')
    .eq('status', 'scheduled')
    .gt('scheduled_at', options.todayEnd)
    .order('scheduled_at')
    .limit(5)

  if (options.trainerId) q = q.eq('trainer_id', options.trainerId)
  else if (options.gymIds && options.gymIds.length > 0) q = q.in('gym_id', options.gymIds)
  else if (options.gymId) q = q.eq('gym_id', options.gymId)

  const { data } = await q
  return data || []
}

/**
 * Fetches gym schedule — sessions for next 14 days.
 * Used by: manager, trainer, staff dashboards.
 */
export async function fetchGymSchedule(
  supabase: any,
  options: { gymId?: string; gymIds?: string[]; trainerId?: string }
): Promise<any[]> {
  const now = new Date()
  const schedStart = now.toISOString().split('T')[0] + 'T00:00:00'
  const schedEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString()

  let q = supabase.from('sessions')
    .select('*, member:members(full_name, phone), trainer:users!sessions_trainer_id_fkey(id, full_name), package:packages(package_name, total_sessions, sessions_used)')
    .in('status', ['scheduled', 'completed'])
    .gte('scheduled_at', schedStart)
    .lte('scheduled_at', schedEnd)
    .order('scheduled_at')
    .limit(200)

  if (options.trainerId) q = q.eq('trainer_id', options.trainerId)
  else if (options.gymIds && options.gymIds.length > 0) q = q.in('gym_id', options.gymIds)
  else if (options.gymId) q = q.eq('gym_id', options.gymId)

  const { data } = await q
  return data || []
}

/**
 * Fetches count of completed sessions pending manager confirmation.
 * Used by: manager dashboard.
 */
export async function fetchPendingSessionConfirmations(
  supabase: any,
  gymId: string
): Promise<number> {
  const { count } = await supabase.from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('gym_id', gymId)
    .eq('status', 'completed')
    .not('notes_submitted_at', 'is', null)
    .eq('manager_confirmed', false)
  return count || 0
}

// ── Package queries ───────────────────────────────────────────

/**
 * Fetches active packages with ≤ N sessions remaining.
 * Used by: manager, trainer dashboards.
 */
export async function fetchLowSessionPackages(
  supabase: any,
  options: { gymId?: string; trainerId?: string; threshold?: number; limit?: number }
): Promise<any[]> {
  const threshold = options.threshold ?? 3
  const limit = options.limit ?? 10

  let q = supabase.from('packages')
    .select('*, member:members(full_name), trainer:users!packages_trainer_id_fkey(full_name)')
    .eq('status', 'active')
    .filter('total_sessions - sessions_used', 'lte', threshold)
    .order('sessions_used', { ascending: false })
    .limit(limit)

  if (options.trainerId) q = q.eq('trainer_id', options.trainerId)
  else if (options.gymId) q = q.eq('gym_id', options.gymId)

  const { data } = await q
  return data || []
}

/**
 * Fetches active packages expiring within N days.
 * Used by: manager, trainer dashboards.
 */
export async function fetchExpiringPackages(
  supabase: any,
  options: { gymId?: string; trainerId?: string; withinDays?: number; limit?: number }
): Promise<any[]> {
  const withinDays = options.withinDays ?? 7
  const limit = options.limit ?? 10
  const todayStr = getTodayStr()
  const inNDays = getDaysFromToday(withinDays)

  let q = supabase.from('packages')
    .select('*, member:members(full_name), trainer:users!packages_trainer_id_fkey(full_name)')
    .eq('status', 'active')
    .lte('end_date_calculated', inNDays)
    .gte('end_date_calculated', todayStr)
    .order('end_date_calculated')
    .limit(limit)

  if (options.trainerId) q = q.eq('trainer_id', options.trainerId)
  else if (options.gymId) q = q.eq('gym_id', options.gymId)

  const { data } = await q
  return data || []
}

// ── Membership queries ────────────────────────────────────────

/**
 * Fetches count of pending membership sales.
 * Used by: manager, staff dashboards.
 */
export async function fetchPendingMemberships(
  supabase: any,
  gymId: string
): Promise<number> {
  const { count } = await supabase.from('gym_memberships')
    .select('id', { count: 'exact', head: true })
    .eq('gym_id', gymId)
    .eq('sale_status', 'pending')
  return count || 0
}

/**
 * Fetches memberships expiring within N days.
 * bizOpsOnly=true: only escalated + unactioned (for biz-ops view)
 * bizOpsOnly=false: all expiring (for manager view)
 * Used by: manager, biz-ops dashboards.
 */
export async function fetchExpiringMemberships(
  supabase: any,
  gymId: string,
  options: { withinDays?: number; bizOpsOnly?: boolean; limit?: number } = {}
): Promise<any[]> {
  const withinDays = options.withinDays ?? 30
  const limit = options.limit ?? 20
  const todayStr = getTodayStr()
  const inNDays = getDaysFromToday(withinDays)

  let q = supabase.from('gym_memberships')
    .select('id, end_date, member_id, membership_type_name, membership_actioned, escalated_to_biz_ops, member:members(id, full_name)')
    .eq('gym_id', gymId)
    .eq('status', 'active')
    .eq('sale_status', 'confirmed')
    .lte('end_date', inNDays)
    .gte('end_date', todayStr)
    .order('end_date')
    .limit(limit)

  if (options.bizOpsOnly) {
    q = q.eq('escalated_to_biz_ops', true).eq('membership_actioned', false)
  }

  const { data } = await q
  return data || []
}

// ── At-risk members (manager) ─────────────────────────────────

/**
 * Fetches members whose PT packages expired in the last 30 days
 * with no new active package — potential churn risk.
 * Includes non-renewal reason from last session notes.
 * Used by: manager dashboard only.
 */
export async function fetchAtRiskMembers(
  supabase: any,
  gymId: string
): Promise<any[]> {
  const thirtyDaysAgo = getDaysFromToday(-30)

  // Step 1: packages expired in last 30 days
  const { data: expiredPkgs } = await supabase.from('packages')
    .select('id, member_id, member:members(full_name, phone), end_date_calculated')
    .eq('gym_id', gymId)
    .eq('status', 'expired')
    .gte('end_date_calculated', thirtyDaysAgo)

  if (!expiredPkgs || expiredPkgs.length === 0) return []

  // Step 2: exclude members who already have a new active package
  const expiredMemberIds = Array.from(new Set(expiredPkgs.map((p: any) => p.member_id)))
  const { data: activePkgs } = await supabase.from('packages')
    .select('member_id')
    .eq('gym_id', gymId)
    .eq('status', 'active')
    .in('member_id', expiredMemberIds)

  const activeIds = new Set(activePkgs?.map((p: any) => p.member_id))
  const atRisk = expiredPkgs
    .filter((p: any) => !activeIds.has(p.member_id))
    .reduce((acc: any[], p: any) => {
      if (!acc.find((x: any) => x.member_id === p.member_id)) acc.push(p)
      return acc
    }, [])

  if (atRisk.length === 0) return []

  // Step 3: bulk fetch non-renewal reasons from last session notes
  const atRiskPkgIds = atRisk.map((p: any) => p.id)
  const { data: atRiskSessions } = await supabase.from('sessions')
    .select('package_id, renewal_status, non_renewal_reason, scheduled_at')
    .in('package_id', atRiskPkgIds)
    .not('renewal_status', 'is', null)
    .order('scheduled_at', { ascending: false })

  return atRisk.map((p: any) => {
    const lastSession = atRiskSessions?.find((s: any) => s.package_id === p.id)
    return { ...p, renewal_status: lastSession?.renewal_status, non_renewal_reason: lastSession?.non_renewal_reason }
  })
}

// ── Commission stats ──────────────────────────────────────────

/**
 * Fetches commission stats for a period.
 * Used by: trainer, manager, biz-ops dashboards.
 */
export async function fetchCommissionStats(
  supabase: any,
  options: {
    userId: string
    gymId?: string
    periodStart: string
    periodEnd: string
    isTrainer: boolean
  }
): Promise<{
  sessionCommission: number
  signupCommission: number
  membershipRevenue: number
  membershipSalesCount: number
  totalCommissionPayout: number
  sessCount: number
}> {
  // Session commission
  let sessQ = supabase.from('sessions')
    .select('session_commission_sgd')
    .eq('status', 'completed')
    .gte('marked_complete_at', options.periodStart)
    .lte('marked_complete_at', options.periodEnd)
  if (options.isTrainer) sessQ = sessQ.eq('trainer_id', options.userId)
  else if (options.gymId) sessQ = sessQ.eq('gym_id', options.gymId)
  const { data: sessData } = await sessQ
  const sessionCommission = sessData?.reduce((s: number, r: any) => s + (r.session_commission_sgd || 0), 0) || 0
  const sessCount = sessData?.length || 0

  // Signup commission (trainers only)
  let signupCommission = 0
  if (options.isTrainer) {
    let pkgQ = supabase.from('packages')
      .select('signup_commission_sgd')
      .eq('trainer_id', options.userId)
      .gte('created_at', options.periodStart)
    const { data: pkgData } = await pkgQ
    signupCommission = pkgData?.reduce((s: number, p: any) => s + (p.signup_commission_sgd || 0), 0) || 0
  }

  // Membership revenue + payout (non-trainers)
  let membershipRevenue = 0
  let membershipSalesCount = 0
  let totalCommissionPayout = 0
  if (!options.isTrainer) {
    let memQ = supabase.from('gym_memberships')
      .select('price_sgd')
      .eq('sale_status', 'confirmed')
      .gte('created_at', options.periodStart)
    if (options.gymId) memQ = memQ.eq('gym_id', options.gymId)
    const { data: memData } = await memQ
    membershipRevenue = memData?.reduce((s: number, m: any) => s + (m.price_sgd || 0), 0) || 0
    membershipSalesCount = memData?.length || 0

    let payoutQ = supabase.from('commission_payouts')
      .select('total_commission_sgd')
      .in('status', ['approved', 'paid'])
      .gte('generated_at', options.periodStart)
    if (options.gymId) payoutQ = payoutQ.eq('gym_id', options.gymId)
    const { data: payoutData } = await payoutQ
    totalCommissionPayout = payoutData?.reduce((s: number, p: any) => s + (p.total_commission_sgd || 0), 0) || 0
  }

  return { sessionCommission, signupCommission, membershipRevenue, membershipSalesCount, totalCommissionPayout, sessCount }
}

// ── Notifications ─────────────────────────────────────────────

/**
 * Fetches all unread notifications for a user.
 * Used by: trainer, manager, staff dashboards.
 */
export async function fetchNotifications(
  supabase: any,
  userId: string,
  role: string
): Promise<{
  memRejectionNotifs: any[]
  leaveDecisionNotifs: any[]
  pkgRejectionNotifs: any[]
}> {
  const notifRoles = ['trainer', 'staff', 'manager']
  if (!notifRoles.includes(role)) {
    return { memRejectionNotifs: [], leaveDecisionNotifs: [], pkgRejectionNotifs: [] }
  }

  const { data: memRejections } = await supabase.from('mem_rejection_notif')
    .select('id, member_name, membership_type_name, rejection_reason, was_new_member, rejected_by_name, rejected_at')
    .eq('seller_id', userId).is('seen_at', null).order('rejected_at', { ascending: false })

  const { data: leaveNotifs } = await supabase.from('leave_decision_notif')
    .select('id, leave_type, start_date, end_date, days_applied, decision, rejection_reason, decided_by_name')
    .eq('user_id', userId).is('seen_at', null).order('decided_at', { ascending: false })

  const { data: pkgRejections } = await supabase.from('pkg_rejection_notif')
    .select('id, package_name, member_name, rejected_by_name, rejected_at')
    .eq('trainer_id', userId).is('seen_at', null).order('rejected_at', { ascending: false })

  return {
    memRejectionNotifs: memRejections || [],
    leaveDecisionNotifs: leaveNotifs || [],
    pkgRejectionNotifs: pkgRejections || [],
  }
}

/**
 * Dismisses notifications by setting seen_at to now.
 * Used by: trainer, manager, staff dashboards.
 */
export async function dismissNotifications(
  supabase: any,
  type: 'leave' | 'mem_rejection' | 'pkg_rejection',
  ids: string[]
): Promise<void> {
  if (ids.length === 0) return
  const now = new Date().toISOString()
  const tableMap = {
    leave: 'leave_decision_notif',
    mem_rejection: 'mem_rejection_notif',
    pkg_rejection: 'pkg_rejection_notif',
  }
  for (const id of ids) {
    await supabase.from(tableMap[type]).update({ seen_at: now }).eq('id', id)
  }
}

/**
 * Fetches latest payslip and commission payout for payslip/commission
 * notification banners.
 * Used by: trainer, staff, manager dashboards.
 */
export async function fetchPayslipNotifications(
  supabase: any,
  userId: string,
  seenPayslipAt: string | null,
  seenCommissionAt: string | null
): Promise<{ newPayslip: any | null; newCommission: any | null }> {
  const seenPayslip = seenPayslipAt ? new Date(seenPayslipAt) : null
  const seenCommission = seenCommissionAt ? new Date(seenCommissionAt) : null

  const { data: latestPayslip } = await supabase.from('payslips')
    .select('id, month, year, net_salary, approved_at')
    .eq('user_id', userId).in('status', ['approved', 'paid'])
    .order('approved_at', { ascending: false }).limit(1).single()

  const { data: latestCommission } = await supabase.from('commission_payouts')
    .select('id, period_start, period_end, total_commission_sgd, approved_at')
    .eq('user_id', userId).eq('status', 'approved')
    .order('approved_at', { ascending: false }).limit(1).single()

  const newPayslip = latestPayslip?.approved_at &&
    (!seenPayslip || new Date(latestPayslip.approved_at) > seenPayslip)
    ? latestPayslip : null

  const newCommission = latestCommission?.approved_at &&
    (!seenCommission || new Date(latestCommission.approved_at) > seenCommission)
    ? latestCommission : null

  return { newPayslip, newCommission }
}

// ── Pending leave ─────────────────────────────────────────────

/**
 * Fetches count of pending leave applications for a manager's gym.
 * Used by: manager dashboard.
 */
export async function fetchPendingLeave(
  supabase: any,
  gymId: string
): Promise<number> {
  // Full-time staff at this gym
  const { data: opsStaffIds } = await supabase.from('users')
    .select('id').eq('manager_gym_id', gymId).eq('role', 'staff')

  // Full-time trainers at this gym
  const { data: gymTrainerIds } = await supabase.from('trainer_gyms')
    .select('trainer_id').eq('gym_id', gymId)
  const rawTrainerIds = gymTrainerIds?.map((t: any) => t.trainer_id) || []
  let ftTrainerIds: string[] = []
  if (rawTrainerIds.length > 0) {
    const { data: ftOnly } = await supabase.from('users')
      .select('id').in('id', rawTrainerIds).eq('employment_type', 'full_time')
    ftTrainerIds = ftOnly?.map((t: any) => t.id) || []
  }

  const leaveStaffIds = [
    ...(opsStaffIds?.map((s: any) => s.id) || []),
    ...ftTrainerIds,
  ]
  if (leaveStaffIds.length === 0) return 0

  const { count } = await supabase.from('leave_applications')
    .select('id', { count: 'exact', head: true })
    .in('user_id', leaveStaffIds)
    .eq('status', 'pending')
  return count || 0
}
