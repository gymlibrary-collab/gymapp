import { todaySGT, nowSGT} from '@/lib/utils'
// ============================================================
// src/lib/dashboard.ts — Shared dashboard query functions
//
// PURPOSE:
//   Central repository of all Supabase query functions used by
//   dashboard components. Prevents duplication as the dashboard
//   is split from one large page.tsx into role-specific components.
//
// HOW TO USE:
//   Import only the functions your component needs:
//     import { fetchTodaySessions, fetchNotifications } from '@/lib/dashboard'
//
// ARCHITECTURE:
//   dashboard/page.tsx               — thin router: reads user.role, renders component
//   dashboard/_components/           — role-specific dashboard components (one per role)
//     AdminDashboard.tsx             — 4 queries, system health overview
//     BizOpsDashboard.tsx            — gym overview cards, financials, escalations
//     ManagerDashboard.tsx           — gym ops, packages, members, leave
//     TrainerDashboard.tsx           — own sessions, packages, commission
//     StaffDashboard.tsx             — today's sessions, memberships, notifications
//   lib/dashboard.ts (this file)     — shared query functions called by all components
//   lib/escalation.ts                — escalation check + logging functions
//   lib/pdf.ts                       — PDF generation (payslip, commission, annual)
//
// SUPABASE CLIENT:
//   All functions accept `supabase` as first param (browser client from createClient()).
//   This keeps functions testable and avoids importing the client directly.
//   Always pass the browser client, not the admin client — RLS must apply.
//
// DATA CONVENTIONS:
//   - Dates: ISO strings for Supabase, YYYY-MM-DD for date-only fields
//   - Counts: always return number (never null) — use || 0
//   - Lists: always return any[] (never null) — use || []
//   - All functions are async — always await them
//
// ADDING NEW FUNCTIONS:
//   1. Add JSDoc with @param, @returns, and "Used by" line
//   2. Keep functions single-purpose — one query pattern per function
//   3. Accept options object for optional filters (not positional args)
//   4. Update this header's ARCHITECTURE section if adding new callers
// ============================================================

// ── Date helpers ─────────────────────────────────────────────
// Used throughout dashboard components for consistent date ranges.
// All return ISO strings or YYYY-MM-DD strings as documented.

/** Returns ISO datetime string for start of today (00:00:00 local time) */
export function getTodayStart(): string {
  // SGT — Singapore timezone (UTC+8)
  const now = nowSGT()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
}

/** Returns ISO datetime string for end of today (23:59:59 SGT = 15:59:59 UTC) */
export function getTodayEnd(): string {
  const now = nowSGT()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 15, 59, 59)).toISOString()
}

/** Returns ISO datetime string for the first day of the current month (00:00:00 SGT) */
export function getMonthStart(): string {
  const now = nowSGT()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

/**
 * Returns a YYYY-MM-DD string for N days from today (SGT).
 * Use negative values for past dates (e.g. getDaysFromToday(-30) = 30 days ago).
 * @param days - Number of days offset from today (positive = future, negative = past)
 */
export function getDaysFromToday(days: number): string {
  const now = nowSGT()
  const result = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days))
  return `${result.getUTCFullYear()}-${String(result.getUTCMonth()+1).padStart(2,'0')}-${String(result.getUTCDate()).padStart(2,'0')}`
}

/** Returns today's date as YYYY-MM-DD string */
export function getTodayStr(): string {
  return todaySGT()
}

// ── Session queries ───────────────────────────────────────────

/**
 * Fetches sessions scheduled for today, with member and trainer names.
 * Scope is either a specific trainer (trainer dashboard) or a gym (manager/staff).
 *
 * @param supabase - Browser Supabase client (RLS applies)
 * @param options.gymId - Scope to a specific gym (manager/staff view)
 * @param options.trainerId - Scope to a specific trainer (trainer view, overrides gymId)
 * @param options.todayStart - ISO string for start of today (use getTodayStart())
 * @param options.todayEnd - ISO string for end of today (use getTodayEnd())
 * @returns Array of session records with nested member and trainer names
 *
 * Used by: ManagerDashboard, TrainerDashboard, StaffDashboard
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
 * Fetches the next 5 upcoming sessions (after today, status=scheduled).
 * Scope is either a trainer or a gym/gym list.
 *
 * @param supabase - Browser Supabase client
 * @param options.gymId - Single gym scope (manager/staff)
 * @param options.gymIds - Multiple gym scope (trainer assigned to multiple gyms)
 * @param options.trainerId - Trainer scope (overrides gym options)
 * @param options.todayEnd - ISO string for end of today — sessions after this are "upcoming"
 * @returns Up to 5 upcoming session records with member and trainer names
 *
 * Used by: ManagerDashboard, TrainerDashboard, StaffDashboard
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
 * Fetches all scheduled and completed sessions for the next 14 days.
 * Powers the gym schedule calendar on manager/trainer/staff dashboards.
 *
 * @param supabase - Browser Supabase client
 * @param options.gymId - Single gym (manager/staff)
 * @param options.gymIds - Multiple gyms (trainer assigned to multiple gyms — currently single gym per trainer)
 * @param options.trainerId - Trainer scope (for trainer view)
 * @returns Up to 200 sessions with full member, trainer, and package details
 *
 * Used by: ManagerDashboard, TrainerDashboard, StaffDashboard
 */
export async function fetchGymSchedule(
  supabase: any,
  options: { gymId?: string; gymIds?: string[]; trainerId?: string }
): Promise<any[]> {
  const now = nowSGT()
  const schedStart = getTodayStr() + 'T00:00:00+08:00'
  const schedEnd = getDaysFromToday(14) + 'T23:59:59+08:00'

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
 * Counts completed sessions that have notes submitted but haven't been
 * confirmed by the manager yet. Drives the "pending confirmation" alert badge.
 *
 * @param supabase - Browser Supabase client
 * @param gymId - The manager's assigned gym ID
 * @returns Count of unconfirmed completed sessions
 *
 * Used by: ManagerDashboard
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
 * Fetches active PT packages with few sessions remaining (≤ threshold).
 * Used to warn managers/trainers that a package is about to run out
 * so they can prompt the member to renew.
 *
 * @param supabase - Browser Supabase client
 * @param options.gymId - Gym scope (manager view)
 * @param options.trainerId - Trainer scope (trainer's own packages)
 * @param options.threshold - Max sessions remaining to qualify (default: 3)
 * @param options.limit - Max results to return (default: 10)
 * @returns Package records with member and trainer names, ordered by sessions_used desc
 *
 * Used by: ManagerDashboard, TrainerDashboard
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
 * Fetches active PT packages whose calculated end date falls within the next N days.
 * Used to warn managers/trainers that a package is expiring by time even if
 * sessions haven't been used up.
 *
 * @param supabase - Browser Supabase client
 * @param options.gymId - Gym scope (manager view)
 * @param options.trainerId - Trainer scope
 * @param options.withinDays - Lookahead window in days (default: 7)
 * @param options.limit - Max results (default: 10)
 * @returns Package records ordered by end_date_calculated ascending
 *
 * Used by: ManagerDashboard, TrainerDashboard
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
 * Counts gym membership sales with sale_status = 'pending' (awaiting manager confirmation).
 * Drives the pending memberships alert badge on manager and staff dashboards.
 *
 * @param supabase - Browser Supabase client
 * @param gymId - The gym to count pending sales for
 * @returns Count of pending membership sales
 *
 * Used by: ManagerDashboard, StaffDashboard
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
 * Fetches gym memberships expiring within N days.
 * Two modes controlled by bizOpsOnly:
 *   - Manager view (bizOpsOnly=false): all confirmed active memberships expiring soon
 *   - Biz-ops view (bizOpsOnly=true): only those escalated and not yet actioned
 *
 * Note: Excludes members who have already renewed (have a later end_date membership).
 * Filtering for renewed members must be done client-side after calling this function
 * (see ManagerDashboard for the renewedMemberIds logic).
 *
 * @param supabase - Browser Supabase client
 * @param gymId - The gym to fetch expiring memberships for
 * @param options.withinDays - Lookahead window (default: 30)
 * @param options.bizOpsOnly - If true, only escalated + unactioned (default: false)
 * @param options.limit - Max results (default: 20)
 * @returns Membership records with nested member name
 *
 * Used by: ManagerDashboard, BizOpsDashboard
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
 * Fetches members at churn risk: their PT package expired in the last 30 days
 * and they have not started a new active package.
 *
 * Runs 3 queries:
 *   1. Packages expired in last 30 days for this gym
 *   2. Active packages for those members (to exclude already-renewed)
 *   3. Bulk fetch of last session renewal notes for remaining at-risk packages
 *
 * The renewal_status and non_renewal_reason come from the last session's notes,
 * recorded by the trainer at the end of the package (is_last_session flow).
 *
 * @param supabase - Browser Supabase client
 * @param gymId - The manager's gym
 * @returns Deduplicated list of at-risk members with renewal_status and non_renewal_reason
 *
 * Used by: ManagerDashboard only
 */
export async function fetchAtRiskMembers(
  supabase: any,
  gymId: string
): Promise<any[]> {
  const thirtyDaysAgo = getDaysFromToday(-30)

  const { data: expiredPkgs } = await supabase.from('packages')
    .select('id, member_id, member:members(full_name, phone), end_date_calculated')
    .eq('gym_id', gymId)
    .eq('status', 'expired')
    .gte('end_date_calculated', thirtyDaysAgo)

  if (!expiredPkgs || expiredPkgs.length === 0) return []

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

  // Bulk fetch renewal reasons — one query instead of N
  const { data: atRiskSessions } = await supabase.from('sessions')
    .select('package_id, renewal_status, non_renewal_reason, scheduled_at')
    .in('package_id', atRisk.map((p: any) => p.id))
    .not('renewal_status', 'is', null)
    .order('scheduled_at', { ascending: false })

  return atRisk.map((p: any) => {
    const lastSession = atRiskSessions?.find((s: any) => s.package_id === p.id)
    return { ...p, renewal_status: lastSession?.renewal_status, non_renewal_reason: lastSession?.non_renewal_reason }
  })
}

// ── Commission stats ──────────────────────────────────────────

/**
 * Fetches commission and revenue stats for a given period.
 * Handles both trainer view (session + signup commission) and
 * manager/biz-ops view (membership revenue + commission payouts).
 *
 * @param supabase - Browser Supabase client
 * @param options.userId - The user whose stats to fetch
 * @param options.gymId - Optional gym filter (for manager/biz-ops scoping)
 * @param options.periodStart - ISO string for period start
 * @param options.periodEnd - ISO string for period end
 * @param options.isTrainer - If true, fetches trainer-specific metrics (session + signup commission)
 *                            If false, fetches membership revenue + commission payout totals
 * @returns Object with sessionCommission, signupCommission, membershipRevenue,
 *          membershipSalesCount, totalCommissionPayout, sessCount
 *
 * Used by: TrainerDashboard, ManagerDashboard, BizOpsDashboard
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

  let signupCommission = 0
  if (options.isTrainer) {
    const { data: pkgData } = await supabase.from('packages')
      .select('signup_commission_sgd')
      .eq('trainer_id', options.userId)
      .gte('created_at', options.periodStart)
    signupCommission = pkgData?.reduce((s: number, p: any) => s + (p.signup_commission_sgd || 0), 0) || 0
  }

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
 * Fetches all unread (seen_at IS NULL) notifications for a user.
 * Three types of notifications are checked:
 *   - mem_rejection_notif: manager rejected a membership sale this user submitted
 *   - leave_decision_notif: manager approved or rejected this user's leave application
 *   - pkg_rejection_notif: manager rejected a PT package this trainer submitted
 *
 * Returns empty arrays for roles that don't receive notifications (admin, business_ops).
 *
 * @param supabase - Browser Supabase client
 * @param userId - The authenticated user's ID
 * @param role - The user's role — only trainer/staff/manager receive notifications
 * @returns Object with three arrays: memRejectionNotifs, leaveDecisionNotifs, pkgRejectionNotifs
 *
 * Used by: TrainerDashboard, ManagerDashboard, StaffDashboard
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
 * Marks notifications as seen by setting seen_at to the current timestamp.
 * Called when user dismisses a notification banner.
 *
 * Runs updates sequentially (not parallel) to avoid Supabase connection issues.
 *
 * @param supabase - Browser Supabase client
 * @param type - Which notification table to update:
 *   'leave'          → leave_decision_notif
 *   'mem_rejection'  → mem_rejection_notif
 *   'pkg_rejection'  → pkg_rejection_notif
 * @param ids - Array of notification record IDs to mark as seen
 *
 * Used by: TrainerDashboard, ManagerDashboard, StaffDashboard
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
 * Checks whether the user has a new payslip or commission payout since
 * they last dismissed the notification banner.
 *
 * Logic:
 *   - Fetches the most recent approved/paid payslip and commission payout
 *   - Compares approved_at against the user's seen timestamp (from users table)
 *   - If approved_at > seen timestamp → show notification banner
 *
 * The seen timestamps (payslip_notif_seen_at, commission_notif_seen_at) are
 * stored on the users record and updated when the user clicks dismiss.
 *
 * @param supabase - Browser Supabase client
 * @param userId - The authenticated user's ID
 * @param seenPayslipAt - ISO string of when user last dismissed payslip notif (or null if never)
 * @param seenCommissionAt - ISO string of when user last dismissed commission notif (or null if never)
 * @returns Object with newPayslip and newCommission (null if no new notification)
 *
 * Used by: TrainerDashboard, ManagerDashboard, StaffDashboard
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
    .order('approved_at', { ascending: false }).limit(1).maybeSingle()

  const { data: latestCommission } = await supabase.from('commission_payouts')
    .select('id, period_start, period_end, total_commission_sgd, approved_at')
    .eq('user_id', userId).eq('status', 'approved')
    .order('approved_at', { ascending: false }).limit(1).maybeSingle()

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
 * Counts pending leave applications for staff under a manager's gym.
 * Includes full-time trainers and operations staff — excludes part-timers
 * (part-time staff are not entitled to leave under current business rules).
 *
 * Runs 3 queries:
 *   1. ops staff IDs (role=staff, manager_gym_id=gymId)
 *   2. trainer IDs assigned to this gym via trainer_gyms
 *   3. filter trainers to full-time only, then count pending leave
 *
 * @param supabase - Browser Supabase client
 * @param gymId - The manager's assigned gym
 * @returns Count of pending leave applications across all eligible staff
 *
 * Used by: ManagerDashboard
 */
export async function fetchPendingLeave(
  supabase: any,
  gymId: string,
  excludeUserId?: string
): Promise<number> {
  const { data: opsStaffIds } = await supabase.from('users_safe')
    .select('id').eq('manager_gym_id', gymId).eq('role', 'staff')
    .neq('id', excludeUserId || '')

  const { data: gymTrainerIds } = await supabase.from('trainer_gyms')
    .select('trainer_id').eq('gym_id', gymId)
  const rawTrainerIds = (gymTrainerIds?.map((t: any) => t.trainer_id) || [])
    .filter((id: string) => id !== excludeUserId)
  let ftTrainerIds: string[] = []
  if (rawTrainerIds.length > 0) {
    const { data: ftOnly } = await supabase.from('users_safe')
      .select('id').in('id', rawTrainerIds).eq('role', 'trainer').eq('employment_type', 'full_time')
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
    .or('escalated_to_biz_ops.is.null,escalated_to_biz_ops.eq.false')
  return count || 0
}

// ── Dismiss payslip/commission notification ───────────────────
/**
 * Marks payslip and commission notifications as seen for a user.
 * Called when the user dismisses the payslip/commission banner.
 */
export async function dismissPayslipNotifications(
  supabase: any,
  userId: string
): Promise<void> {
  await supabase
    .from('users')
    .update({
      payslip_notif_seen_at: new Date().toISOString(),
      commission_notif_seen_at: new Date().toISOString(),
    })
    .eq('id', userId)
}

// ============================================================
// getGymStaffIds
//
// PURPOSE:
//   Returns a deduplicated array of user IDs for all staff
//   associated with a gym — trainers via trainer_gyms and
//   ops staff (full-time) via manager_gym_id.
//
//   Used by: reports, leave management, roster, capacity,
//            payroll queries that need gym-scoped staff.
//
// USAGE:
//   const staffIds = await getGymStaffIds(supabase, gymId)
//   if (staffIds.length > 0) query = query.in('user_id', staffIds)
// ============================================================
export async function getGymStaffIds(
  supabase: any,
  gymId: string
): Promise<string[]> {
  const [{ data: tgRows }, { data: staffRows }] = await Promise.all([
    supabase.from('trainer_gyms').select('trainer_id').eq('gym_id', gymId),
    supabase.from('users_safe').select('id').eq('manager_gym_id', gymId).eq('is_archived', false),
  ])
  const trainerIds = (tgRows || []).map((r: any) => r.trainer_id)
  const staffIds   = (staffRows || []).map((r: any) => r.id)
  return Array.from(new Set([...trainerIds, ...staffIds]))
}
