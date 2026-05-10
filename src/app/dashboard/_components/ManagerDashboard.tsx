'use client'

// ============================================================
// src/app/dashboard/_components/ManagerDashboard.tsx
//
// PURPOSE:
//   Dashboard for the 'manager' role.
//   Shows pending confirmations, birthday panels, stats,
//   commission drill-down, today's sessions, gym schedule,
//   package/membership alerts, and at-risk members.
//
// DATA (23 queries on load):
//   - escalation checks (membership sales + expiry)
//   - today's sessions, upcoming, gym schedule
//   - member/package/session stats
//   - membership revenue + commission payouts
//   - pending memberships + sessions + leave
//   - low session packages, expiring packages
//   - membership expiry escalation + expiring memberships
//   - at-risk members (bulk N+1 fix applied)
//   - notifications (payslip, commission, rejection, leave)
//
// ACTION HANDLERS:
//   handleNonRenewal — records non-renewal + marks membership actioned
//   loadCommissionStats — loads commission for selected period
//   loadDrillDown — loads commission breakdown by staff or type
//   dismiss* — marks notification banners as seen
//
// ROUTING:
//   Rendered by dashboard/page.tsx when:
//     user.role === 'manager' AND isActingAsTrainer === false
// ============================================================

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Clock } from 'lucide-react'
import Link from 'next/link'
import { formatSGD, formatDateTime, getMonthName } from '@/lib/utils'
import NotificationBanners from './NotificationBanners'
import NonRenewalModal from './NonRenewalModal'
import StatsRow from './StatsRow'
import CommissionDrillDownModal from './CommissionDrillDownModal'
import SessionSchedule from './SessionSchedule'
import ManagerAlertsSection from './ManagerAlertsSection'
import PendingConfirmationsBanner from './PendingConfirmationsBanner'
import StaffBirthdayPanel from './StaffBirthdayPanel'
import MemberBirthdayCard from './MemberBirthdayCard'
import { getTodayStart, getTodayEnd, getMonthStart, getDaysFromToday, getTodayStr, fetchPayslipNotifications } from '@/lib/dashboard'

interface ManagerDashboardProps {
  user: any
}

function getGreeting(firstName: string): string {
  const hour = new Date().getHours()
  if (hour < 12) return `Good morning, ${firstName}`
  if (hour < 18) return `Good afternoon, ${firstName}`
  return `Good evening, ${firstName}`
}

export default function ManagerDashboard({ user }: ManagerDashboardProps) {
  const supabase = createClient()
  const gymId = user.manager_gym_id

  const [loading, setLoading] = useState(true)
  const [todaySessions, setTodaySessions] = useState<any[]>([])
  const [upcomingSessions, setUpcomingSessions] = useState<any[]>([])
  const [gymScheduleSessions, setGymScheduleSessions] = useState<any[]>([])
  const [calendarOffset, setCalendarOffset] = useState(0)
  const [stats, setStats] = useState<any>({ members: 0, packages: 0, sessions: 0, commission: 0, sessionCommission: 0, signupCommission: 0, membershipRevenue: 0, membershipSalesCount: 0, totalCommissionPayout: 0 })
  const [commissionStats, setCommissionStats] = useState<any>({ session: 0, signup: 0, membership: 0, total: 0 })
  const [commissionLoading, setCommissionLoading] = useState(false)
  const [commissionOffset, setCommissionOffset] = useState(0)
  const [commissionPeriodLabel, setCommissionPeriodLabel] = useState('')
  const [commissionPeriodStart, setCommissionPeriodStart] = useState('')
  const [commissionPeriodEnd, setCommissionPeriodEnd] = useState('')
  const [commissionDrillDown, setCommissionDrillDown] = useState(false)
  const [drillDownData, setDrillDownData] = useState<any[]>([])
  const [drillDownLoading, setDrillDownLoading] = useState(false)
  const [drillDownGroupBy, setDrillDownGroupBy] = useState<'staff' | 'type'>('staff')
  const [pendingMemberships, setPendingMemberships] = useState(0)
  const [pendingSessions, setPendingSessions] = useState(0)
  const [pendingLeave, setPendingLeave] = useState(0)
  const [lowSessionPackages, setLowSessionPackages] = useState<any[]>([])
  const [expiringPackages, setExpiringPackages] = useState<any[]>([])
  const [expiringMemberships, setExpiringMemberships] = useState<any[]>([])
  const [atRiskMembers, setAtRiskMembers] = useState<any[]>([])
  const [nonRenewalModal, setNonRenewalModal] = useState<any>(null)
  const [nonRenewalReason, setNonRenewalReason] = useState('')
  const [nonRenewalOther, setNonRenewalOther] = useState('')
  const [nonRenewalSaving, setNonRenewalSaving] = useState(false)
  const [pendingMemSales, setPendingMemSales] = useState(0)
  const [newPayslip, setNewPayslip] = useState<any>(null)
  const [newCommission, setNewCommission] = useState<any>(null)
  const [memRejectionNotifs, setMemRejectionNotifs] = useState<any[]>([])
  const [leaveDecisionNotifs, setLeaveDecisionNotifs] = useState<any[]>([])
  const [rejectionNotifs, setRejectionNotifs] = useState<any[]>([])

  // ── Commission period loader ───────────────────────────────
  const loadCommissionStats = useCallback(async (periodStart: string, periodEnd: string) => {
    setCommissionLoading(true)
    const d = new Date(periodStart)
    setCommissionPeriodLabel(`${getMonthName(d.getMonth() + 1)} ${d.getFullYear()}`)
    setCommissionPeriodStart(periodStart)
    setCommissionPeriodEnd(periodEnd)

    if (!gymId) { setCommissionLoading(false); return }

    const { data: sessSales } = await supabase.from('sessions')
      .select('session_commission_sgd').eq('gym_id', gymId).eq('status', 'completed')
      .not('notes_submitted_at', 'is', null).eq('manager_confirmed', true)
      .gte('marked_complete_at', periodStart).lte('marked_complete_at', periodEnd)
    const sessionComm = sessSales?.reduce((s: number, r: any) => s + (r.session_commission_sgd || 0), 0) || 0

    const { data: pkgSales } = await supabase.from('packages')
      .select('signup_commission_sgd').eq('gym_id', gymId).eq('manager_confirmed', true)
      .gte('created_at', periodStart).lte('created_at', periodEnd)
    const signupComm = pkgSales?.reduce((s: number, p: any) => s + (p.signup_commission_sgd || 0), 0) || 0

    const { data: memSales } = await supabase.from('gym_memberships')
      .select('commission_sgd').eq('gym_id', gymId).eq('sale_status', 'confirmed')
      .gte('created_at', periodStart).lte('created_at', periodEnd)
    const membershipComm = memSales?.reduce((s: number, m: any) => s + (m.commission_sgd || 0), 0) || 0

    setCommissionStats({ session: sessionComm, signup: signupComm, membership: membershipComm, total: sessionComm + signupComm + membershipComm })
    setCommissionLoading(false)
  }, [gymId])

  // ── Commission drill-down loader ──────────────────────────
  const loadDrillDown = useCallback(async (periodStart: string, periodEnd: string, groupBy: 'staff' | 'type') => {
    setDrillDownLoading(true)
    fetch('/api/activity-log', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: user.id, user_name: user.full_name, role: user.role, action_type: 'other', page: 'Commission Breakdown', description: `Viewed commission breakdown by ${groupBy}` }),
    }).catch(() => {})

    let sessQ = supabase.from('sessions')
      .select('session_commission_sgd, trainer_id, trainer:users!sessions_trainer_id_fkey(full_name)')
      .eq('status', 'completed').not('notes_submitted_at', 'is', null).eq('manager_confirmed', true)
      .gte('marked_complete_at', periodStart).lte('marked_complete_at', periodEnd)
    if (gymId) sessQ = sessQ.eq('gym_id', gymId)
    const sessData = await sessQ

    let pkgQ = supabase.from('packages')
      .select('signup_commission_sgd, trainer_id, trainer:users!packages_trainer_id_fkey(full_name)')
      .eq('manager_confirmed', true).gte('created_at', periodStart).lte('created_at', periodEnd)
    if (gymId) pkgQ = pkgQ.eq('gym_id', gymId)
    const pkgData = await pkgQ

    let memQ = supabase.from('gym_memberships')
      .select('commission_sgd, sold_by_user_id, sold_by:users!gym_memberships_sold_by_user_id_fkey(full_name)')
      .eq('sale_status', 'confirmed').gte('created_at', periodStart).lte('created_at', periodEnd)
    if (gymId) memQ = memQ.eq('gym_id', gymId)
    const memData = await memQ

    if (groupBy === 'staff') {
      const byStaff: Record<string, any> = {}
      sessData.data?.forEach((s: any) => {
        const id = s.trainer_id; const name = s.trainer?.full_name || 'Unknown'
        if (!byStaff[id]) byStaff[id] = { name, session: 0, signup: 0, membership: 0, total: 0 }
        byStaff[id].session += s.session_commission_sgd || 0
        byStaff[id].total += s.session_commission_sgd || 0
      })
      pkgData.data?.forEach((p: any) => {
        const id = p.trainer_id; const name = p.trainer?.full_name || 'Unknown'
        if (!byStaff[id]) byStaff[id] = { name, session: 0, signup: 0, membership: 0, total: 0 }
        byStaff[id].signup += p.signup_commission_sgd || 0
        byStaff[id].total += p.signup_commission_sgd || 0
      })
      memData.data?.forEach((m: any) => {
        const id = m.sold_by_user_id; const name = m.sold_by?.full_name || 'Unknown'
        if (!byStaff[id]) byStaff[id] = { name, session: 0, signup: 0, membership: 0, total: 0 }
        byStaff[id].membership += m.commission_sgd || 0
        byStaff[id].total += m.commission_sgd || 0
      })
      setDrillDownData(Object.values(byStaff).sort((a, b) => b.total - a.total))
    } else {
      const totSession = sessData.data?.reduce((s: number, r: any) => s + (r.session_commission_sgd || 0), 0) || 0
      const totSignup = pkgData.data?.reduce((s: number, p: any) => s + (p.signup_commission_sgd || 0), 0) || 0
      const totMem = memData.data?.reduce((s: number, m: any) => s + (m.commission_sgd || 0), 0) || 0
      setDrillDownData([
        { name: 'PT Session', amount: totSession, count: sessData.data?.length || 0 },
        { name: 'PT Signup', amount: totSignup, count: pkgData.data?.length || 0 },
        { name: 'Membership Sales', amount: totMem, count: memData.data?.length || 0 },
      ])
    }
    setDrillDownLoading(false)
  }, [gymId])

  // ── Commission offset reload ───────────────────────────────
  useEffect(() => {
    const d = new Date()
    const periodDate = new Date(d.getFullYear(), d.getMonth() + commissionOffset, 1)
    const periodStart = periodDate.toISOString()
    const periodEnd = new Date(d.getFullYear(), d.getMonth() + commissionOffset + 1, 0, 23, 59, 59).toISOString()
    loadCommissionStats(periodStart, periodEnd)
    if (commissionDrillDown) loadDrillDown(periodStart, periodEnd, drillDownGroupBy)
  }, [commissionOffset, loadCommissionStats])

  // ── Main data load ─────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      if (!gymId) { setLoading(false); return }

      const todayStart = getTodayStart()
      const todayEnd = getTodayEnd()
      const monthStart = getMonthStart()
      const now = new Date()

      // ── Escalation checks ────────────────────────────────
      // Membership sales + expiry escalation now handled by daily cron jobs:
      //   /api/cron/escalate-membership-sales      (0103 SGT)
      //   /api/cron/escalate-expiring-memberships  (0102 SGT)

      // ── Today's sessions ──────────────────────────────────
      const { data: todayData } = await supabase.from('sessions')
        .select('*, member:members(full_name), trainer:users!sessions_trainer_id_fkey(full_name), package:packages(package_name, sessions_used, total_sessions)')
        .eq('gym_id', gymId).gte('scheduled_at', todayStart).lte('scheduled_at', todayEnd).order('scheduled_at')
      setTodaySessions(todayData || [])

      // ── Upcoming sessions ──────────────────────────────────
      const { data: upData } = await supabase.from('sessions')
        .select('*, member:members(full_name), trainer:users!sessions_trainer_id_fkey(full_name)')
        .eq('gym_id', gymId).eq('status', 'scheduled').gt('scheduled_at', todayEnd).order('scheduled_at').limit(5)
      setUpcomingSessions(upData || [])

      // ── Gym schedule ───────────────────────────────────────
      const schedEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString()
      const { data: schedData } = await supabase.from('sessions')
        .select('*, member:members(full_name, phone), trainer:users!sessions_trainer_id_fkey(id, full_name), package:packages(package_name, total_sessions, sessions_used)')
        .in('status', ['scheduled', 'completed']).eq('gym_id', gymId)
        .gte('scheduled_at', now.toISOString().split('T')[0] + 'T00:00:00')
        .lte('scheduled_at', schedEnd).order('scheduled_at').limit(200)
      setGymScheduleSessions(schedData || [])

      // ── Stats ──────────────────────────────────────────────
      const { count: memberCount } = await supabase.from('members').select('id', { count: 'exact', head: true }).eq('gym_id', gymId)
      const { count: pkgCount } = await supabase.from('packages').select('id', { count: 'exact', head: true }).eq('gym_id', gymId).eq('status', 'active')
      const { data: sessData } = await supabase.from('sessions').select('session_commission_sgd').eq('gym_id', gymId).eq('status', 'completed').gte('marked_complete_at', monthStart)
      const { data: memSalesData } = await supabase.from('gym_memberships').select('price_sgd, commission_sgd').eq('gym_id', gymId).eq('sale_status', 'confirmed').gte('created_at', monthStart)
      const { data: payoutData } = await supabase.from('commission_payouts').select('total_commission_sgd').eq('gym_id', gymId).in('status', ['approved', 'paid']).gte('generated_at', monthStart)

      const membershipRevenue = memSalesData?.reduce((s: number, m: any) => s + (m.price_sgd || 0), 0) || 0
      const totalCommissionPayout = payoutData?.reduce((s: number, p: any) => s + (p.total_commission_sgd || 0), 0) || 0
      setStats({ members: memberCount || 0, packages: pkgCount || 0, sessions: sessData?.length || 0, commission: 0, sessionCommission: 0, signupCommission: 0, membershipRevenue, membershipSalesCount: memSalesData?.length || 0, totalCommissionPayout })

      // ── Pending confirmations ──────────────────────────────
      const { count: memPending } = await supabase.from('gym_memberships').select('id', { count: 'exact', head: true }).eq('gym_id', gymId).eq('sale_status', 'pending')
      setPendingMemberships(memPending || 0)
      const { count: sessPending } = await supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('gym_id', gymId).eq('status', 'completed').not('notes_submitted_at', 'is', null).eq('manager_confirmed', false)
      setPendingSessions(sessPending || 0)

      // ── Package alerts ─────────────────────────────────────
      const { data: lowPkgs } = await supabase.from('packages')
        .select('*, member:members(full_name), trainer:users!packages_trainer_id_fkey(full_name)')
        .eq('gym_id', gymId).eq('status', 'active').filter('total_sessions - sessions_used', 'lte', 3)
        .order('sessions_used', { ascending: false }).limit(10)
      setLowSessionPackages(lowPkgs || [])

      const { data: expPkgs } = await supabase.from('packages')
        .select('*, member:members(full_name), trainer:users!packages_trainer_id_fkey(full_name)')
        .eq('gym_id', gymId).eq('status', 'active')
        .lte('end_date_calculated', getDaysFromToday(7)).gte('end_date_calculated', getTodayStr())
        .order('end_date_calculated').limit(10)
      setExpiringPackages(expPkgs || [])

      // Membership expiry escalation is now handled by the daily cron
      // at /api/cron/expire-memberships (runs at 0001 SGT).

      // ── Expiring memberships ───────────────────────────────
      const in30Days = getDaysFromToday(30)
      const { data: expiringMems } = await supabase.from('gym_memberships')
        .select('id, end_date, member_id, membership_type_name, membership_actioned, escalated_to_biz_ops, member:members(id, full_name)')
        .eq('gym_id', gymId).eq('status', 'active').eq('sale_status', 'confirmed')
        .lte('end_date', in30Days).gte('end_date', todayStr).order('end_date').limit(20)
      const renewedIds = new Set(
        (expiringMems || []).filter((m: any) => (expiringMems || []).some((m2: any) => m2.member_id === m.member_id && new Date(m2.end_date) > new Date(m.end_date))).map((m: any) => m.member_id)
      )
      setExpiringMemberships((expiringMems || []).filter((m: any) => !renewedIds.has(m.member_id)).slice(0, 10))

      // ── At-risk members ────────────────────────────────────
      const thirtyDaysAgo = getDaysFromToday(-30)
      const { data: expiredPkgs } = await supabase.from('packages')
        .select('id, member_id, member:members(full_name, phone), end_date_calculated')
        .eq('gym_id', gymId).eq('status', 'expired').gte('end_date_calculated', thirtyDaysAgo)
      if (expiredPkgs && expiredPkgs.length > 0) {
        const expiredMemberIds = Array.from(new Set(expiredPkgs.map((p: any) => p.member_id)))
        const { data: activePkgs } = await supabase.from('packages').select('member_id').eq('gym_id', gymId).eq('status', 'active').in('member_id', expiredMemberIds)
        const activeIds = new Set(activePkgs?.map((p: any) => p.member_id))
        const atRisk = expiredPkgs.filter((p: any) => !activeIds.has(p.member_id))
          .reduce((acc: any[], p: any) => { if (!acc.find((x: any) => x.member_id === p.member_id)) acc.push(p); return acc }, [])
        if (atRisk.length > 0) {
          const { data: atRiskSessions } = await supabase.from('sessions')
            .select('package_id, renewal_status, non_renewal_reason, scheduled_at')
            .in('package_id', atRisk.map((p: any) => p.id)).not('renewal_status', 'is', null)
            .order('scheduled_at', { ascending: false })
          setAtRiskMembers(atRisk.map((p: any) => {
            const last = atRiskSessions?.find((s: any) => s.package_id === p.id)
            return { ...p, renewal_status: last?.renewal_status, non_renewal_reason: last?.non_renewal_reason }
          }))
        }
      }

      // ── Pending leave ──────────────────────────────────────
      const { data: leaveOpsStaff } = await supabase.from('users').select('id').eq('manager_gym_id', gymId).eq('role', 'staff').neq('id', user.id)
      const { data: leaveGymTrainers } = await supabase.from('trainer_gyms').select('trainer_id').eq('gym_id', gymId)
      const leaveRawIds = (leaveGymTrainers?.map((t: any) => t.trainer_id) || []).filter((id: string) => id !== user.id)
      let leaveFtIds: string[] = []
      if (leaveRawIds.length > 0) {
        const { data: ftOnly } = await supabase.from('users').select('id').in('id', leaveRawIds).eq('role', 'trainer').eq('employment_type', 'full_time')
        leaveFtIds = ftOnly?.map((t: any) => t.id) || []
      }
      const leaveStaffIds = [...(leaveOpsStaff?.map((s: any) => s.id) || []), ...leaveFtIds]
      if (leaveStaffIds.length > 0) {
        const { count: leavePending } = await supabase.from('leave_applications').select('id', { count: 'exact', head: true }).in('user_id', leaveStaffIds).eq('status', 'pending')
        setPendingLeave(leavePending || 0)
      }

      // ── Pending membership sales ───────────────────────────
      const { count: pendingCount } = await supabase.from('gym_memberships').select('id', { count: 'exact', head: true }).eq('sold_by_user_id', user.id).eq('sale_status', 'pending')
      setPendingMemSales(pendingCount || 0)

      // ── Notifications ──────────────────────────────────────
      const { data: memRejections } = await supabase.from('mem_rejection_notif')
        .select('id, member_name, membership_type_name, rejection_reason, was_new_member, rejected_by_name, rejected_at')
        .eq('seller_id', user.id).is('seen_at', null).order('rejected_at', { ascending: false })
      setMemRejectionNotifs(memRejections || [])

      const { data: leaveNotifs } = await supabase.from('leave_decision_notif')
        .select('id, leave_type, start_date, end_date, days_applied, decision, rejection_reason, decided_by_name')
        .eq('user_id', user.id).is('seen_at', null).order('decided_at', { ascending: false })
      setLeaveDecisionNotifs(leaveNotifs || [])

      const { data: pkgRejections } = await supabase.from('pkg_rejection_notif')
        .select('id, package_name, member_name, rejected_by_name, rejected_at')
        .eq('trainer_id', user.id).is('seen_at', null).order('rejected_at', { ascending: false })
      setRejectionNotifs(pkgRejections || [])

      const { newPayslip: ps, newCommission: pc } = await fetchPayslipNotifications(supabase, user.id, user.payslip_notif_seen_at, user.commission_notif_seen_at)
      setNewPayslip(ps)
      setNewCommission(pc)

      setLoading(false)
    }
    load()
  }, [])

  // ── Action handlers ────────────────────────────────────────
  const handleNonRenewal = async () => {
    if (!nonRenewalModal || !nonRenewalReason) return
    if (nonRenewalReason === 'Other' && !nonRenewalOther.trim()) return
    setNonRenewalSaving(true)
    const { error: err } = await supabase.from('non_renewal_records').insert({
      member_id: nonRenewalModal.member_id, gym_membership_id: nonRenewalModal.id,
      gym_id: nonRenewalModal.gym_id || null, reason: nonRenewalReason,
      reason_other: nonRenewalReason === 'Other' ? nonRenewalOther.trim() : null, recorded_by: user.id,
    })
    if (err) { setNonRenewalSaving(false); return }
    await supabase.from('gym_memberships').update({ membership_actioned: true }).eq('id', nonRenewalModal.id)
    fetch('/api/activity-log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: user.id, user_name: user.full_name, role: user.role, action_type: 'update', page: 'Dashboard', description: 'Recorded membership non-renewal from dashboard' }) }).catch(() => {})
    setExpiringMemberships(prev => prev.map((m: any) => m.id === nonRenewalModal.id ? { ...m, membership_actioned: true } : m))
    setNonRenewalModal(null); setNonRenewalSaving(false)
  }
  const dismissPayslipNotif = async () => {
    await supabase.from('users').update({ payslip_notif_seen_at: new Date().toISOString(), commission_notif_seen_at: new Date().toISOString() }).eq('id', user.id)
    setNewPayslip(null); setNewCommission(null)
  }
  const dismissLeaveNotifs = async () => {
    const now = new Date().toISOString()
    for (const n of leaveDecisionNotifs) await supabase.from('leave_decision_notif').update({ seen_at: now }).eq('id', n.id)
    setLeaveDecisionNotifs([])
  }
  const dismissMemRejections = async () => {
    const now = new Date().toISOString()
    for (const n of memRejectionNotifs) await supabase.from('mem_rejection_notif').update({ seen_at: now }).eq('id', n.id)
    setMemRejectionNotifs([])
  }
  const dismissRejections = async () => {
    const now = new Date().toISOString()
    for (const n of rejectionNotifs) await supabase.from('pkg_rejection_notif').update({ seen_at: now }).eq('id', n.id)
    setRejectionNotifs([])
  }

  if (loading) return <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600" /></div>

  const todayStr = new Date().toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const totalAlerts = lowSessionPackages.length + expiringPackages.length + atRiskMembers.length

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{getGreeting(user.full_name.split(' ')[0])} 👋</h1>
        <p className="text-sm text-gray-500">{todayStr}</p>
      </div>

      <PendingConfirmationsBanner
        pendingMemberships={pendingMemberships}
        pendingSessions={pendingSessions}
        pendingLeave={pendingLeave}
      />

      <StaffBirthdayPanel gymId={gymId} isBizOps={false} />

      <MemberBirthdayCard gymId={gymId} trainerGymIds={[]} role={user.role} userId={user.id} />

      <NotificationBanners
        newPayslip={newPayslip}
        newCommission={newCommission}
        onDismissPayslipNotif={dismissPayslipNotif}
        pkgRejectionNotifs={rejectionNotifs}
        onDismissPkgRejections={dismissRejections}
        leaveDecisionNotifs={leaveDecisionNotifs}
        onDismissLeaveNotifs={dismissLeaveNotifs}
        memRejectionNotifs={memRejectionNotifs}
        onDismissMemRejections={dismissMemRejections}
        pendingMemSales={pendingMemSales}
        isBizOps={false}
      />

      <NonRenewalModal
        membership={nonRenewalModal}
        reason={nonRenewalReason}
        onReasonChange={setNonRenewalReason}
        otherText={nonRenewalOther}
        onOtherTextChange={setNonRenewalOther}
        saving={nonRenewalSaving}
        onConfirm={handleNonRenewal}
        onClose={() => setNonRenewalModal(null)}
      />

      <StatsRow
        stats={stats}
        commissionStats={commissionStats}
        commissionLoading={commissionLoading}
        commissionOffset={commissionOffset}
        onCommissionOffsetChange={setCommissionOffset}
        commissionPeriodLabel={commissionPeriodLabel}
        commissionPeriodStart={commissionPeriodStart}
        commissionPeriodEnd={commissionPeriodEnd}
        isTrainer={false}
        showDrillDown={true}
        onDrillDown={() => { setCommissionDrillDown(true); setDrillDownGroupBy('staff'); loadDrillDown(commissionPeriodStart, commissionPeriodEnd, 'staff') }}
      />

      <CommissionDrillDownModal
        open={commissionDrillDown}
        periodLabel={commissionPeriodLabel}
        groupBy={drillDownGroupBy}
        onGroupByChange={(opt) => { setDrillDownGroupBy(opt); loadDrillDown(commissionPeriodStart, commissionPeriodEnd, opt) }}
        loading={drillDownLoading}
        data={drillDownData}
        onClose={() => setCommissionDrillDown(false)}
      />

      <SessionSchedule
        todaySessions={todaySessions}
        gymScheduleSessions={gymScheduleSessions}
        calendarOffset={calendarOffset}
        onCalendarOffsetChange={setCalendarOffset}
        isTrainer={false}
        isManager={true}
        isBizOps={false}
        showCalendar={true}
      />

      <ManagerAlertsSection
        totalAlerts={totalAlerts}
        lowSessionPackages={lowSessionPackages}
        expiringMemberships={expiringMemberships}
        expiringPackages={expiringPackages}
        atRiskMembers={atRiskMembers}
        onNonRenewal={(m) => { setNonRenewalModal(m); setNonRenewalReason(''); setNonRenewalOther('') }}
      />

      {upcomingSessions.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 text-sm">Upcoming Sessions</h2>
            <Link href="/dashboard/pt/sessions" className="text-xs text-red-600 font-medium">View all</Link>
          </div>
          <div className="divide-y divide-gray-100">
            {upcomingSessions.map((s: any) => (
              <div key={s.id} className="flex items-center gap-3 p-4">
                <div className="bg-red-50 p-2 rounded-lg flex-shrink-0"><Clock className="w-4 h-4 text-red-600" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{s.member?.full_name}</p>
                  <p className="text-xs text-gray-500">{formatDateTime(s.scheduled_at)} · {s.trainer?.full_name}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
