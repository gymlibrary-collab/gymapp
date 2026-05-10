'use client'

// ============================================================
// src/app/dashboard/_components/StaffDashboard.tsx
//
// PURPOSE:
//   Dashboard for the 'staff' role (ops/sales staff).
//   Shows today's sessions, stats, notifications and quick actions.
//
// DATA (8 queries):
//   1. auth.getUser + users — auth + profile
//   2. sessions (today) — today's schedule for their gym
//   3. sessions (upcoming) — next 5 sessions
//   4. sessions (gym schedule) — 14-day calendar
//   5. members count — active members at gym
//   6. packages count — active PT packages at gym
//   7. sessions (stats) — completed sessions this month
//   8. gym_memberships (stats) — membership sales this month
//   + notifications (payslip, commission, mem rejection, leave, pkg rejection)
//   + membership sales escalation check
//   + pending membership sales count
//
// ROUTING:
//   Rendered by dashboard/page.tsx when user.role === 'staff'
// ============================================================

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { Clock, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { formatSGD, formatDateTime, getMonthName, cn } from '@/lib/utils'
import NotificationBanners from './NotificationBanners'
import StatsRow from './StatsRow'
import SessionSchedule from './SessionSchedule'
import QuickActions from './QuickActions'
import {
  getTodayStart, getTodayEnd, getMonthStart,
  fetchPayslipNotifications, fetchNotifications, dismissNotifications, fetchUpcomingSessions,
} from '@/lib/dashboard'

interface StaffDashboardProps {
  user: any
}

function getGreeting(firstName: string): string {
  const hour = new Date().getHours()
  if (hour < 12) return `Good morning, ${firstName}`
  if (hour < 18) return `Good afternoon, ${firstName}`
  return `Good evening, ${firstName}`
}

export default function StaffDashboard({ user }: StaffDashboardProps) {
  const supabase = createClient()
  const { logActivity } = useActivityLog()

  const [loading, setLoading] = useState(true)
  const [todaySessions, setTodaySessions] = useState<any[]>([])
  const [upcomingSessions, setUpcomingSessions] = useState<any[]>([])
  const [gymScheduleSessions, setGymScheduleSessions] = useState<any[]>([])
  const [calendarOffset, setCalendarOffset] = useState(0)
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

  const gymId = user.manager_gym_id

  // ── Commission period loader ───────────────────────────────
  const loadCommissionStats = useCallback(async (offset: number) => {
    setCommissionLoading(true)
    const now = new Date()
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString()
    setCommissionPeriodLabel(`${getMonthName(d.getMonth() + 1)} ${d.getFullYear()}`)
    setCommissionPeriodStart(start)
    setCommissionPeriodEnd(end)

    // Staff earn commission from membership sales only
    const { data: memData } = await supabase.from('gym_memberships')
      .select('commission_sgd')
      .eq('sold_by_user_id', user.id)
      .eq('sale_status', 'confirmed')
      .gte('created_at', start)
      .lte('created_at', end)
    const membership = memData?.reduce((s: number, m: any) => s + (m.commission_sgd || 0), 0) || 0
    setCommissionStats({ total: membership, session: 0, signup: 0, membership })
    setCommissionLoading(false)
  }, [user.id])

  useEffect(() => { loadCommissionStats(commissionOffset) }, [commissionOffset, loadCommissionStats])

  useEffect(() => {
    const load = async () => {
      logActivity('page_view', 'Dashboard', 'Staff dashboard loaded')

      const todayStart = getTodayStart()
      const todayEnd = getTodayEnd()
      const monthStart = getMonthStart()
      const now = new Date()

      // Membership sales escalation is now handled by the daily cron
      // at /api/cron/escalate-membership-sales (runs at 0103 SGT).

      // ── Today's sessions ──────────────────────────────────
      if (gymId) {
        const { data: todayData } = await supabase.from('sessions')
          .select('*, member:members(full_name), trainer:users!sessions_trainer_id_fkey(full_name), package:packages(package_name, sessions_used, total_sessions)')
          .eq('gym_id', gymId).gte('scheduled_at', todayStart).lte('scheduled_at', todayEnd).order('scheduled_at')
        setTodaySessions(todayData || [])

        // ── Upcoming sessions ──────────────────────────────
        setUpcomingSessions(await fetchUpcomingSessions(supabase, { gymId, todayEnd }))

        // ── Gym schedule ───────────────────────────────────
        const schedEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString()
        const { data: schedData } = await supabase.from('sessions')
          .select('*, member:members(full_name, phone), trainer:users!sessions_trainer_id_fkey(id, full_name), package:packages(package_name, total_sessions, sessions_used)')
          .in('status', ['scheduled', 'completed'])
          .gte('scheduled_at', now.toISOString().split('T')[0] + 'T00:00:00')
          .lte('scheduled_at', schedEnd).order('scheduled_at').limit(200)
          .eq('gym_id', gymId)
        setGymScheduleSessions(schedData || [])

        // ── Stats ──────────────────────────────────────────
        const { count: memberCount } = await supabase.from('members')
          .select('id', { count: 'exact', head: true }).eq('gym_id', gymId)
        const { count: pkgCount } = await supabase.from('packages')
          .select('id', { count: 'exact', head: true }).eq('gym_id', gymId).eq('status', 'active')
        const { data: sessData } = await supabase.from('sessions')
          .select('session_commission_sgd').eq('gym_id', gymId).eq('status', 'completed').gte('marked_complete_at', monthStart)
        const { data: memSalesData } = await supabase.from('gym_memberships')
          .select('price_sgd').eq('gym_id', gymId).eq('sale_status', 'confirmed').gte('created_at', monthStart)

        setStats({
          members: memberCount || 0,
          packages: pkgCount || 0,
          sessions: sessData?.length || 0,
          commission: 0,
          sessionCommission: 0,
          signupCommission: 0,
          membershipRevenue: memSalesData?.reduce((s: number, m: any) => s + (m.price_sgd || 0), 0) || 0,
          membershipSalesCount: memSalesData?.length || 0,
          totalCommissionPayout: 0,
        })
      }

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

      const { newPayslip: ps, newCommission: pc } = await fetchPayslipNotifications(
        supabase, user.id, user.payslip_notif_seen_at, user.commission_notif_seen_at
      )
      setNewPayslip(ps)
      setNewCommission(pc)

      setLoading(false)
    }
    load()
  }, [])

  const dismissPayslipNotif = async () => {
    await supabase.from('users').update({ payslip_notif_seen_at: new Date().toISOString(), commission_notif_seen_at: new Date().toISOString() }).eq('id', user.id)
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
  const dismissRejections = async () => {
    await dismissNotifications(supabase, 'pkg_rejection', rejectionNotifs.map((n: any) => n.id))
    setRejectionNotifs([])
  }

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600" />
    </div>
  )

  const todayStr = new Date().toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{getGreeting(user.full_name.split(' ')[0])} 👋</h1>
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
        showDrillDown={false}
      />

      <SessionSchedule
        todaySessions={todaySessions}
        gymScheduleSessions={gymScheduleSessions}
        calendarOffset={calendarOffset}
        onCalendarOffsetChange={setCalendarOffset}
        isTrainer={false}
        isManager={false}
        isBizOps={false}
        showCalendar={true}
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

      <QuickActions role="staff" />
    </div>
  )
}
