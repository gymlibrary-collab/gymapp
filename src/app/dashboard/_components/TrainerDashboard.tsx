'use client'

// ============================================================
// src/app/dashboard/_components/TrainerDashboard.tsx
//
// PURPOSE:
//   Dashboard for the 'trainer' role (and manager acting as trainer
//   via isActingAsTrainer view mode).
//   Shows today's sessions, commission stats, low/expiring packages,
//   notifications and quick actions.
//
// DATA (12 queries):
//   1. auth + profile
//   2. trainer_gyms — get assigned gym IDs
//   3. sessions (today) — trainer's sessions today
//   4. sessions (upcoming) — next 5
//   5. sessions (gym schedule) — 14-day calendar
//   6. packages (member count) — distinct members with active packages
//   7. packages (active count) — active PT packages
//   8. sessions (stats) — completed this month + commission
//   9. packages (signup commission) — this month
//   10. packages (low sessions) — ≤3 remaining
//   11. packages (expiring) — within 7 days
//   + notifications (payslip, commission, mem rejection, leave, pkg rejection)
//
// ROUTING:
//   Rendered by dashboard/page.tsx when:
//     user.role === 'trainer' OR isActingAsTrainer === true
// ============================================================

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { Clock, Package, AlertCircle, XCircle } from 'lucide-react'
import Link from 'next/link'
import { formatSGD, formatDateTime, getMonthName, formatDate, getGreeting, getDisplayName} from '@/lib/utils'
import NotificationBanners from './NotificationBanners'
import StatsRow from './StatsRow'
import MemberBirthdayCard from './MemberBirthdayCard'
import SessionSchedule from './SessionSchedule'
import QuickActions from './QuickActions'
import {
  getTodayStart, getTodayEnd, getMonthStart, getDaysFromToday, getTodayStr,
  fetchPayslipNotifications, dismissPayslipNotifications, fetchLowSessionPackages, fetchExpiringPackages,
  fetchNotifications, dismissNotifications, fetchUpcomingSessions, fetchCommissionStats,
} from '@/lib/dashboard'
import { PageSpinner } from '@/components/PageSpinner'

interface TrainerDashboardProps {
  user: any
  /** True when a manager is using the "view as trainer" mode */
  isActingAsTrainer?: boolean
}


export default function TrainerDashboard({ user, isActingAsTrainer = false }: TrainerDashboardProps) {
  const supabase = createClient()
  const { logActivity } = useActivityLog()

  const [loading, setLoading] = useState(true)
  const [trainerGymIds, setTrainerGymIds] = useState<string[]>([])
  const [todaySessions, setTodaySessions] = useState<any[]>([])
  const [upcomingSessions, setUpcomingSessions] = useState<any[]>([])
  const [gymScheduleSessions, setGymScheduleSessions] = useState<any[]>([])
  const [calendarOffset, setCalendarOffset] = useState(0)
  const [lowSessionPackages, setLowSessionPackages] = useState<any[]>([])
  const [expiringPackages, setExpiringPackages] = useState<any[]>([])
  const [stats, setStats] = useState<any>({ members: 0, packages: 0, sessions: 0, commission: 0, sessionCommission: 0, signupCommission: 0, membershipRevenue: 0, membershipSalesCount: 0, totalCommissionPayout: 0 })
  const [commissionStats, setCommissionStats] = useState<any>({ total: 0, session: 0, signup: 0, membership: 0 })
  const [commissionLoading, setCommissionLoading] = useState(false)
  const [commissionOffset, setCommissionOffset] = useState(0)
  const [commissionPeriodLabel, setCommissionPeriodLabel] = useState('')
  const [commissionPeriodStart, setCommissionPeriodStart] = useState('')
  const [commissionPeriodEnd, setCommissionPeriodEnd] = useState('')
  const [pendingMemSales, setPendingMemSales] = useState(0)
  const [newPayslip, setNewPayslip] = useState<any>(null)
  const [newCommission, setNewCommission] = useState<any>(null)
  const [memRejectionNotifs, setMemRejectionNotifs] = useState<any[]>([])
  const [leaveDecisionNotifs, setLeaveDecisionNotifs] = useState<any[]>([])
  const [rejectionNotifs, setRejectionNotifs] = useState<any[]>([])
  const [cancelRejectionNotifs, setCancelRejectionNotifs] = useState<any[]>([])

  // ── Commission period calculator ───────────────────────────
  const getCommissionPeriod = (offset: number) => {
    const now = new Date(Date.now() + 8 * 60 * 60 * 1000) // SGT
    const d = new Date(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)
    const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString()
    const label = `${getMonthName(d.getMonth() + 1)} ${d.getFullYear()}`
    return { start, end, label }
  }

  const loadCommissionStats = useCallback(async (offset: number) => {
    setCommissionLoading(true)
    const { start, end, label } = getCommissionPeriod(offset)
    setCommissionPeriodLabel(label)
    setCommissionPeriodStart(start)
    setCommissionPeriodEnd(end)

    const result = await fetchCommissionStats(supabase, {
      userId: user.id, periodStart: start, periodEnd: end, isTrainer: true,
    })
    setCommissionStats({
      total: result.sessionCommission + result.signupCommission,
      session: result.sessionCommission,
      signup: result.signupCommission,
      membership: 0,
    })
    setCommissionLoading(false)
  }, [user.id])

  useEffect(() => {
    loadCommissionStats(commissionOffset)
  }, [commissionOffset, loadCommissionStats])

  useEffect(() => {
    const load = async () => {
      logActivity('page_view', 'Dashboard', 'Trainer dashboard loaded')

      const todayStart = getTodayStart()
      const todayEnd = getTodayEnd()
      const monthStart = getMonthStart()
      const now = new Date(Date.now() + 8 * 60 * 60 * 1000) // SGT

      // ── Trainer gym assignments ────────────────────────────
      const { data: tgRows } = await supabase.from('trainer_gyms').select('gym_id').eq('trainer_id', user.id)
      const gymIds = tgRows?.map((r: any) => r.gym_id) || []
      setTrainerGymIds(gymIds)

      // ── Today's sessions ──────────────────────────────────
      const { data: todayData } = await supabase.from('sessions')
        .select('*, member:members(full_name), trainer:users!sessions_trainer_id_fkey(full_name), package:packages(package_name, sessions_used, total_sessions)')
        .eq('trainer_id', user.id).gte('scheduled_at', todayStart).lte('scheduled_at', todayEnd).order('scheduled_at')
      setTodaySessions(todayData || [])

      // ── Upcoming sessions ──────────────────────────────────
      setUpcomingSessions(await fetchUpcomingSessions(supabase, { trainerId: user.id, todayEnd }))

      // ── Gym schedule ───────────────────────────────────────
      const schedEnd = getDaysFromToday(14) + 'T23:59:59+08:00'
      let schedQ = supabase.from('sessions')
        .select('*, member:members(full_name, phone), trainer:users!sessions_trainer_id_fkey(id, full_name), package:packages(package_name, total_sessions, sessions_used)')
        .in('status', ['scheduled', 'completed'])
        .gte('scheduled_at', getTodayStr() + 'T00:00:00+08:00')
        .lte('scheduled_at', schedEnd).order('scheduled_at').limit(200)
      if (gymIds.length > 0) schedQ = schedQ.in('gym_id', gymIds)
      const { data: schedData } = await schedQ
      setGymScheduleSessions(schedData || [])

      // ── Stats ──────────────────────────────────────────────
      const { data: trainerPkgs } = await supabase.from('packages')
        .select('member_id').eq('trainer_id', user.id).eq('status', 'active')
      const memberCount = new Set(trainerPkgs?.map((p: any) => p.member_id)).size

      const { count: pkgCount } = await supabase.from('packages')
        .select('id', { count: 'exact', head: true }).eq('trainer_id', user.id).eq('status', 'active')

      const { data: sessData } = await supabase.from('sessions')
        .select('session_commission_sgd').eq('trainer_id', user.id).eq('status', 'completed').gte('marked_complete_at', monthStart)
      const sessionCommission = sessData?.reduce((s: number, r: any) => s + (r.session_commission_sgd || 0), 0) || 0

      const { data: signupPkgs } = await supabase.from('packages')
        .select('signup_commission_sgd').eq('trainer_id', user.id).gte('created_at', monthStart)
      const signupCommission = signupPkgs?.reduce((s: number, p: any) => s + (p.signup_commission_sgd || 0), 0) || 0

      setStats({ members: memberCount, packages: pkgCount || 0, sessions: sessData?.length || 0, commission: sessionCommission + signupCommission, sessionCommission, signupCommission, membershipRevenue: 0, membershipSalesCount: 0, totalCommissionPayout: 0 })

      // ── Package alerts ─────────────────────────────────────
      setLowSessionPackages(await fetchLowSessionPackages(supabase, { trainerId: user.id, limit: 10 }))
      setExpiringPackages(await fetchExpiringPackages(supabase, { trainerId: user.id, withinDays: 7, limit: 10 }))

      // ── Pending membership sales ───────────────────────────
      const { count: pendingCount } = await supabase.from('gym_memberships')
        .select('id', { count: 'exact', head: true }).eq('sold_by_user_id', user.id).eq('sale_status', 'pending')
      setPendingMemSales(pendingCount || 0)

      // ── Notifications ──────────────────────────────────────
      const { memRejectionNotifs: memRej, leaveDecisionNotifs: leaveNotifs, pkgRejectionNotifs: pkgRej } =
        await fetchNotifications(supabase, user.id, user.role)
      setMemRejectionNotifs(memRej)
      setLeaveDecisionNotifs(leaveNotifs)
      setRejectionNotifs(pkgRej)

      // ── Cancellation rejection notifications ──────────────
      const { data: cancelRejections } = await supabase.from('cancellation_rejection_notif')
        .select('id, member_name, membership_type, rejection_reason, rejected_by_name, rejected_at')
        .eq('notified_user_id', user.id).is('seen_at', null).order('rejected_at', { ascending: false })
      setCancelRejectionNotifs(cancelRejections || [])

      const { newPayslip: ps, newCommission: pc } = await fetchPayslipNotifications(
        supabase, user.id, user.payslip_notif_seen_at, user.commission_notif_seen_at
      )
      setNewPayslip(ps)
      setNewCommission(pc)

      setLoading(false)
    }
    load()
  }, [isActingAsTrainer])

  const dismissPayslipNotif = async () => {
    await dismissPayslipNotifications(supabase, user.id)
    setNewPayslip(null); setNewCommission(null)
  }
  const dismissMemRejections = async () => {
    await dismissNotifications(supabase, 'mem_rejection', memRejectionNotifs.map((n: any) => n.id))
    setMemRejectionNotifs([])
  }
  const dismissLeaveNotifs = async () => {
    await dismissNotifications(supabase, 'leave', leaveDecisionNotifs.map((n: any) => n.id))
    setLeaveDecisionNotifs([])
  }
  const dismissCancelRejections = async () => {
    const now = new Date().toISOString()
    for (const n of cancelRejectionNotifs) await supabase.from('cancellation_rejection_notif').update({ seen_at: now }).eq('id', n.id)
    setCancelRejectionNotifs([])
  }

  const dismissRejections = async () => {
    await dismissNotifications(supabase, 'pkg_rejection', rejectionNotifs.map((n: any) => n.id))
    setRejectionNotifs([])
  }

  if (loading) return (
    <PageSpinner />
  )

  const todayStr = new Date().toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const totalPackageAlerts = lowSessionPackages.length + expiringPackages.length

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{getGreeting(getDisplayName(user))} 👋</h1>
        <p className="text-sm text-gray-500">{todayStr}</p>
      </div>

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

      <div className="grid grid-cols-3 md:grid-cols-4 gap-3 items-start">
        <div className="col-span-3 md:col-span-3">
          <StatsRow
            stats={stats}
            commissionStats={commissionStats}
            commissionLoading={commissionLoading}
            commissionOffset={commissionOffset}
            onCommissionOffsetChange={setCommissionOffset}
            commissionPeriodLabel={commissionPeriodLabel}
            commissionPeriodStart={commissionPeriodStart}
            commissionPeriodEnd={commissionPeriodEnd}
            isTrainer={true}
            showDrillDown={false}
          />
        </div>
        <div className="col-span-3 md:col-span-1">
          {cancelRejectionNotifs.length > 0 && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800">
              {cancelRejectionNotifs.length} membership cancellation request{cancelRejectionNotifs.length > 1 ? 's' : ''} rejected by manager
            </p>
            <p className="text-xs text-red-600 mt-0.5">
              {cancelRejectionNotifs.map((n: any) => n.member_name).join(', ')}
            </p>
          </div>
          <button onClick={dismissCancelRejections} className="text-xs text-red-600 hover:underline flex-shrink-0">Dismiss</button>
        </div>
      )}

      <MemberBirthdayCard gymId={trainerGymIds[0] || null} />
        </div>
      </div>

      <SessionSchedule
        todaySessions={todaySessions}
        gymScheduleSessions={gymScheduleSessions}
        calendarOffset={calendarOffset}
        onCalendarOffsetChange={setCalendarOffset}
        isTrainer={true}
        isManager={false}
        isBizOps={false}
        showCalendar={true}
      />

      {/* Package alerts */}
      {totalPackageAlerts > 0 && (
        <div className="space-y-3">
          {lowSessionPackages.length > 0 && (
            <div className="card">
              <div className="p-3 border-b border-amber-100 bg-amber-50 rounded-t-xl">
                <p className="text-sm font-medium text-amber-800 flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  {lowSessionPackages.length} Package{lowSessionPackages.length > 1 ? 's' : ''} Running Low
                </p>
              </div>
              <div className="divide-y divide-gray-100">
                {lowSessionPackages.map((pkg: any) => (
                  <div key={pkg.id} className="flex items-center gap-3 p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{pkg.member?.full_name}</p>
                      <p className="text-xs text-gray-500">{pkg.package_name}</p>
                    </div>
                    <span className="text-sm font-bold text-amber-600">{pkg.total_sessions - pkg.sessions_used} left</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {expiringPackages.length > 0 && (
            <div className="card">
              <div className="p-3 border-b border-red-100 bg-red-50 rounded-t-xl">
                <p className="text-sm font-medium text-red-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {expiringPackages.length} Package{expiringPackages.length > 1 ? 's' : ''} Expiring Within 7 Days
                </p>
              </div>
              <div className="divide-y divide-gray-100">
                {expiringPackages.map((pkg: any) => (
                  <div key={pkg.id} className="flex items-center gap-3 p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{pkg.member?.full_name}</p>
                      <p className="text-xs text-gray-500">{pkg.package_name}</p>
                    </div>
                    <span className="text-xs text-red-600 font-medium">Expires {formatDate(pkg.end_date_calculated)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

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
                  <p className="text-xs text-gray-500">{formatDateTime(s.scheduled_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <QuickActions role="trainer" />
    </div>
  )
}
