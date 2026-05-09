'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { loadEscalationThresholds, runEscalationCheck, logEscalation } from '@/lib/escalation'
import { useViewMode } from '@/lib/view-mode-context'
import { formatSGD, formatDateTime, formatDate, getMonthName } from '@/lib/utils'
import {
  Users, Building2, Settings, ChevronRight, CheckCircle, ChevronDown, ChevronUp,
  Clock, DollarSign, Briefcase, UserCheck, Dumbbell, Shield,
  CreditCard, Calendar, Package, AlertTriangle, AlertCircle,
  TrendingUp, UserX, Bell, FileText, Gift, X } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import AdminDashboard from './_components/AdminDashboard'
import NotificationBanners from './_components/NotificationBanners'
import NonRenewalModal from './_components/NonRenewalModal'




// Biz Ops action alerts: pending manager leave + public holidays setup prompt
function BizOpsDashboardAlerts() {
  const [pendingLeave, setPendingLeave] = useState(0)
  const [holidaysSetUp, setHolidaysSetUp] = useState(true)
  const [cpfRatesSetUp, setCpfRatesSetUp] = useState(true)
  const [leaveEntitlementReminder, setLeaveEntitlementReminder] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      // Pending leave: managers awaiting biz ops approval
      const { data: managers } = await supabase.from('users').select('id').eq('role', 'manager')
      const mgrIds = managers?.map((m: any) => m.id) || []
      if (mgrIds.length > 0) {
        const { count } = await supabase.from('leave_applications')
          .select('id', { count: 'exact', head: true })
          .in('user_id', mgrIds).eq('status', 'pending')
        setPendingLeave(count || 0)
      }

      // Check if next year public holidays are set up (prompt from 15 Nov through 31 Dec)
      const now = new Date()
      // Nov 15 onwards in November, OR any day in December.
      // Previous && logic created a 14-day blind spot from Dec 1–14.
      const isYearEndPromptWindow = now.getMonth() === 11 // 1 Dec through 31 Dec
      if (isYearEndPromptWindow) {
        const nextYear = now.getFullYear() + 1
        const { count } = await supabase.from('public_holidays')
          .select('id', { count: 'exact', head: true }).eq('year', nextYear)
        setHolidaysSetUp((count || 0) > 0)

        // Check if CPF age bracket rates have been configured for next year.
        // SG has 5 age brackets (≤55, 55–60, 60–65, 65–70, >70) — require all 5
        // explicitly effective from Jan 1 next year, otherwise the prompt stays.
        const nextYearDate = `${nextYear}-01-01`
        const { count: cpfCount } = await supabase.from('cpf_age_brackets')
          .select('id', { count: 'exact', head: true })
          .eq('effective_from', nextYearDate)
        setCpfRatesSetUp((cpfCount || 0) >= 5)

        // Remind Biz Ops to review leave entitlements for all staff for the new year
        setLeaveEntitlementReminder(true)
      }
    }
    load()
  }, [])

  if (pendingLeave === 0 && holidaysSetUp && cpfRatesSetUp && !leaveEntitlementReminder) return null

  return (
    <div className="space-y-3">
      {pendingLeave > 0 && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <Calendar className="w-5 h-5 text-blue-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-800">
              {pendingLeave} manager leave application{pendingLeave > 1 ? 's' : ''} awaiting your approval
            </p>
          </div>
          <Link href="/dashboard/hr/leave" className="btn-primary text-xs py-1.5 flex-shrink-0">Review</Link>
        </div>
      )}
      {!cpfRatesSetUp && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">
              Action required — {new Date().getFullYear() + 1} CPF age bracket rates not yet configured
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Update CPF rates effective from 1 Jan {new Date().getFullYear() + 1} before processing payroll.
            </p>
          </div>
          <Link href="/dashboard/payroll/cpf" className="btn-primary text-xs py-1.5 flex-shrink-0">Update</Link>
        </div>
      )}
      {!holidaysSetUp && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">
              Action required — {new Date().getFullYear() + 1} public holidays not yet configured
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Set up next year's public holidays so leave calculations remain accurate.
            </p>
          </div>
          <Link href="/dashboard/config/public-holidays" className="btn-primary text-xs py-1.5 flex-shrink-0">Set Up</Link>
        </div>
      )}
      {leaveEntitlementReminder && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">
              Reminder — review staff leave entitlements for {new Date().getFullYear() + 1}
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Update each staff member's annual leave days before the new year begins.
            </p>
          </div>
          <Link href="/dashboard/hr/staff" className="btn-primary text-xs py-1.5 flex-shrink-0">Review</Link>
        </div>
      )}
    </div>
  )
}

// Per-gym operational activity for Business Ops dashboard
function BizOpsGymTabs() {
  const [gyms, setGyms] = useState<any[]>([])
  const [selectedGym, setSelectedGym] = useState<string | null>(null)
  const [bizCommOffset, setBizCommOffset] = useState(0)
  const [bizCommStats, setBizCommStats] = useState<any>({ session: 0, signup: 0, membership: 0, total: 0 })
  const [bizCommLoading, setBizCommLoading] = useState(false)
  const [bizDrillDown, setBizDrillDown] = useState(false)
  const [bizDrillGym, setBizDrillGym] = useState<string | null>(null)
  const [bizDrillGroupBy, setBizDrillGroupBy] = useState<'staff' | 'type'>('staff')
  const [bizDrillData, setBizDrillData] = useState<any[]>([])
  const [bizDrillLoading, setBizDrillLoading] = useState(false)
  const supabase = createClient()
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString()
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  // Commission period for Biz Ops tile
  const bizCommPeriodDate = new Date(now.getFullYear(), now.getMonth() + bizCommOffset, 1)
  const bizCommPeriodStart = bizCommPeriodDate.toISOString()
  const bizCommPeriodEnd = new Date(now.getFullYear(), now.getMonth() + bizCommOffset + 1, 0, 23, 59, 59).toISOString()
  const bizCommPeriodLabel = bizCommPeriodDate.toLocaleDateString('en-SG', { month: 'long', year: 'numeric' })

  useEffect(() => {
    const load = async () => {
      const { data: gymsData } = await supabase.from('gyms').select('id, name').eq('is_active', true).order('name')

      // Hoist queries that are identical for every gym — run once, not N times
      const bizOpsThresholds = await loadEscalationThresholds(supabase)
      const { data: { user: bizOpsUserHoisted } } = await supabase.auth.getUser()
      const { data: bizMeHoisted } = await supabase.from('users')
        .select('full_name, role').eq('id', bizOpsUserHoisted?.id || '').single()

      // ── Bulk queries for all gyms at once ────────────────────
      // Replaces 10×N per-gym queries with 10 bulk IN() queries.
      // runEscalationCheck (write operation) stays per-gym.
      const gymIds = (gymsData || []).map((g: any) => g.id)
      const todayStr = now.toISOString().split('T')[0]
      const in30DaysBizOps = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

      const [
        { data: allTodaySessions },
        { data: allPendingMems },
        { data: allPendingSessions },
        { data: allLowPkgs },
        { data: allExpiringPkgs },
        { data: allExpiringMems },
        { data: allMembers },
        { data: allMemSales },
        { data: allSessions },
        { data: allPayouts },
      ] = await Promise.all([
        supabase.from('sessions')
          .select('gym_id, scheduled_at, status, member:members(full_name), trainer:users!sessions_trainer_id_fkey(full_name)')
          .in('gym_id', gymIds).gte('scheduled_at', todayStart).lte('scheduled_at', todayEnd).order('scheduled_at'),
        supabase.from('gym_memberships')
          .select('gym_id')
          .in('gym_id', gymIds).eq('sale_status', 'pending'),
        supabase.from('sessions')
          .select('gym_id')
          .in('gym_id', gymIds).eq('status', 'completed').not('notes_submitted_at', 'is', null).eq('manager_confirmed', false),
        supabase.from('packages')
          .select('gym_id, package_name, sessions_used, total_sessions, member:members(full_name)')
          .in('gym_id', gymIds).eq('status', 'active').limit(200),
        supabase.from('packages')
          .select('gym_id, package_name, end_date_calculated, member:members(full_name)')
          .in('gym_id', gymIds).eq('status', 'active')
          .lte('end_date_calculated', in7Days).gte('end_date_calculated', todayStr).limit(50),
        supabase.from('gym_memberships')
          .select('gym_id, id, end_date, member_id, membership_type_name, membership_actioned, escalated_to_biz_ops, member:members(full_name)')
          .in('gym_id', gymIds).eq('status', 'active').eq('sale_status', 'confirmed')
          .eq('escalated_to_biz_ops', true).eq('membership_actioned', false)
          .lte('end_date', in30DaysBizOps).gte('end_date', todayStr),
        supabase.from('members')
          .select('gym_id')
          .in('gym_id', gymIds),
        supabase.from('gym_memberships')
          .select('gym_id, price_sgd')
          .in('gym_id', gymIds).eq('sale_status', 'confirmed').gte('created_at', monthStart),
        supabase.from('sessions')
          .select('gym_id, session_commission_sgd')
          .in('gym_id', gymIds).eq('status', 'completed').gte('marked_complete_at', monthStart),
        supabase.from('commission_payouts')
          .select('gym_id, total_commission_sgd')
          .in('gym_id', gymIds).in('status', ['approved', 'paid']).gte('generated_at', monthStart),
      ])

      // ── Per-gym assembly + escalation check ───────────────────
      // Note: Promise.all is used above for pure reads only.
      // runEscalationCheck (write op) stays sequential per gym.
      const enriched: any[] = []
      for (const g of (gymsData || [])) {
        const gId = g.id

        // Group bulk results by gym_id
        const todaySessions   = (allTodaySessions || []).filter((s: any) => s.gym_id === gId)
        const pendingMems     = (allPendingMems || []).filter((s: any) => s.gym_id === gId).length
        const pendingSess     = (allPendingSessions || []).filter((s: any) => s.gym_id === gId).length
        const lowPkgs         = (allLowPkgs || []).filter((p: any) => p.gym_id === gId && (p.total_sessions - p.sessions_used) <= 3).slice(0, 5)
        const expiringPkgs    = (allExpiringPkgs || []).filter((p: any) => p.gym_id === gId).slice(0, 5)
        const filteredExpiringMems = (allExpiringMems || []).filter((m: any) => m.gym_id === gId).slice(0, 10)
        const memberCount     = (allMembers || []).filter((m: any) => m.gym_id === gId).length
        const gymMemSales     = (allMemSales || []).filter((m: any) => m.gym_id === gId)
        const gymSessions     = (allSessions || []).filter((s: any) => s.gym_id === gId)
        const gymPayouts      = (allPayouts || []).filter((p: any) => p.gym_id === gId)

        // Escalation check — write op, must stay sequential
        const expiryCount = await runEscalationCheck(supabase, 'membership_expiry', bizOpsThresholds.membership_expiry, 'system', gId)
        if (expiryCount > 0) {
          await logEscalation((bizMeHoisted as any)?.full_name || 'Biz Ops', (bizMeHoisted as any)?.role || 'business_ops', bizOpsUserHoisted?.id || '', 'membership_expiry', expiryCount)
        }

        const totalAlerts = pendingMems + pendingSess + lowPkgs.length + expiringPkgs.length + filteredExpiringMems.length

        enriched.push({
          ...g,
          todaySessions,
          pendingMemberships: pendingMems,
          pendingSessions:    pendingSess,
          lowPkgs,
          expiringPkgs,
          expiringMems:       filteredExpiringMems,
          totalAlerts,
          members:            memberCount,
          membershipSalesCount: gymMemSales.length,
          membershipRevenue:  gymMemSales.reduce((s: number, m: any) => s + (m.price_sgd || 0), 0),
          sessionsCount:      gymSessions.length,
          commissionPayout:   gymPayouts.reduce((s: number, p: any) => s + (p.total_commission_sgd || 0), 0),
        })
      }

      setGyms(enriched)
      // Auto-select gym with most alerts, or first gym
      const topGym = enriched.reduce((a: any, b: any) => b.totalAlerts > a.totalAlerts ? b : a, enriched[0])
      setSelectedGym(topGym?.id || enriched[0]?.id || null)
    }
    load()
  }, [])

  // Load Biz Ops commission stats when period or gym changes
  useEffect(() => {
    const loadBizComm = async () => {
      setBizCommLoading(true)
      const gymFilter = bizDrillGym || undefined

      // Sequential awaits — no Promise.all with Supabase
      let sessQ = supabase.from('sessions').select('session_commission_sgd')
        .eq('status', 'completed').not('notes_submitted_at', 'is', null).eq('manager_confirmed', true)
        .gte('marked_complete_at', bizCommPeriodStart).lte('marked_complete_at', bizCommPeriodEnd)
      if (gymFilter) sessQ = sessQ.eq('gym_id', gymFilter)
      const sessData = await sessQ

      let pkgQ = supabase.from('packages').select('signup_commission_sgd')
        .eq('manager_confirmed', true)
        .gte('created_at', bizCommPeriodStart).lte('created_at', bizCommPeriodEnd)
      if (gymFilter) pkgQ = pkgQ.eq('gym_id', gymFilter)
      const pkgData = await pkgQ

      let memQ = supabase.from('gym_memberships').select('commission_sgd')
        .eq('sale_status', 'confirmed')
        .gte('created_at', bizCommPeriodStart).lte('created_at', bizCommPeriodEnd)
      if (gymFilter) memQ = memQ.eq('gym_id', gymFilter)
      const memData = await memQ

      const s = sessData.data?.reduce((a: number, r: any) => a + (r.session_commission_sgd || 0), 0) || 0
      const p = pkgData.data?.reduce((a: number, r: any) => a + (r.signup_commission_sgd || 0), 0) || 0
      const m = memData.data?.reduce((a: number, r: any) => a + (r.commission_sgd || 0), 0) || 0
      setBizCommStats({ session: s, signup: p, membership: m, total: s + p + m })
      setBizCommLoading(false)
    }
    loadBizComm()
  }, [bizCommOffset, bizDrillGym])

  const loadBizDrillDown = async (gymId?: string, groupBy: 'staff' | 'type' = 'staff') => {
    setBizDrillLoading(true)

    // Log drill-down access
    fetch('/api/activity-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_type: 'other', page: 'Commission Breakdown', description: `Biz Ops viewed commission breakdown by ${groupBy}${gymId ? ' for selected gym' : ' across all gyms'}` }),
    }).catch(() => {})

    // Sequential awaits — no Promise.all with Supabase
    let sessQ = supabase.from('sessions')
      .select('session_commission_sgd, trainer_id, trainer:users!sessions_trainer_id_fkey(full_name), gym_id')
      .eq('status', 'completed').not('notes_submitted_at', 'is', null).eq('manager_confirmed', true)
      .gte('marked_complete_at', bizCommPeriodStart).lte('marked_complete_at', bizCommPeriodEnd)
    if (gymId) sessQ = sessQ.eq('gym_id', gymId)
    const sessData = await sessQ

    let pkgQ = supabase.from('packages')
      .select('signup_commission_sgd, trainer_id, trainer:users!packages_trainer_id_fkey(full_name), gym_id')
      .eq('manager_confirmed', true)
      .gte('created_at', bizCommPeriodStart).lte('created_at', bizCommPeriodEnd)
    if (gymId) pkgQ = pkgQ.eq('gym_id', gymId)
    const pkgData = await pkgQ

    let memQ = supabase.from('gym_memberships')
      .select('commission_sgd, sold_by_user_id, sold_by:users!gym_memberships_sold_by_user_id_fkey(full_name), gym_id')
      .eq('sale_status', 'confirmed')
      .gte('created_at', bizCommPeriodStart).lte('created_at', bizCommPeriodEnd)
    if (gymId) memQ = memQ.eq('gym_id', gymId)
    const memData = await memQ
    if (groupBy === 'staff') {
      const byStaff: Record<string, any> = {}
      sessData.data?.forEach((s: any) => {
        const id = s.trainer_id; if (!id) return
        if (!byStaff[id]) byStaff[id] = { name: s.trainer?.full_name || 'Unknown', session: 0, signup: 0, membership: 0, total: 0 }
        byStaff[id].session += s.session_commission_sgd || 0; byStaff[id].total += s.session_commission_sgd || 0
      })
      pkgData.data?.forEach((p: any) => {
        const id = p.trainer_id; if (!id) return
        if (!byStaff[id]) byStaff[id] = { name: p.trainer?.full_name || 'Unknown', session: 0, signup: 0, membership: 0, total: 0 }
        byStaff[id].signup += p.signup_commission_sgd || 0; byStaff[id].total += p.signup_commission_sgd || 0
      })
      memData.data?.forEach((m: any) => {
        const id = m.sold_by_user_id; if (!id) return
        if (!byStaff[id]) byStaff[id] = { name: m.sold_by?.full_name || 'Unknown', session: 0, signup: 0, membership: 0, total: 0 }
        byStaff[id].membership += m.commission_sgd || 0; byStaff[id].total += m.commission_sgd || 0
      })
      setBizDrillData(Object.values(byStaff).sort((a: any, b: any) => b.total - a.total))
    } else {
      setBizDrillData([
        { name: 'PT Session', amount: sessData.data?.reduce((a: number, r: any) => a + (r.session_commission_sgd || 0), 0) || 0, count: sessData.data?.length || 0 },
        { name: 'PT Signup', amount: pkgData.data?.reduce((a: number, r: any) => a + (r.signup_commission_sgd || 0), 0) || 0, count: pkgData.data?.length || 0 },
        { name: 'Membership', amount: memData.data?.reduce((a: number, r: any) => a + (r.commission_sgd || 0), 0) || 0, count: memData.data?.length || 0 },
      ])
    }
    setBizDrillLoading(false)
  }


  // Reload drill-down when month offset changes while modal is open
  useEffect(() => {
    if (bizDrillDown) {
      loadBizDrillDown(bizDrillGym || undefined, bizDrillGroupBy)
    }
  }, [bizCommOffset])


  if (gyms.length === 0) return null
  const g = gyms.find(x => x.id === selectedGym) || gyms[0]
  const monthName = now.toLocaleString('default', { month: 'long' })
  const totals = gyms.reduce((acc, g) => ({
    members: acc.members + g.members,
    membershipRevenue: acc.membershipRevenue + g.membershipRevenue,
    sessionsCount: acc.sessionsCount + g.sessionsCount,
    commissionPayout: acc.commissionPayout + g.commissionPayout,
  }), { members: 0, membershipRevenue: 0, sessionsCount: 0, commissionPayout: 0 })

  return (
    <div className="space-y-3">
      {/* Biz Ops commission drill-down modal */}
      {bizDrillDown && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-16 overflow-y-auto" onClick={() => setBizDrillDown(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">Commission Breakdown</h3>
                <p className="text-xs text-gray-400">{bizCommPeriodLabel} · {bizDrillGym ? gyms.find(g => g.id === bizDrillGym)?.name || 'Selected gym' : 'All gyms'}</p>
              </div>
              <button onClick={() => setBizDrillDown(false)}><X className="w-4 h-4 text-gray-400" /></button>
            </div>
            {/* Gym filter */}
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => { setBizDrillGym(null); loadBizDrillDown(undefined, bizDrillGroupBy) }}
                className={cn('text-xs px-3 py-1 rounded-full border', !bizDrillGym ? 'bg-red-600 text-white border-red-600' : 'text-gray-600 border-gray-200')}>
                All gyms
              </button>
              {gyms.map((gym: any) => (
                <button key={gym.id} onClick={() => { setBizDrillGym(gym.id); loadBizDrillDown(gym.id, bizDrillGroupBy) }}
                  className={cn('text-xs px-3 py-1 rounded-full border', bizDrillGym === gym.id ? 'bg-red-600 text-white border-red-600' : 'text-gray-600 border-gray-200')}>
                  {gym.name}
                </button>
              ))}
            </div>
            {/* Group by toggle */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
              {(['staff', 'type'] as const).map(opt => (
                <button key={opt} onClick={() => { setBizDrillGroupBy(opt); loadBizDrillDown(bizDrillGym || undefined, opt) }}
                  className={cn('flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors', bizDrillGroupBy === opt ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500')}>
                  By {opt === 'staff' ? 'Staff' : 'Commission Type'}
                </button>
              ))}
            </div>
            {/* Data table */}
            {bizDrillLoading ? (
              <div className="flex justify-center py-6"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-600" /></div>
            ) : bizDrillData.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No commission data for this period</p>
            ) : bizDrillGroupBy === 'staff' ? (
              <div className="divide-y divide-gray-100">
                {bizDrillData.map((row: any, i: number) => (
                  <div key={i} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{row.name}</p>
                      <p className="text-xs text-gray-400">
                        {row.session > 0 && `Sessions: ${formatSGD(row.session)} `}
                        {row.signup > 0 && `Signup: ${formatSGD(row.signup)} `}
                        {row.membership > 0 && `Membership: ${formatSGD(row.membership)}`}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-green-700">{formatSGD(row.total)}</p>
                  </div>
                ))}
                <div className="flex justify-between pt-2.5">
                  <p className="text-sm font-semibold text-gray-900">Total</p>
                  <p className="text-sm font-bold text-green-700">{formatSGD(bizDrillData.reduce((s: number, r: any) => s + r.total, 0))}</p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {bizDrillData.map((row: any, i: number) => (
                  <div key={i} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{row.name}</p>
                      <p className="text-xs text-gray-400">{row.count} transaction{row.count !== 1 ? 's' : ''}</p>
                    </div>
                    <p className="text-sm font-bold text-green-700">{formatSGD(row.amount)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Summary stats row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Members', value: totals.members.toString() },
          { label: 'Membership Revenue', value: formatSGD(totals.membershipRevenue), sub: monthName },
          { label: 'PT Sessions', value: totals.sessionsCount.toString(), sub: monthName },
        ].map(({ label, value, sub }) => (
          <div key={label} className="stat-card">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="text-xl font-bold text-gray-900">{value}</p>
            {sub && <p className="text-xs text-gray-400">{sub}</p>}
          </div>
        ))}
        {/* Commission tile with month nav + drill-down */}
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">Commission Earned</p>
            <div className="flex items-center gap-0.5">
              <button onClick={() => setBizCommOffset(o => Math.max(o - 1, -2))} disabled={bizCommOffset <= -2}
                className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30 px-1">←</button>
              <span className="text-xs text-gray-400">{bizCommPeriodLabel.split(' ')[0].slice(0,3)}</span>
              <button onClick={() => setBizCommOffset(o => Math.min(o + 1, 0))} disabled={bizCommOffset >= 0}
                className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30 px-1">→</button>
            </div>
          </div>
          <p className="text-xl font-bold text-green-700 mt-1">{bizCommLoading ? '...' : formatSGD(bizCommStats.total)}</p>
          <div className="space-y-0.5 mt-1">
            <p className="text-xs text-gray-400">Sessions: {formatSGD(bizCommStats.session)}</p>
            <p className="text-xs text-gray-400">Signup: {formatSGD(bizCommStats.signup)}</p>
            <p className="text-xs text-gray-400">Membership: {formatSGD(bizCommStats.membership)}</p>
          </div>
          <button onClick={() => { setBizDrillDown(true); setBizDrillGroupBy('staff'); loadBizDrillDown(bizDrillGym || undefined, 'staff') }}
            className="text-xs text-red-600 hover:underline mt-1.5">View breakdown →</button>
        </div>
      </div>

      {/* Gym tabs */}
      <div className="flex gap-2 flex-wrap">
        {gyms.map(gym => (
          <button key={gym.id} onClick={() => setSelectedGym(gym.id)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors border',
              selectedGym === gym.id
                ? 'bg-red-600 text-white border-red-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            )}>
            {gym.name}
            {gym.totalAlerts > 0 && (
              <span className={cn(
                'text-xs font-medium px-1.5 py-0.5 rounded-full',
                selectedGym === gym.id ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'
              )}>
                {gym.totalAlerts}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Selected gym detail */}
      {g && (
        <div className="card p-0 overflow-hidden">
          {/* Stats */}
          <div className="grid grid-cols-4 divide-x divide-gray-100 bg-gray-50 border-b border-gray-100">
            {[
              { label: 'Members', value: g.members.toString() },
              { label: 'Sales this month', value: g.membershipSalesCount.toString(), sub: formatSGD(g.membershipRevenue) },
              { label: 'Sessions this month', value: g.sessionsCount.toString() },
              { label: 'Commission paid', value: formatSGD(g.commissionPayout) },
            ].map(({ label, value, sub }) => (
              <div key={label} className="p-3 text-center">
                <p className="text-sm font-bold text-gray-900">{value}</p>
                {sub && <p className="text-xs text-gray-400">{sub}</p>}
                <p className="text-xs text-gray-400 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Pending confirmations */}
          {(g.pendingMemberships > 0 || g.pendingSessions > 0) && (
            <div className="p-3 bg-amber-50 border-b border-amber-100">
              <p className="text-xs font-semibold text-amber-800 mb-1 flex items-center gap-1.5">
                <Bell className="w-3.5 h-3.5" /> Pending Confirmations
              </p>
              <div className="flex gap-3 text-xs text-amber-700">
                {g.pendingMemberships > 0 && <span>{g.pendingMemberships} membership sale{g.pendingMemberships !== 1 ? 's' : ''}</span>}
                {g.pendingSessions > 0 && <span>{g.pendingSessions} PT session{g.pendingSessions !== 1 ? 's' : ''}</span>}
              </div>
            </div>
          )}

          {/* Alerts */}
          {(g.expiringMems.length > 0 || g.lowPkgs.length > 0 || g.expiringPkgs.length > 0) && (
            <div className="p-3 bg-red-50 border-b border-red-100">
              <p className="text-xs font-semibold text-red-800 mb-1 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Alerts
              </p>
              {g.expiringMems.map((m: any, i: number) => (
                <p key={"mem"+i} className="text-xs text-amber-700">🪪 {m.member?.full_name} — {m.membership_type_name}: expires {formatDate(m.end_date)}</p>
              ))}
              {g.lowPkgs.map((p: any, i: number) => (
                <p key={"low"+i} className="text-xs text-red-700">{p.member?.full_name} — {p.package_name}: {p.total_sessions - p.sessions_used} sessions left</p>
              ))}
              {g.expiringPkgs.map((p: any, i: number) => (
                <p key={"exp"+i} className="text-xs text-red-700">{p.member?.full_name} — {p.package_name}: expires {formatDate(p.end_date_calculated)}</p>
              ))}
            </div>
          )}

          {/* Today's sessions */}
          <div className="p-3">
            <p className="text-xs font-semibold text-gray-600 mb-2">Today's PT Sessions ({g.todaySessions.length})</p>
            {g.todaySessions.length === 0 ? (
              <p className="text-xs text-gray-400">No sessions scheduled today</p>
            ) : (
              <div className="space-y-1">
                {g.todaySessions.map((s: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-gray-500 w-12 flex-shrink-0">
                      {new Date(s.scheduled_at).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="text-gray-900 font-medium">{s.member?.full_name}</span>
                    <span className="text-gray-400">· {s.trainer?.full_name}</span>
                    <span className={cn("ml-auto px-1.5 py-0.5 rounded text-xs font-medium",
                      s.status === "completed" ? "bg-green-100 text-green-700" :
                      s.status === "cancelled" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700")}>
                      {s.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Time-based greeting ──────────────────────────────────────
function getGreeting(firstName: string): string {
  const hour = new Date().getHours()
  if (hour < 12) return `Good morning, ${firstName}`
  if (hour < 18) return `Good afternoon, ${firstName}`
  return `Good evening, ${firstName}`
}

// ── Birthday panel ───────────────────────────────────────────
// Shows staff birthdays in the next 7 days for Manager / Biz Ops.
// Hidden when empty. Slide-out panel on click.
function BirthdayPanel({ gymId, isBizOps }: { gymId?: string | null, isBizOps?: boolean }) {
  const [birthdays, setBirthdays] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const today = new Date()
      // Build a list of upcoming (month, day) pairs for the next 7 days
      const upcoming: { month: number; day: number }[] = []
      for (let i = 0; i <= 6; i++) {
        const d = new Date(today)
        d.setDate(today.getDate() + i)
        upcoming.push({ month: d.getMonth() + 1, day: d.getDate() })
      }

      let query = supabase
        .from('users')
        .select('id, full_name, date_of_birth, role, manager_gym_id, trainer_gyms(gym_id, gyms(name)), gyms:manager_gym_id(name)')
        .eq('is_archived', false)
        .eq('is_active', true)
        .not('date_of_birth', 'is', null)
        .in('role', ['manager', 'trainer', 'staff'])

      if (!isBizOps && gymId) {
        // Manager: only own gym staff
        query = query.eq('manager_gym_id', gymId)
      }

      const { data } = await query

      // Filter to birthdays in the next 7 days using month+day comparison
      const results = (data || []).filter((u: any) => {
        if (!u.date_of_birth) return false
        const dob = new Date(u.date_of_birth)
        return upcoming.some(({ month, day }) =>
          dob.getMonth() + 1 === month && dob.getDate() === day
        )
      }).map((u: any) => {
        // Calculate which upcoming date matches
        const dob = new Date(u.date_of_birth)
        const matchDay = upcoming.find(({ month, day }) =>
          dob.getMonth() + 1 === month && dob.getDate() === day
        )!
        const birthdayThisYear = new Date(today.getFullYear(), dob.getMonth(), dob.getDate())
        const daysAway = Math.round((birthdayThisYear.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000)
        const gymName = u.gyms?.name || u.trainer_gyms?.[0]?.gyms?.name || '—'
        return { ...u, daysAway, gymName }
      }).sort((a: any, b: any) => a.daysAway - b.daysAway)

      setBirthdays(results)
    }
    load()
  }, [gymId, isBizOps])

  if (birthdays.length === 0) return null

  return (
    <>
      {/* Birthday banner */}
      <button onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 bg-pink-50 border border-pink-200 rounded-xl p-4 text-left hover:bg-pink-100 transition-colors">
        <Gift className="w-5 h-5 text-pink-500 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-pink-800">
            {birthdays.length} upcoming birthday{birthdays.length > 1 ? 's' : ''} in the next 7 days
          </p>
          <p className="text-xs text-pink-600 mt-0.5">
            {birthdays.slice(0, 2).map((b: any) => b.full_name.split(' ')[0]).join(', ')}
            {birthdays.length > 2 ? ` +${birthdays.length - 2} more` : ''}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-pink-400 flex-shrink-0" />
      </button>

      {/* Slide-out panel overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setOpen(false)}>
          <div className="fixed inset-0 bg-black/20" />
          <div className="relative w-full max-w-sm bg-white h-full shadow-xl flex flex-col"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Gift className="w-5 h-5 text-pink-500" />
                <h2 className="font-semibold text-gray-900 text-sm">Upcoming Birthdays</h2>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {birthdays.map((b: any) => {
                const dob = new Date(b.date_of_birth)
                const age = new Date().getFullYear() - dob.getFullYear()
                return (
                  <div key={b.id} className="p-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-pink-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-medium text-pink-700">
                        {b.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{b.full_name}</p>
                      <p className="text-xs text-gray-500">
                        {isBizOps && <span className="mr-1">{b.gymName} ·</span>}
                        Turns {age} · {dob.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                      b.daysAway === 0 ? 'bg-pink-100 text-pink-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {b.daysAway === 0 ? 'Today! 🎂' : `In ${b.daysAway}d`}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── MemberBirthdayCard ────────────────────────────────────────
// Shows today's member birthdays (with age) to staff/manager/trainer.
// Dismissed per-day via localStorage — won't reappear until tomorrow.
// Not shown to Biz Ops (they have no gym assignment).
interface MemberBirthdayCardProps {
  gymId: string | null         // manager's gym
  trainerGymIds: string[]      // trainer's gyms
  role: string
  userId: string
}

function MemberBirthdayCard({ gymId, trainerGymIds, role, userId }: MemberBirthdayCardProps) {
  const [members, setMembers] = useState<{ id: string; full_name: string; age: number }[]>([])
  const [dismissed, setDismissed] = useState(false)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  // localStorage key: unique per user per day
  const storageKey = `member_birthday_dismissed_${userId}_${new Date().toISOString().split('T')[0]}`

  useEffect(() => {
    // Check if already dismissed today
    try {
      if (localStorage.getItem(storageKey) === 'true') {
        setDismissed(true)
        setLoading(false)
        return
      }
    } catch {}

    const load = async () => {
      const today = new Date()
      const todayMonth = today.getMonth() + 1
      const todayDay = today.getDate()
      const todayYear = today.getFullYear()

      // Build gym filter — manager uses gymId, trainer uses trainerGymIds
      const gymIds: string[] = []
      if (gymId) gymIds.push(gymId)
      trainerGymIds.forEach(id => { if (!gymIds.includes(id)) gymIds.push(id) })
      if (gymIds.length === 0) { setLoading(false); return }

      // Query members at relevant gyms with a birthday today
      // Use month/day extracted from date_of_birth via filter
      const { data } = await supabase
        .from('members')
        .select('id, full_name, date_of_birth, gym_id')
        .in('gym_id', gymIds)
        .eq('status', 'active')
        .not('date_of_birth', 'is', null)

      const todayBirthdays = (data || [])
        .filter((m: any) => {
          if (!m.date_of_birth) return false
          const dob = new Date(m.date_of_birth)
          return dob.getMonth() + 1 === todayMonth && dob.getDate() === todayDay
        })
        .map((m: any) => {
          const dob = new Date(m.date_of_birth)
          const age = todayYear - dob.getFullYear()
          return { id: m.id, full_name: m.full_name, age }
        })
        .sort((a: any, b: any) => a.full_name.localeCompare(b.full_name))

      setMembers(todayBirthdays)
      setLoading(false)
    }
    load()
  }, [gymId, userId])

  const handleDismiss = () => {
    try { localStorage.setItem(storageKey, 'true') } catch {}
    setDismissed(true)
  }

  if (loading || dismissed || members.length === 0) return null

  return (
    <div className="bg-pink-50 border border-pink-200 rounded-xl p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <span className="text-xl flex-shrink-0" aria-label="birthday cake">🎂</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-pink-800">
              {members.length === 1
                ? `${members[0].full_name} turns ${members[0].age} today!`
                : `${members.length} members have birthdays today`}
            </p>
            {members.length > 1 && (
              <p className="text-xs text-pink-700 mt-1 leading-relaxed">
                {members.map(m => `${m.full_name} (${m.age})`).join(' · ')}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 text-pink-400 hover:text-pink-600 transition-colors p-0.5"
          aria-label="Dismiss birthday notification for today"
          title="Dismiss — won't show again today"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null)
  const [trainerGymIds, setTrainerGymIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  // Admin state
  const [gymBreakdown, setGymBreakdown] = useState<any[]>([])
  const [roleCounts, setRoleCounts] = useState<Record<string, number>>({})

  // Manager/trainer shared state
  const [todaySessions, setTodaySessions] = useState<any[]>([])
  const [upcomingSessions, setUpcomingSessions] = useState<any[]>([])
  const [gymScheduleSessions, setGymScheduleSessions] = useState<any[]>([])
  const [commissionStats, setCommissionStats] = useState<any>({ session: 0, signup: 0, membership: 0, total: 0 })
  const [commissionLoading, setCommissionLoading] = useState(false)
  const [commissionDrillDown, setCommissionDrillDown] = useState(false)
  const [drillDownData, setDrillDownData] = useState<any[]>([])
  const [drillDownLoading, setDrillDownLoading] = useState(false)
  const [drillDownGroupBy, setDrillDownGroupBy] = useState<'staff' | 'type'>('staff')
  const [calendarOffset, setCalendarOffset] = useState(0) // days offset from today
  const [calendarModal, setCalendarModal] = useState<any>(null)
  const [commissionOffset, setCommissionOffset] = useState(0) // 0 = current month, -1 = prev, -2 = 2 months ago
  const [nonRenewalModal, setNonRenewalModal] = useState<any>(null) // expiring membership to record non-renewal
  const [nonRenewalReason, setNonRenewalReason] = useState('')
  const [nonRenewalOther, setNonRenewalOther] = useState('')
  const [nonRenewalSaving, setNonRenewalSaving] = useState(false)
  const [pendingMemberships, setPendingMemberships] = useState(0)
  const [pendingSessions, setPendingSessions] = useState(0)

  // Manager alerts
  const [lowSessionPackages, setLowSessionPackages] = useState<any[]>([])
  const [expiringPackages, setExpiringPackages] = useState<any[]>([])
  const [expiringMemberships, setExpiringMemberships] = useState<any[]>([])
  const [atRiskMembers, setAtRiskMembers] = useState<any[]>([])
  const [pendingLeave, setPendingLeave] = useState(0)

  // Stats
  const [stats, setStats] = useState<any>({})
  const [newPayslip, setNewPayslip] = useState<any>(null) // latest unseen approved/paid payslip
  const [newCommission, setNewCommission] = useState<any>(null) // latest unseen approved commission
  const [rejectionNotifs, setRejectionNotifs] = useState<any[]>([]) // unseen PT package rejections
  const [memRejectionNotifs, setMemRejectionNotifs] = useState<any[]>([]) // unseen membership rejection notifications
  const [leaveDecisionNotifs, setLeaveDecisionNotifs] = useState<any[]>([]) // unseen leave decisions
  const [pendingMemSales, setPendingMemSales] = useState<number>(0) // own pending membership sales

  const supabase = createClient()
  const { isActingAsTrainer } = useViewMode()

  useEffect(() => {
    const load = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return
      const { data: u } = await supabase.from('users').select('*').eq('id', authUser.id).single()
      if (!u) return
      setUser(u)

      // ── Admin ────────────────────────────────────────────
      if (u.role === 'admin') {
        const { data: gyms } = await supabase.from('gyms').select('*').order('name')
        const { data: allStaff } = await supabase.from('users').select('id, role, manager_gym_id, trainer_gyms(gym_id)').eq('is_archived', false)
        const rc: Record<string, number> = {}
        allStaff?.forEach((s: any) => { rc[s.role] = (rc[s.role] || 0) + 1 })
        setRoleCounts(rc)
        setGymBreakdown((gyms || []).map(g => ({
          ...g,
          managers: allStaff?.filter((s: any) => s.role === 'manager' && s.manager_gym_id === g.id).length || 0,
          trainers: allStaff?.filter((s: any) => s.role === 'trainer' && (s.trainer_gyms as any[])?.some((tg: any) => tg.gym_id === g.id)).length || 0,
        })))
        // Pending Biz Ops leave awaiting admin approval
        const bizOpsIds = allStaff?.filter((s: any) => s.role === 'business_ops').map((s: any) => s.id) || []
        if (bizOpsIds.length > 0) {
          const { count: leavePending } = await supabase.from('leave_applications')
            .select('id', { count: 'exact', head: true })
            .in('user_id', bizOpsIds).eq('status', 'pending')
          setPendingLeave(leavePending || 0)
        }
        setLoading(false)
        return
      }

      const gymId = u.manager_gym_id
      const isManager = u.role === 'manager' && !isActingAsTrainer
      const isTrainer = u.role === 'trainer' || isActingAsTrainer
      const now = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

      // ── Today's sessions ─────────────────────────────────
      let todayQ = supabase.from('sessions')
        .select('*, member:members(full_name), trainer:users!sessions_trainer_id_fkey(full_name), package:packages(package_name, sessions_used, total_sessions)')
        .gte('scheduled_at', todayStart).lte('scheduled_at', todayEnd)
        .order('scheduled_at')
      if (isTrainer) todayQ = todayQ.eq('trainer_id', authUser.id)
      else if (gymId) todayQ = todayQ.eq('gym_id', gymId)
      const { data: todayData } = await todayQ
      setTodaySessions(todayData || [])

      // ── Escalation checks (configurable thresholds) ─────────
      // Load thresholds from app_settings — never hardcoded
      const thresholds = await loadEscalationThresholds(supabase)

      if (isTrainer) {
        // PT package escalation
        const pkgCount = await runEscalationCheck(supabase, 'pt_package', thresholds.pt_package, authUser.id)
        await logEscalation(u.full_name, u.role, authUser.id, 'pt_package', pkgCount)

        // PT session notes escalation
        const sessCount = await runEscalationCheck(supabase, 'pt_session', thresholds.pt_session, authUser.id)
        await logEscalation(u.full_name, u.role, authUser.id, 'pt_session', sessCount)

        // Membership sales escalation (trainer as seller)
        const memSalesCount = await runEscalationCheck(supabase, 'membership_sales', thresholds.membership_sales, authUser.id)
        await logEscalation(u.full_name, u.role, authUser.id, 'membership_sales', memSalesCount)
      }

      if (u.role === 'staff') {
        // Membership sales escalation (staff as seller)
        const memSalesCount = await runEscalationCheck(supabase, 'membership_sales', thresholds.membership_sales, authUser.id)
        await logEscalation(u.full_name, u.role, authUser.id, 'membership_sales', memSalesCount)
      }

      if (isManager && gymId) {
        // Membership sales escalation (manager as seller)
        const memSalesCount = await runEscalationCheck(supabase, 'membership_sales', thresholds.membership_sales, authUser.id)
        await logEscalation(u.full_name, u.role, authUser.id, 'membership_sales', memSalesCount)

        // Membership expiry escalation — manager triggers first
        const expiryCount = await runEscalationCheck(supabase, 'membership_expiry', thresholds.membership_expiry, authUser.id, gymId)
        await logEscalation(u.full_name, u.role, authUser.id, 'membership_expiry', expiryCount)
      }

      // ── Upcoming (next 5 excluding today) ────────────────
      let upQ = supabase.from('sessions')
        .select('*, member:members(full_name), trainer:users!sessions_trainer_id_fkey(full_name)')
        .eq('status', 'scheduled').gt('scheduled_at', todayEnd)
        .order('scheduled_at').limit(5)
      if (isTrainer) upQ = upQ.eq('trainer_id', authUser.id)
      else if (gymId) upQ = upQ.eq('gym_id', gymId)
      const { data: upData } = await upQ
      setUpcomingSessions(upData || [])

      // ── Gym schedule (manager + trainer + staff): upcoming sessions ──
      if (isManager || isTrainer || u.role === 'staff') {
        const schedEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString()
        let gymSchedQ = supabase.from('sessions')
          .select('*, member:members(full_name, phone), trainer:users!sessions_trainer_id_fkey(id, full_name), package:packages(package_name, total_sessions, sessions_used)')
          .in('status', ['scheduled', 'completed'])
          .gte('scheduled_at', now.toISOString().split('T')[0] + 'T00:00:00')
          .lte('scheduled_at', schedEnd)
          .order('scheduled_at').limit(200)
        if (isManager && gymId) {
          // Manager: their assigned gym
          gymSchedQ = gymSchedQ.eq('gym_id', gymId)
        } else if (u.role === 'staff' && gymId) {
          // Staff: their assigned gym
          gymSchedQ = gymSchedQ.eq('gym_id', gymId)
        } else if (isTrainer) {
          // Trainer: all gyms they are assigned to
          const { data: tgRows } = await supabase.from('trainer_gyms').select('gym_id').eq('trainer_id', authUser.id)
          const gymIds = tgRows?.map((r: any) => r.gym_id) || []
          setTrainerGymIds(gymIds)
          if (gymIds.length > 0) gymSchedQ = gymSchedQ.in('gym_id', gymIds)
        }
        const { data: gymSchedData } = await gymSchedQ
        setGymScheduleSessions(gymSchedData || [])
      }

      // ── Stats ────────────────────────────────────────────
      let memberCount = 0
      if (isTrainer) {
        // Count distinct members with an active package assigned to this trainer
        const { data: trainerPkgs } = await supabase.from('packages')
          .select('member_id').eq('trainer_id', authUser.id).eq('status', 'active')
        memberCount = new Set(trainerPkgs?.map((p: any) => p.member_id)).size
      } else {
        const { count: mc } = await supabase.from('members')
          .select('id', { count: 'exact', head: true })
          .eq('gym_id', gymId || '')
        memberCount = mc || 0
      }

      let pkgQ = supabase.from('packages').select('id', { count: 'exact', head: true }).eq('status', 'active')
      if (isTrainer) pkgQ = pkgQ.eq('trainer_id', authUser.id)
      else if (gymId) pkgQ = pkgQ.eq('gym_id', gymId)
      const { count: pkgCount } = await pkgQ

      let sessQ = supabase.from('sessions').select('session_commission_sgd').eq('status', 'completed').gte('marked_complete_at', monthStart)
      if (isTrainer) sessQ = sessQ.eq('trainer_id', authUser.id)
      else if (gymId) sessQ = sessQ.eq('gym_id', gymId)
      const { data: sessData } = await sessQ
      const sessionCommission = sessData?.reduce((s: number, r: any) => s + (r.session_commission_sgd || 0), 0) || 0
      const sessCount = sessData?.length || 0

      // Signup commission from PT packages sold this month (not yet paid)
      let signupCommission = 0
      if (isTrainer) {
        const { data: signupPkgs } = await supabase.from('packages')
          .select('signup_commission_sgd')
          .eq('trainer_id', authUser.id)
          .gte('created_at', monthStart)
        signupCommission = signupPkgs?.reduce((s: number, p: any) => s + (p.signup_commission_sgd || 0), 0) || 0
      }
      const commission = sessionCommission + signupCommission

      // Per-gym breakdown for biz ops (loaded inline in component)
      // Membership sales revenue + commission payout for manager/biz ops
      let membershipRevenue = 0
      let membershipSalesCount = 0
      let totalCommissionPayout = 0

      if (!isTrainer) {
        // Confirmed membership sales this month
        let memQ = supabase.from('gym_memberships')
          .select('price_sgd, commission_sgd')
          .eq('sale_status', 'confirmed')
          .gte('created_at', monthStart)
        if (gymId) memQ = memQ.eq('gym_id', gymId)
        const { data: memSalesData } = await memQ
        membershipRevenue = memSalesData?.reduce((s: number, m: any) => s + (m.price_sgd || 0), 0) || 0
        membershipSalesCount = memSalesData?.length || 0

        // Total commission payouts (approved + paid) for the month
        let payoutQ = supabase.from('commission_payouts')
          .select('total_commission_sgd')
          .in('status', ['approved', 'paid'])
          .gte('generated_at', monthStart)
        if (gymId) payoutQ = payoutQ.eq('gym_id', gymId)
        const { data: payoutData } = await payoutQ
        totalCommissionPayout = payoutData?.reduce((s: number, p: any) => s + (p.total_commission_sgd || 0), 0) || 0
      }

      setStats({ members: memberCount || 0, packages: pkgCount || 0, sessions: sessCount, commission, sessionCommission, signupCommission, membershipRevenue, membershipSalesCount, totalCommissionPayout })

      // ── Manager-only alerts ──────────────────────────────
      if (isManager && gymId) {
        // Pending membership confirmations
        const { count: memPending } = await supabase.from('gym_memberships')
          .select('id', { count: 'exact', head: true }).eq('gym_id', gymId).eq('sale_status', 'pending')
        setPendingMemberships(memPending || 0)

        // Pending session confirmations
        const { count: sessPending } = await supabase.from('sessions')
          .select('id', { count: 'exact', head: true })
          .eq('gym_id', gymId).eq('status', 'completed').not('notes_submitted_at', 'is', null).eq('manager_confirmed', false)
        setPendingSessions(sessPending || 0)

        // Packages with ≤3 sessions remaining
        const { data: lowPkgs } = await supabase.from('packages')
          .select('*, member:members(full_name), trainer:users!packages_trainer_id_fkey(full_name)')
          .eq('gym_id', gymId).eq('status', 'active')
          .filter('total_sessions - sessions_used', 'lte', 3)
          .order('sessions_used', { ascending: false })
          .limit(10)
        setLowSessionPackages(lowPkgs || [])

        // Packages expiring within 7 days
        const in14Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        const { data: expPkgs } = await supabase.from('packages')
          .select('*, member:members(full_name), trainer:users!packages_trainer_id_fkey(full_name)')
          .eq('gym_id', gymId).eq('status', 'active')
          .lte('end_date_calculated', in14Days)
          .gte('end_date_calculated', now.toISOString().split('T')[0])
          .order('end_date_calculated')
          .limit(10)
        setExpiringPackages(expPkgs || [])

        // ── Membership expiry escalation check ──────────────────
        // Runs on manager AND Biz Ops dashboard load — whichever fires first
        // Escalate to Biz Ops if expiring within 7 days AND not actioned
        const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        const todayStr = now.toISOString().split('T')[0]
        const { data: toEscalate } = await supabase.from('gym_memberships')
          .select('id')
          .eq('gym_id', gymId)
          .eq('status', 'active')
          .eq('sale_status', 'confirmed')
          .eq('membership_actioned', false)
          .eq('escalated_to_biz_ops', false)
          .lte('end_date', in7Days)
          .gte('end_date', todayStr)
        if (toEscalate && toEscalate.length > 0) {
          await supabase.from('gym_memberships')
            .update({ escalated_to_biz_ops: true, escalated_at: now.toISOString() })
            .in('id', toEscalate.map((m: any) => m.id))
        }

        // Gym memberships expiring within 30 days
        // Note: membership auto-expiry is handled by the daily cron job
        // at /api/cron/expire-memberships (runs at 0001 SGT).
        const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        const { data: expiringMems } = await supabase.from('gym_memberships')
          .select('id, end_date, member_id, membership_type_name, membership_actioned, escalated_to_biz_ops, member:members(id, full_name)')
          .eq('gym_id', gymId)
          .eq('status', 'active')
          .eq('sale_status', 'confirmed')
          .lte('end_date', in30Days)
          .gte('end_date', now.toISOString().split('T')[0])
          .order('end_date')
          .limit(20)

        // Exclude members who already have a newer confirmed membership (already renewed)
        const renewedMemberIds = new Set(
          expiringMems
            ?.filter((m: any) => expiringMems.some((m2: any) =>
              m2.member_id === m.member_id && new Date(m2.end_date) > new Date(m.end_date)
            ))
            .map((m: any) => m.member_id)
        )
        setExpiringMemberships((expiringMems || []).filter((m: any) => !renewedMemberIds.has(m.member_id)).slice(0, 10))

        // At-risk: packages expired in last 30 days with no new active package
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        const { data: expiredPkgs } = await supabase.from('packages')
          .select('id, member_id, member:members(full_name, phone), end_date_calculated')
          .eq('gym_id', gymId).eq('status', 'expired')
          .gte('end_date_calculated', thirtyDaysAgo)
        // Filter out those who have a new active package
        const expiredMemberIds = Array.from(new Set(expiredPkgs?.map((p: any) => p.member_id)))
        if (expiredMemberIds.length > 0) {
          const { data: activePkgs } = await supabase.from('packages')
            .select('member_id').eq('gym_id', gymId).eq('status', 'active').in('member_id', expiredMemberIds)
          const activeIds = new Set(activePkgs?.map((p: any) => p.member_id))
          const atRisk = expiredPkgs?.filter((p: any) => !activeIds.has(p.member_id))
            .reduce((acc: any[], p: any) => {
              if (!acc.find((x: any) => x.member_id === p.member_id)) acc.push(p)
              return acc
            }, []) || []

          // Fetch non-renewal reasons in one bulk query instead of N queries
          const atRiskPkgIds = atRisk.map((p: any) => p.id)
          const { data: atRiskSessions } = await supabase.from('sessions')
            .select('package_id, renewal_status, non_renewal_reason, scheduled_at')
            .in('package_id', atRiskPkgIds)
            .not('renewal_status', 'is', null)
            .order('scheduled_at', { ascending: false })

          const atRiskWithReason = atRisk.map((p: any) => {
            // Find the most recent session with a renewal_status for this package
            const lastSession = atRiskSessions?.find((s: any) => s.package_id === p.id)
            return { ...p, renewal_status: lastSession?.renewal_status, non_renewal_reason: lastSession?.non_renewal_reason }
          })
          setAtRiskMembers(atRiskWithReason)
        }

        // Pending leave — exactly mirrors hr/leave/page.tsx manager query
        // so the badge count always matches what the leave page shows
        const { data: leaveOpsStaff } = await supabase.from('users')
          .select('id').eq('manager_gym_id', gymId).eq('role', 'staff').neq('id', authUser.id)
        const { data: leaveGymTrainers } = await supabase.from('trainer_gyms')
          .select('trainer_id').eq('gym_id', gymId)
        const leaveRawTrainerIds = (leaveGymTrainers?.map((t: any) => t.trainer_id) || [])
          .filter((id: string) => id !== authUser.id)
        let leaveFtTrainerIds: string[] = []
        if (leaveRawTrainerIds.length > 0) {
          const { data: leaveFtOnly } = await supabase.from('users')
            .select('id').in('id', leaveRawTrainerIds)
            .eq('role', 'trainer').eq('employment_type', 'full_time')
          leaveFtTrainerIds = leaveFtOnly?.map((t: any) => t.id) || []
        }
        const leaveStaffIds = [
          ...(leaveOpsStaff?.map((s: any) => s.id) || []),
          ...leaveFtTrainerIds,
        ]
        if (leaveStaffIds.length > 0) {
          const { count: leavePending } = await supabase.from('leave_applications')
            .select('id', { count: 'exact', head: true })
            .in('user_id', leaveStaffIds)
            .eq('status', 'pending')
            .eq('escalated_to_biz_ops', false)
          setPendingLeave(leavePending || 0)
        } else {
          setPendingLeave(0)
        }
      }

      // ── Membership sale pending count (own sales) ───────────
      if (['trainer', 'staff', 'manager'].includes(u.role)) {
        const { count: pendingCount } = await supabase.from('gym_memberships')
          .select('id', { count: 'exact', head: true })
          .eq('sold_by_user_id', authUser.id)
          .eq('sale_status', 'pending')
        setPendingMemSales(pendingCount || 0)

        // Membership rejection notifications
        const { data: memRejections } = await supabase.from('mem_rejection_notif')
          .select('id, member_name, membership_type_name, rejection_reason, was_new_member, rejected_by_name, rejected_at')
          .eq('seller_id', authUser.id)
          .is('seen_at', null)
          .order('rejected_at', { ascending: false })
        setMemRejectionNotifs(memRejections || [])
      }

      // ── Leave decision notifications ─────────────────────────
      if (['trainer', 'staff', 'manager'].includes(u.role)) {
        const { data: leaveNotifs } = await supabase.from('leave_decision_notif')
          .select('id, leave_type, start_date, end_date, days_applied, decision, rejection_reason, decided_by_name')
          .eq('user_id', authUser.id)
          .is('seen_at', null)
          .order('decided_at', { ascending: false })
        setLeaveDecisionNotifs(leaveNotifs || [])
      }

      // ── PT package rejection notifications ──────────────
      // Show to trainers, staff and managers whose packages were rejected
      if (['trainer', 'staff', 'manager'].includes(u.role)) {
        const { data: rejections } = await supabase
          .from('pkg_rejection_notif')
          .select('id, package_name, member_name, rejected_by_name, rejected_at')
          .eq('trainer_id', authUser.id)
          .is('seen_at', null)
          .order('rejected_at', { ascending: false })
        setRejectionNotifs(rejections || [])
      }

      // ── Payslip & commission notifications ──────────────
      // Show once after approval — compare against seen timestamp on user record
      const seenPayslip = u.payslip_notif_seen_at ? new Date(u.payslip_notif_seen_at) : null
      const seenCommission = u.commission_notif_seen_at ? new Date(u.commission_notif_seen_at) : null

      // Latest approved/paid payslip newer than last seen timestamp
      const { data: latestPayslip } = await supabase
        .from('payslips')
        .select('id, month, year, net_salary, status, approved_at')
        .eq('user_id', authUser.id)
        .in('status', ['approved', 'paid'])
        .order('approved_at', { ascending: false })
        .limit(1)
        .single()
      if (latestPayslip?.approved_at) {
        const approvedAt = new Date(latestPayslip.approved_at)
        if (!seenPayslip || approvedAt > seenPayslip) {
          setNewPayslip(latestPayslip)
        }
      }

      // Latest approved commission payout newer than last seen timestamp
      const { data: latestCommission } = await supabase
        .from('commission_payouts')
        .select('id, period_start, period_end, total_commission_sgd, approved_at')
        .eq('user_id', authUser.id)
        .eq('status', 'approved')
        .order('approved_at', { ascending: false })
        .limit(1)
        .single()
      if (latestCommission?.approved_at) {
        const approvedAt = new Date(latestCommission.approved_at)
        if (!seenCommission || approvedAt > seenCommission) {
          setNewCommission(latestCommission)
        }
      }

      setLoading(false)
    }
    load()
  }, [isActingAsTrainer])

  // ── Commission stats loader — reloads on month navigation ──
  const loadCommissionStats = async (periodStart: string, periodEnd: string) => {
    setCommissionLoading(true)
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return
    const { data: u } = await supabase.from('users').select('role, manager_gym_id').eq('id', authUser.id).single()
    if (!u) return
    const isTrainerRole = u.role === 'trainer' || isActingAsTrainer
    const isManagerRole = u.role === 'manager' && !isActingAsTrainer
    const isStaffRole = u.role === 'staff'

    let sessionComm = 0, signupComm = 0, membershipComm = 0

    if (isTrainerRole) {
      // PT session commission — gated on manager_confirmed + is_notes_complete
      const { data: sessSales } = await supabase.from('sessions')
        .select('session_commission_sgd')
        .eq('trainer_id', authUser.id).eq('status', 'completed')
        .not('notes_submitted_at', 'is', null).eq('manager_confirmed', true)
        .gte('marked_complete_at', periodStart).lte('marked_complete_at', periodEnd)
      sessionComm = sessSales?.reduce((s: number, r: any) => s + (r.session_commission_sgd || 0), 0) || 0

      // PT signup commission — gated on manager_confirmed
      const { data: pkgSales } = await supabase.from('packages')
        .select('signup_commission_sgd')
        .eq('trainer_id', authUser.id).eq('manager_confirmed', true)
        .gte('created_at', periodStart).lte('created_at', periodEnd)
      signupComm = pkgSales?.reduce((s: number, p: any) => s + (p.signup_commission_sgd || 0), 0) || 0

      // Membership commission — confirmed sales by this trainer
      const { data: memSales } = await supabase.from('gym_memberships')
        .select('commission_sgd')
        .eq('sold_by_user_id', authUser.id).eq('sale_status', 'confirmed')
        .gte('created_at', periodStart).lte('created_at', periodEnd)
      membershipComm = memSales?.reduce((s: number, m: any) => s + (m.commission_sgd || 0), 0) || 0
    }

    else if (isStaffRole) {
      // Staff only earn membership commission
      const { data: memSales } = await supabase.from('gym_memberships')
        .select('commission_sgd')
        .eq('sold_by_user_id', authUser.id).eq('sale_status', 'confirmed')
        .gte('created_at', periodStart).lte('created_at', periodEnd)
      membershipComm = memSales?.reduce((s: number, m: any) => s + (m.commission_sgd || 0), 0) || 0
    }

    else if (isManagerRole && u.manager_gym_id) {
      // Manager sees gym-wide commission earned (gated)
      const gymId = u.manager_gym_id

      const { data: sessSales } = await supabase.from('sessions')
        .select('session_commission_sgd')
        .eq('gym_id', gymId).eq('status', 'completed')
        .not('notes_submitted_at', 'is', null).eq('manager_confirmed', true)
        .gte('marked_complete_at', periodStart).lte('marked_complete_at', periodEnd)
      sessionComm = sessSales?.reduce((s: number, r: any) => s + (r.session_commission_sgd || 0), 0) || 0

      const { data: pkgSales } = await supabase.from('packages')
        .select('signup_commission_sgd')
        .eq('gym_id', gymId).eq('manager_confirmed', true)
        .gte('created_at', periodStart).lte('created_at', periodEnd)
      signupComm = pkgSales?.reduce((s: number, p: any) => s + (p.signup_commission_sgd || 0), 0) || 0

      const { data: memSales } = await supabase.from('gym_memberships')
        .select('commission_sgd')
        .eq('gym_id', gymId).eq('sale_status', 'confirmed')
        .gte('created_at', periodStart).lte('created_at', periodEnd)
      membershipComm = memSales?.reduce((s: number, m: any) => s + (m.commission_sgd || 0), 0) || 0
    }

    setCommissionStats({
      session: sessionComm,
      signup: signupComm,
      membership: membershipComm,
      total: sessionComm + signupComm + membershipComm,
    })
    setCommissionLoading(false)
  }



    // ── Commission drill-down loader ──────────────────────────
  const loadDrillDown = async (periodStart: string, periodEnd: string, groupBy: 'staff' | 'type', gymFilter?: string) => {
    setDrillDownLoading(true)
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return
    const { data: u } = await supabase.from('users').select('role, manager_gym_id, full_name').eq('id', authUser.id).single()
    if (!u) return

    const isManagerRole = u.role === 'manager' && !isActingAsTrainer
    const gymId = isManagerRole ? u.manager_gym_id : gymFilter

    // Log drill-down access — use API route directly (not hook, as this runs outside component scope)
    fetch('/api/activity-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: authUser.id,
        user_name: u.full_name || 'Manager',
        role: u.role,
        action_type: 'other',
        page: 'Commission Breakdown',
        description: `Viewed commission breakdown by ${groupBy}`,
      }),
    }).catch(() => {})

    // Sequential awaits — no Promise.all with Supabase
    let sessQ = supabase.from('sessions')
      .select('session_commission_sgd, trainer_id, trainer:users!sessions_trainer_id_fkey(full_name), gym_id')
      .eq('status', 'completed').not('notes_submitted_at', 'is', null).eq('manager_confirmed', true)
      .gte('marked_complete_at', periodStart).lte('marked_complete_at', periodEnd)
    if (gymId) sessQ = sessQ.eq('gym_id', gymId)
    const sessData = await sessQ

    let pkgQ = supabase.from('packages')
      .select('signup_commission_sgd, trainer_id, trainer:users!packages_trainer_id_fkey(full_name), gym_id')
      .eq('manager_confirmed', true)
      .gte('created_at', periodStart).lte('created_at', periodEnd)
    if (gymId) pkgQ = pkgQ.eq('gym_id', gymId)
    const pkgData = await pkgQ

    let memQ = supabase.from('gym_memberships')
      .select('commission_sgd, sold_by_user_id, sold_by:users!gym_memberships_sold_by_user_id_fkey(full_name), gym_id')
      .eq('sale_status', 'confirmed')
      .gte('created_at', periodStart).lte('created_at', periodEnd)
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
  }


    // Reload commission stats when month offset changes
  useEffect(() => {
    if (!user) return
    const d = new Date()
    const periodDate = new Date(d.getFullYear(), d.getMonth() + commissionOffset, 1)
    const periodStart = periodDate.toISOString()
    const periodEnd = new Date(d.getFullYear(), d.getMonth() + commissionOffset + 1, 0, 23, 59, 59).toISOString()
    loadCommissionStats(periodStart, periodEnd)
    // If drill-down modal is open, reload it with the new period too
    if (commissionDrillDown) {
      loadDrillDown(periodStart, periodEnd, drillDownGroupBy)
    }
  }, [commissionOffset, user])

  if (loading || !user) return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" />
    </div>
  )

  const now = new Date()
  const todayStr = now.toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long' })
  const isAdmin = user.role === 'admin'
  const handleNonRenewal = async () => {
    if (!nonRenewalModal || !nonRenewalReason) return
    if (nonRenewalReason === 'Other' && !nonRenewalOther.trim()) return
    setNonRenewalSaving(true)
    const supabase = createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()

    // Write non-renewal record
    const { error: err } = await supabase.from('non_renewal_records').insert({
      member_id: nonRenewalModal.member_id,
      gym_membership_id: nonRenewalModal.id,
      gym_id: nonRenewalModal.gym_id || null,
      reason: nonRenewalReason,
      reason_other: nonRenewalReason === 'Other' ? nonRenewalOther.trim() : null,
      recorded_by: authUser!.id,
    })
    if (err) { setNonRenewalSaving(false); return }

    // Mark membership as actioned
    await supabase.from('gym_memberships')
      .update({ membership_actioned: true })
      .eq('id', nonRenewalModal.id)

    // Log activity via API (dashboard component doesn't use useActivityLog hook)
    const { data: actingUser } = await supabase.from('users').select('full_name, role').eq('id', authUser!.id).single()
    if (actingUser) {
      fetch('/api/activity-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: authUser!.id,
          user_name: (actingUser as any).full_name,
          role: (actingUser as any).role,
          action_type: 'update',
          page: 'Dashboard',
          description: 'Recorded membership non-renewal from dashboard',
        }),
      }).catch(() => {})
    }

    // Update expiringMemberships state — remove actioned item from banner
    setExpiringMemberships(prev => prev.map((m: any) =>
      m.id === nonRenewalModal.id ? { ...m, membership_actioned: true } : m
    ))
    setNonRenewalModal(null)
    setNonRenewalSaving(false)
  }


  const dismissLeaveNotifs = async () => {
    if (leaveDecisionNotifs.length === 0) return
    const supabase = createClient()
    const now = new Date().toISOString()
    for (const n of leaveDecisionNotifs) {
      await supabase.from('leave_decision_notif').update({ seen_at: now }).eq('id', n.id)
    }
    setLeaveDecisionNotifs([])
  }

  const dismissMemRejections = async () => {
    if (memRejectionNotifs.length === 0) return
    const supabase = createClient()
    const now = new Date().toISOString()
    for (const n of memRejectionNotifs) {
      await supabase.from('mem_rejection_notif').update({ seen_at: now }).eq('id', n.id)
    }
    setMemRejectionNotifs([])
  }

  const dismissRejections = async () => {
    if (rejectionNotifs.length === 0) return
    const supabase = createClient()
    const now = new Date().toISOString()
    for (const n of rejectionNotifs) {
      await supabase.from('pkg_rejection_notif').update({ seen_at: now }).eq('id', n.id)
    }
    setRejectionNotifs([])
  }

  const dismissNotifications = async () => {
    const supabase = createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return
    await supabase.from('users').update({
      payslip_notif_seen_at: new Date().toISOString(),
      commission_notif_seen_at: new Date().toISOString(),
    }).eq('id', authUser.id)
    setNewPayslip(null)
    setNewCommission(null)
  }

  const isBizOps = user.role === 'business_ops'
  const isStaff = user.role === 'staff'
  const isManager = user.role === 'manager' && !isActingAsTrainer
  const isTrainer = user.role === 'trainer' || isActingAsTrainer

  // Commission period — derived from commissionOffset state
  const commissionPeriodDate = new Date(now.getFullYear(), now.getMonth() + commissionOffset, 1)
  const commissionPeriodStart = commissionPeriodDate.toISOString()
  const commissionPeriodEnd = new Date(now.getFullYear(), now.getMonth() + commissionOffset + 1, 0, 23, 59, 59).toISOString()
  const commissionPeriodLabel = commissionPeriodDate.toLocaleDateString('en-SG', { month: 'long', year: 'numeric' })
  const totalPending = pendingMemberships + pendingSessions
  const totalAlerts = lowSessionPackages.length + expiringPackages.length + atRiskMembers.length

  // ── Admin dashboard ──────────────────────────────────────
  if (isAdmin) return <AdminDashboard user={user} />



  // ── Manager / Trainer dashboard ──────────────────────────
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">
          {getGreeting(user.full_name.split(' ')[0])} 👋
        </h1>
        <p className="text-sm text-gray-500">{todayStr}</p>
      </div>

      {/* ── Pending actions banner ── */}
      {isManager && totalPending > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <Bell className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">
              {totalPending} item{totalPending > 1 ? 's' : ''} pending your confirmation
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              {pendingMemberships > 0 && `${pendingMemberships} membership sale${pendingMemberships > 1 ? 's' : ''}`}
              {pendingMemberships > 0 && pendingSessions > 0 && ' · '}
              {pendingSessions > 0 && `${pendingSessions} PT session${pendingSessions > 1 ? 's' : ''}`}
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {pendingMemberships > 0 && <Link href="/dashboard/membership/sales" className="btn-primary text-xs py-1.5">Memberships</Link>}
            {pendingSessions > 0 && <Link href="/dashboard/pt/sessions" className="btn-secondary text-xs py-1.5">Sessions</Link>}
          </div>
        </div>
      )}

      {/* ── Pending leave banner ── */}
      {isManager && pendingLeave > 0 && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <Calendar className="w-5 h-5 text-blue-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-800">{pendingLeave} leave application{pendingLeave > 1 ? 's' : ''} awaiting approval</p>
          </div>
          <Link href="/dashboard/hr/leave" className="btn-primary text-xs py-1.5 flex-shrink-0">Review</Link>
        </div>
      )}

      {/* ── Staff birthday panel (upcoming 7 days) ── */}
      {isManager && (
        <BirthdayPanel gymId={user.manager_gym_id} isBizOps={false} />
      )}

      {/* ── Member birthday today ── */}
      {!isBizOps && (
        <MemberBirthdayCard
          gymId={user.manager_gym_id}
          trainerGymIds={trainerGymIds}
          role={user.role}
          userId={user.id}
        />
      )}

      <NotificationBanners
        newPayslip={newPayslip}
        newCommission={newCommission}
        onDismissPayslipNotif={dismissNotifications}
        pkgRejectionNotifs={rejectionNotifs}
        onDismissPkgRejections={dismissRejections}
        leaveDecisionNotifs={leaveDecisionNotifs}
        onDismissLeaveNotifs={dismissLeaveNotifs}
        memRejectionNotifs={memRejectionNotifs}
        onDismissMemRejections={dismissMemRejections}
        pendingMemSales={pendingMemSales}
        isBizOps={isBizOps}
      />

      {/* ── Non-renewal modal ── */}
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

      {/* ── Stats row ── */}
      {isTrainer ? (
        // Trainer: own stats
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="stat-card">
            <div className="flex items-center justify-between"><p className="text-xs text-gray-500">My Members</p><Users className="w-4 h-4 text-red-600" /></div>
            <p className="text-2xl font-bold">{stats.members}</p>
            <p className="text-xs text-gray-400 mt-1">Active packages</p>
          </div>
          <div className="stat-card">
            <div className="flex items-center justify-between"><p className="text-xs text-gray-500">Active Packages</p><Package className="w-4 h-4 text-red-600" /></div>
            <p className="text-2xl font-bold">{stats.packages}</p>
          </div>
          <div className="stat-card">
            <div className="flex items-center justify-between"><p className="text-xs text-gray-500">Sessions This Month</p><CheckCircle className="w-4 h-4 text-green-600" /></div>
            <p className="text-2xl font-bold">{stats.sessions}</p>
          </div>
          <div className="stat-card col-span-2 md:col-span-1">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">My Commission</p>
              <div className="flex items-center gap-1">
                <button onClick={() => setCommissionOffset(o => Math.max(o - 1, -2))}
                  disabled={commissionOffset <= -2}
                  className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30 px-1">←</button>
                <span className="text-xs text-gray-400 min-w-16 text-center">{commissionPeriodLabel.split(' ')[0].slice(0,3)}</span>
                <button onClick={() => setCommissionOffset(o => Math.min(o + 1, 0))}
                  disabled={commissionOffset >= 0}
                  className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30 px-1">→</button>
              </div>
            </div>
            <p className="text-xl font-bold text-green-700 mt-1">
              {commissionLoading ? '...' : formatSGD(commissionStats.total)}
            </p>
            <div className="mt-1 space-y-0.5">
              {(isTrainer) && <p className="text-xs text-gray-400">Sessions: {formatSGD(commissionStats.session)}</p>}
              {(isTrainer) && <p className="text-xs text-gray-400">Signup: {formatSGD(commissionStats.signup)}</p>}
              <p className="text-xs text-gray-400">Membership: {formatSGD(commissionStats.membership)}</p>
            </div>
          </div>
        </div>
      ) : (
        // Manager / Biz Ops: gym-wide stats
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="stat-card">
            <div className="flex items-center justify-between"><p className="text-xs text-gray-500">Members</p><Users className="w-4 h-4 text-red-600" /></div>
            <p className="text-2xl font-bold">{stats.members}</p>
          </div>
          <div className="stat-card">
            <div className="flex items-center justify-between"><p className="text-xs text-gray-500">Sessions This Month</p><CheckCircle className="w-4 h-4 text-green-600" /></div>
            <p className="text-2xl font-bold">{stats.sessions}</p>
          </div>
          <div className="stat-card">
            <div className="flex items-center justify-between"><p className="text-xs text-gray-500">Membership Sales</p><CreditCard className="w-4 h-4 text-red-600" /></div>
            <p className="text-2xl font-bold">{stats.membershipSalesCount ?? 0}</p>
            {stats.membershipRevenue > 0 && <p className="text-xs text-gray-400 mt-1">{formatSGD(stats.membershipRevenue)}</p>}
          </div>
          <div className="stat-card">
            <div className="flex items-center justify-between"><p className="text-xs text-gray-500">Active PT Packages</p><Package className="w-4 h-4 text-red-600" /></div>
            <p className="text-2xl font-bold">{stats.packages}</p>
          </div>
          <div className="stat-card col-span-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">Commission Earned</p>
              <div className="flex items-center gap-1">
                <button onClick={() => setCommissionOffset(o => Math.max(o - 1, -2))}
                  disabled={commissionOffset <= -2}
                  className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30 px-1">←</button>
                <span className="text-xs text-gray-400 min-w-16 text-center">{commissionPeriodLabel.split(' ')[0].slice(0,3)} {commissionPeriodLabel.split(' ')[1]}</span>
                <button onClick={() => setCommissionOffset(o => Math.min(o + 1, 0))}
                  disabled={commissionOffset >= 0}
                  className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30 px-1">→</button>
              </div>
            </div>
            <p className="text-xl font-bold text-green-700 mt-1">
              {commissionLoading ? '...' : formatSGD(commissionStats.total)}
            </p>
            <div className="flex gap-4 mt-1">
              <p className="text-xs text-gray-400">Sessions: {formatSGD(commissionStats.session)}</p>
              <p className="text-xs text-gray-400">Signup: {formatSGD(commissionStats.signup)}</p>
              <p className="text-xs text-gray-400">Membership: {formatSGD(commissionStats.membership)}</p>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">Confirmed only — pending manager/Biz Ops ack excluded</p>
            <button onClick={() => {
              setCommissionDrillDown(true)
              setDrillDownGroupBy('staff')
              loadDrillDown(commissionPeriodStart, commissionPeriodEnd, 'staff')
            }} className="text-xs text-red-600 hover:underline mt-1.5">
              View breakdown →
            </button>
          </div>
        </div>
      )}

      {/* ── Manager commission drill-down modal ── */}
      {commissionDrillDown && isManager && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-16 overflow-y-auto" onClick={() => setCommissionDrillDown(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">Commission Breakdown</h3>
                <p className="text-xs text-gray-400">{commissionPeriodLabel} · My Gym</p>
              </div>
              <button onClick={() => setCommissionDrillDown(false)}><X className="w-4 h-4 text-gray-400" /></button>
            </div>
            {/* Group by toggle */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
              {(['staff', 'type'] as const).map(opt => (
                <button key={opt} onClick={() => {
                  setDrillDownGroupBy(opt)
                  loadDrillDown(commissionPeriodStart, commissionPeriodEnd, opt)
                }}
                  className={cn('flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors',
                    drillDownGroupBy === opt ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500')}>
                  By {opt === 'staff' ? 'Staff' : 'Commission Type'}
                </button>
              ))}
            </div>
            {drillDownLoading ? (
              <div className="flex justify-center py-6"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-600" /></div>
            ) : drillDownData.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No commission data for this period</p>
            ) : drillDownGroupBy === 'staff' ? (
              <div className="divide-y divide-gray-100">
                {drillDownData.map((row: any, i: number) => (
                  <div key={i} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{row.name}</p>
                      <p className="text-xs text-gray-400">
                        {row.session > 0 && `Sessions: ${formatSGD(row.session)} `}
                        {row.signup > 0 && `Signup: ${formatSGD(row.signup)} `}
                        {row.membership > 0 && `Membership: ${formatSGD(row.membership)}`}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-green-700">{formatSGD(row.total)}</p>
                  </div>
                ))}
                <div className="flex justify-between pt-2.5">
                  <p className="text-sm font-semibold text-gray-900">Total</p>
                  <p className="text-sm font-bold text-green-700">{formatSGD(drillDownData.reduce((s: number, r: any) => s + r.total, 0))}</p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {drillDownData.map((row: any, i: number) => (
                  <div key={i} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{row.name}</p>
                      <p className="text-xs text-gray-400">{row.count} transaction{row.count !== 1 ? 's' : ''}</p>
                    </div>
                    <p className="text-sm font-bold text-green-700">{formatSGD(row.amount)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Biz Ops: gym tabs ── */}
      {isBizOps && <BirthdayPanel isBizOps={true} />}
      {isBizOps && <BizOpsDashboardAlerts />}
      {isBizOps && <BizOpsGymTabs />}

      {/* ── Today's sessions ── */}
      <div className="card">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
            <Calendar className="w-4 h-4 text-red-600" /> Today's Sessions
            {todaySessions.length > 0 && <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-medium">{todaySessions.length}</span>}
          </h2>
          <Link href="/dashboard/pt/sessions" className={cn('text-xs text-red-600 font-medium', isBizOps && 'hidden')}>All sessions</Link>
        </div>
        {todaySessions.length === 0 ? (
          <div className="p-6 text-center">
            <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No sessions scheduled for today</p>
            {isTrainer && <Link href="/dashboard/pt/sessions/new" className="btn-primary inline-block mt-3 text-xs py-1.5">Schedule session</Link>}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {todaySessions.map((s: any) => {
              const time = new Date(s.scheduled_at).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })
              const statusColor = s.status === 'completed' ? 'bg-green-100 text-green-700' : s.status === 'cancelled' ? 'bg-red-100 text-red-700' : s.status === 'no_show' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
              return (
                <div key={s.id} className="flex items-center gap-3 p-4">
                  <div className="text-center w-12 flex-shrink-0">
                    <p className="text-sm font-bold text-gray-900">{time}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-medium text-gray-900">{s.member?.full_name}</p>
                      {s.package?.total_sessions && (() => {
                        const used = s.package.sessions_used || 0
                        const total = s.package.total_sessions
                        const isLast = used >= total - 1
                        return (
                          <span className={cn(
                            'text-xs font-medium px-1.5 py-0.5 rounded-full flex-shrink-0',
                            isLast ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                          )}>
                            Session {used + 1}/{total}
                          </span>
                        )
                      })()}
                    </div>
                    {!isTrainer && <p className="text-xs text-gray-400">{s.trainer?.full_name}</p>}
                    {s.package?.package_name && <p className="text-xs text-gray-400">{s.package.package_name}</p>}
                  </div>
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium capitalize flex-shrink-0', statusColor)}>
                    {s.status === 'no_show' ? 'No-show' : s.status}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Full Gym Schedule — 7-day calendar ── */}
      {(isManager || isTrainer || isStaff) && (() => {
        const HOURS = Array.from({ length: 19 }, (_, i) => i + 5) // 5am–11pm
        const HOUR_H = 56 // px per hour
        const DAY_W = 160 // px per day column

        // Trainer colour palette
        const PALETTE = [
          '#E24B4A','#3B82F6','#10B981','#F59E0B','#8B5CF6',
          '#EC4899','#06B6D4','#84CC16','#F97316','#6366F1',
        ]
        const trainerIds = Array.from(new Set(gymScheduleSessions.map((s: any) => s.trainer?.id))).filter(Boolean)
        const trainerColor: Record<string, string> = {}
        trainerIds.forEach((id: any, i) => { trainerColor[id] = PALETTE[i % PALETTE.length] })

        // 7 days from today + offset (staff/trainer cannot go back past today)
        const safeOffset = isManager ? calendarOffset : Math.max(0, calendarOffset)
        const today = new Date(); today.setHours(0,0,0,0)
        const days = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(today); d.setDate(d.getDate() + safeOffset + i); return d
        })

        // Group sessions by day
        const byDay: Record<string, any[]> = {}
        days.forEach(d => { byDay[d.toDateString()] = [] })
        gymScheduleSessions.forEach((s: any) => {
          const sd = new Date(s.scheduled_at); sd.setHours(0,0,0,0)
          const key = sd.toDateString()
          if (byDay[key]) byDay[key].push(s)
        })

        return (
          <div className="card overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                <Calendar className="w-4 h-4 text-red-600" /> Gym Schedule
              </h2>
              <div className="flex items-center gap-2">
                {isManager && (
                  <button onClick={() => setCalendarOffset(o => o - 7)}
                    className="text-xs text-gray-500 hover:text-gray-900 px-2 py-1 rounded border border-gray-200 hover:border-gray-300">← Prev</button>
                )}
                <button onClick={() => setCalendarOffset(0)}
                  className="text-xs text-red-600 hover:text-red-700 px-2 py-1 rounded border border-red-200">Today</button>
                <button onClick={() => setCalendarOffset(o => o + 7)}
                  className="text-xs text-gray-500 hover:text-gray-900 px-2 py-1 rounded border border-gray-200 hover:border-gray-300">Next →</button>
              </div>
            </div>

            {/* Trainer legend */}
            {trainerIds.length > 0 && (
              <div className="flex flex-wrap gap-2 px-4 py-2 border-b border-gray-100 bg-gray-50">
                {trainerIds.map((tid: any) => {
                  const s = gymScheduleSessions.find((s: any) => s.trainer?.id === tid)
                  return (
                    <div key={tid} className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: trainerColor[tid] }} />
                      <span className="text-xs text-gray-600">{s?.trainer?.full_name}</span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Calendar grid */}
            <div className="overflow-x-auto">
              <div style={{ display: 'flex', minWidth: `${52 + DAY_W * 7}px` }}>

                {/* Y-axis hours */}
                <div style={{ width: 52, flexShrink: 0, paddingTop: 48 }}>
                  {HOURS.map(h => (
                    <div key={h} style={{ height: HOUR_H, display: 'flex', alignItems: 'flex-start', paddingTop: 2 }}>
                      <span style={{ fontSize: 10, color: '#9CA3AF', paddingRight: 4, lineHeight: 1 }}>
                        {h === 12 ? '12pm' : h < 12 ? `${h}am` : `${h-12}pm`}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Day columns */}
                {days.map(day => {
                  const isToday = day.toDateString() === new Date().toDateString()
                  const daySessions = byDay[day.toDateString()] || []

                  // Group sessions by hour for stacking
                  const byHour: Record<number, any[]> = {}
                  daySessions.forEach((s: any) => {
                    const h = new Date(s.scheduled_at).getHours()
                    if (!byHour[h]) byHour[h] = []
                    byHour[h].push(s)
                  })

                  return (
                    <div key={day.toDateString()} style={{ width: DAY_W, flexShrink: 0, borderLeft: '1px solid #F3F4F6' }}>
                      {/* Day header */}
                      <div style={{ height: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: isToday ? '#E24B4A' : '#F9FAFB', borderBottom: isToday ? '2px solid #C73B3A' : '1px solid #F3F4F6' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: isToday ? 'rgba(255,255,255,0.85)' : '#6B7280', letterSpacing: '0.05em' }}>
                          {day.toLocaleDateString('en-SG', { weekday: 'short' }).toUpperCase()}
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 800, color: isToday ? 'white' : '#111827' }}>
                          {day.toLocaleDateString('en-SG', { day: '2-digit', month: 'short' })}
                        </span>
                      </div>

                      {/* Hour rows */}
                      {HOURS.map(h => {
                        const slotSessions = byHour[h] || []
                        const slotH = slotSessions.length > 0
                          ? Math.max(HOUR_H, slotSessions.length * HOUR_H)
                          : HOUR_H

                        return (
                          <div key={h} style={{ height: slotH, borderBottom: '1px solid #F9FAFB', position: 'relative', background: h % 2 === 0 ? '#FAFAFA' : 'white' }}>
                            {slotSessions.map((s: any, idx: number) => {
                              const color = trainerColor[s.trainer?.id] || '#6B7280'
                              const durH = Math.max(0.5, (s.duration_minutes || 60) / 60)
                              const blockH = Math.min(durH * HOUR_H - 2, HOUR_H - 2)
                              const firstName = s.trainer?.full_name?.split(' ')[0] || '?'
                              const timeStr = new Date(s.scheduled_at).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })
                              const isCompleted = s.status === 'completed'

                              return (
                                <div key={s.id}
                                  onClick={() => isManager ? setCalendarModal(s) : undefined}
                                  style={{
                                    position: 'absolute', left: 2, right: 2,
                                    top: idx * HOUR_H + 1, height: blockH,
                                    background: color, opacity: isCompleted ? 0.55 : 0.9,
                                    borderRadius: 4, padding: '2px 4px',
                                    cursor: isManager ? 'pointer' : 'default',
                                    overflow: 'hidden',
                                    display: 'flex', flexDirection: 'column', justifyContent: 'flex-start',
                                  }}>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: 'white', lineHeight: 1.2 }}>{firstName}</span>
                                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.85)', lineHeight: 1.2 }}>{timeStr}</span>
                                  {isCompleted && <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.7)' }}>done</span>}
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Session detail modal — manager only */}
            {calendarModal && isManager && (
              <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setCalendarModal(null)}>
                <div className="fixed inset-0 bg-black/30" />
                <div className="relative bg-white rounded-2xl shadow-xl p-5 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-gray-900 text-sm">Session Details</h3>
                    <button onClick={() => setCalendarModal(null)}><X className="w-4 h-4 text-gray-400" /></button>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ background: trainerColor[calendarModal.trainer?.id] || '#6B7280' }} />
                      <div>
                        <p className="text-xs text-gray-400">Trainer</p>
                        <p className="text-sm font-medium text-gray-900">{calendarModal.trainer?.full_name}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Client</p>
                      <p className="text-sm font-medium text-gray-900">{calendarModal.member?.full_name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">PT Package</p>
                      <p className="text-sm font-medium text-gray-900">{calendarModal.package?.package_name || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Session Progress</p>
                      {calendarModal.package ? (() => {
                        const used = calendarModal.package.sessions_used || 0
                        const total = calendarModal.package.total_sessions || 0
                        const remaining = total - used
                        return <p className="text-sm font-medium text-gray-900">Session {used}/{total} · {remaining} remaining</p>
                      })() : <p className="text-sm text-gray-400">—</p>}
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Date & Time</p>
                      <p className="text-sm font-medium text-gray-900">
                        {formatDate(calendarModal.scheduled_at?.split('T')[0])} · {new Date(calendarModal.scheduled_at).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Duration</p>
                      <p className="text-sm font-medium text-gray-900">{calendarModal.duration_minutes || 60} minutes</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Status</p>
                      <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
                        calendarModal.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700')}>
                        {calendarModal.status}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })()}


      {/* ── Manager alerts section ── */}
      {isManager && totalAlerts > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" /> Alerts Requiring Attention
          </h2>

          {/* Low session packages */}
          {lowSessionPackages.length > 0 && (
            <div className="card">
              <div className="p-3 border-b border-amber-100 bg-amber-50 rounded-t-xl">
                <p className="text-sm font-medium text-amber-800 flex items-center gap-2">
                  <Package className="w-4 h-4" /> {lowSessionPackages.length} PT Package{lowSessionPackages.length > 1 ? 's' : ''} Running Low (≤3 sessions left)
                </p>
              </div>
              <div className="divide-y divide-gray-100">
                {lowSessionPackages.map((pkg: any) => (
                  <div key={pkg.id} className="flex items-center gap-3 p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{pkg.member?.full_name}</p>
                      <p className="text-xs text-gray-500">{pkg.package_name} · {pkg.trainer?.full_name}</p>
                    </div>
                    <span className="text-sm font-bold text-amber-600 flex-shrink-0">
                      {pkg.total_sessions - pkg.sessions_used} left
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Expiring memberships — non-dismissible, manager must action each */}
          {expiringMemberships.filter((m: any) => !m.membership_actioned).length > 0 && (
            <div className="card border border-amber-300 overflow-hidden">
              <div className="bg-amber-500 px-4 py-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-white flex-shrink-0" />
                <p className="text-sm font-semibold text-white">
                  {expiringMemberships.filter((m: any) => !m.membership_actioned).length} membership{expiringMemberships.filter((m: any) => !m.membership_actioned).length > 1 ? 's' : ''} expiring — action required
                </p>
              </div>
              <div className="divide-y divide-amber-100">
                {expiringMemberships.filter((m: any) => !m.membership_actioned).map((m: any) => (
                  <div key={m.id} className="flex items-center gap-3 p-3 bg-amber-50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{m.member?.full_name}</p>
                      <p className="text-xs text-amber-700">{m.membership_type_name} · expires {formatDate(m.end_date)}
                        {m.escalated_to_biz_ops && <span className="ml-2 text-red-600 font-medium">⚠ Escalated to Biz Ops</span>}
                      </p>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <Link href={`/dashboard/members/${m.member_id}`}
                        className="text-xs bg-red-600 text-white px-2.5 py-1.5 rounded-lg font-medium hover:bg-red-700">
                        Renew
                      </Link>
                      <button onClick={() => { setNonRenewalModal(m); setNonRenewalReason(''); setNonRenewalOther('') }}
                        className="text-xs bg-white text-amber-700 border border-amber-300 px-2.5 py-1.5 rounded-lg font-medium hover:bg-amber-50">
                        Non-Renewal
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

      {expiringPackages.length > 0 && (
            <div className="card">
              <div className="p-3 border-b border-red-100 bg-red-50 rounded-t-xl">
                <p className="text-sm font-medium text-red-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> {expiringPackages.length} PT Package{expiringPackages.length > 1 ? 's' : ''} Expiring Within 14 Days
                </p>
              </div>
              <div className="divide-y divide-gray-100">
                {expiringPackages.map((pkg: any) => (
                  <div key={pkg.id} className="flex items-center gap-3 p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{pkg.member?.full_name}</p>
                      <p className="text-xs text-gray-500">{pkg.package_name} · {pkg.trainer?.full_name}</p>
                    </div>
                    <span className="text-xs text-red-600 font-medium flex-shrink-0">
                      Expires {formatDate(pkg.end_date_calculated)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* At-risk members */}
          {atRiskMembers.length > 0 && (
            <div className="card">
              <div className="p-3 border-b border-gray-200 bg-gray-50 rounded-t-xl">
                <p className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <UserX className="w-4 h-4" /> {atRiskMembers.length} Member{atRiskMembers.length > 1 ? 's' : ''} with Expired Package — Not Renewed
                </p>
              </div>
              <div className="divide-y divide-gray-100">
                {atRiskMembers.map((m: any) => (
                  <div key={m.member_id} className="flex items-start gap-3 p-3">
                    <UserX className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{m.member?.full_name}</p>
                      <p className="text-xs text-gray-500">{m.member?.phone} · expired {formatDate(m.end_date_calculated)}</p>
                      {m.non_renewal_reason && (
                        <p className="text-xs text-red-500 mt-0.5">Reason: {m.non_renewal_reason}</p>
                      )}
                      {m.renewal_status === 'undecided' && (
                        <p className="text-xs text-amber-500 mt-0.5">Member was undecided — follow up needed</p>
                      )}
                      {!m.renewal_status && (
                        <p className="text-xs text-gray-400 mt-0.5 italic">No renewal decision recorded</p>
                      )}
                    </div>
                    <Link href={`/dashboard/members/${m.member_id}`} className="text-xs text-red-600 font-medium flex-shrink-0">View</Link>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Upcoming sessions ── */}
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
                  <p className="text-xs text-gray-500">{formatDateTime(s.scheduled_at)}{!isTrainer && ` · ${s.trainer?.full_name}`}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Trainer quick actions ── */}
      {isTrainer && (
        <div className="card p-4">
          <h2 className="font-semibold text-gray-900 text-sm mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-2">
            <Link href="/dashboard/members/new" className="btn-primary text-center text-sm">Register Member</Link>
            <Link href="/dashboard/pt/sessions/new" className="btn-secondary text-center text-sm">Schedule Session</Link>
          </div>
        </div>
      )}
      {/* ── Staff quick actions ── */}
      {isStaff && (
        <div className="card p-4">
          <h2 className="font-semibold text-gray-900 text-sm mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-2">
            <Link href="/dashboard/membership/sales" className="btn-primary text-center text-sm">Log Membership Sale</Link>
            <Link href="/dashboard/members" className="btn-secondary text-center text-sm">Member Lookup</Link>
          </div>
        </div>
      )}
    </div>
  )
}
