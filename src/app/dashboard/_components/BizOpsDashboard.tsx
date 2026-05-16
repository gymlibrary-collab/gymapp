'use client'

// ============================================================
// src/app/dashboard/_components/BizOpsDashboard.tsx
//
// PURPOSE:
//   Dashboard for the 'business_ops' role.
//   Shows system-wide gym overview, alerts, commission stats,
//   and operational activity across all gym outlets.
//
// ARCHITECTURE:
//   Contains two logical sections previously defined as local
//   functions in page.tsx:
//     BizOpsDashboardAlerts — leave/CPF/holiday alerts
//     BizOpsGymTabs — per-gym operational overview
//
// DATA:
//   BizOpsDashboardAlerts: leave counts, public holidays, CPF config
//   BizOpsGymTabs: 10 bulk queries across all gyms + escalation per gym
//
// ROUTING:
//   Rendered by dashboard/page.tsx when user.role === 'business_ops'
// ============================================================

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Calendar, AlertCircle, AlertTriangle, Bell, X, XCircle } from 'lucide-react'
import Link from 'next/link'
import { cn, formatSGD, formatDate, getMonthName, getGreeting, getDisplayName, nowSGT} from '@/lib/utils'
import StaffBirthdayPanel from './StaffBirthdayPanel'
import { getTodayStart, getTodayEnd, getMonthStart, getDaysFromToday, getTodayStr } from '@/lib/dashboard'

interface BizOpsDashboardProps {
  user: any
}


// ── BizOpsDashboardAlerts ─────────────────────────────────────
// Leave notifications + year-end admin reminders (CPF, holidays, entitlements)
function BizOpsDashboardAlerts({ user }: { user: any }) {
  const [pendingManagerLeave, setPendingManagerLeave] = useState(0)
  const [escalatedLeave, setEscalatedLeave] = useState(0)
  const [holidaysSetUp, setHolidaysSetUp] = useState(true)
  const [cpfRatesSetUp, setCpfRatesSetUp] = useState(true)
  const [leaveResetReminder, setLeaveResetReminder] = useState(false)
  const [leaveResetYear, setLeaveResetYear] = useState<number>(2026)
  const [cancelApprovedNotifs, setCancelApprovedNotifs] = useState<any[]>([])
  const [disputedShifts, setDisputedShifts] = useState<any[]>([])
  const [showDisputePanel, setShowDisputePanel] = useState(false)
  const [resolvingDispute, setResolvingDispute] = useState<string | null>(null)
  const supabase = createClient()

  const resolveDispute = async (shiftId: string, resolution: 'approved' | 'rejected') => {
    setResolvingDispute(shiftId)
    const shift = disputedShifts.find((s: any) => s.id === shiftId)
    if (!shift) return
    const newStatus = resolution === 'approved' ? 'absent' : 'completed'
    const resolvedAt = nowSGT().toISOString()
    const { error } = await supabase.from('duty_roster').update({
      status: newStatus, dispute_resolved_at: resolvedAt,
      dispute_resolved_by: user?.id, dispute_resolution: resolution,
      // Clear payslip_id so shift is picked up in next payslip run if resolved as worked
      payslip_id: null,
    }).eq('id', shiftId)
    if (error) { setResolvingDispute(null); return }
    if (resolution === 'approved') {
      const shiftMonth = parseInt(shift.shift_date.split('-')[1])
      const shiftYear = parseInt(shift.shift_date.split('-')[0])
      const { data: existingPayslip } = await supabase.from('payslips')
        .select('id, status').eq('user_id', shift.user_id)
        .eq('gym_id', shift.gym_id).eq('period_month', shiftMonth).eq('period_year', shiftYear)
        .in('status', ['approved', 'paid']).maybeSingle()
      if (existingPayslip) {
        await supabase.from('pending_deductions').insert({
          user_id: shift.user_id, gym_id: shift.gym_id, amount: shift.gross_pay,
          reason: `Overpayment recovery — absent shift on ${shift.shift_date} (dispute approved)`,
          shift_id: shiftId, shift_date: shift.shift_date,
        })
      }
    }
    const message = resolution === 'approved'
      ? `Your shift on ${shift.shift_date} at ${shift.gym?.name} has been marked absent after dispute review. Any overpayment will be recovered in your next payslip.`
      : `Your shift on ${shift.shift_date} at ${shift.gym?.name} has been confirmed as worked after dispute review.`
    await supabase.from('shift_dispute_notif').insert({
      user_id: shift.user_id, shift_id: shiftId,
      shift_date: shift.shift_date, gym_id: shift.gym_id, resolution, message,
    })
    // Notify the manager who raised the dispute
    const managerMessage = resolution === 'approved'
      ? `Dispute approved — ${shift.user?.full_name}'s shift on ${shift.shift_date} confirmed absent. Excluded from payroll.`
      : `Dispute rejected — ${shift.user?.full_name}'s shift on ${shift.shift_date} confirmed as worked. Included in payroll.`
    await supabase.from('manager_dispute_notif').insert({
      manager_id: shift.disputed_by,
      shift_id: shiftId,
      staff_name: shift.user?.full_name || '',
      shift_date: shift.shift_date,
      gym_id: shift.gym_id,
      resolution,
      message: managerMessage,
    })
    setDisputedShifts((prev: any[]) => prev.filter((s: any) => s.id !== shiftId))
    setResolvingDispute(null)
    if (disputedShifts.length <= 1) setShowDisputePanel(false)
  }

  useEffect(() => {
    const load = async () => {
      // Banner 1: Manager leave — always goes direct to biz-ops (no escalation)
      const { data: mgrIds } = await supabase.from('users_safe')
        .select('id').eq('role', 'manager')
      const managerUserIds = mgrIds?.map((m: any) => m.id) || []
      if (managerUserIds.length > 0) {
        const { count: mgrLeaveCount } = await supabase.from('leave_applications')
          .select('id', { count: 'exact', head: true })
          .in('user_id', managerUserIds).eq('status', 'pending')
        setPendingManagerLeave(mgrLeaveCount || 0)
      }

      // Banner 2: Escalated trainer/staff leave (pending > 48h, escalated_to_biz_ops=true)
      const { count: escalatedCount } = await supabase.from('leave_applications')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .eq('escalated_to_biz_ops', true)
        .not('user_id', 'in', `(${(mgrIds || []).map((m: any) => m.id).join(',') || 'null'})`)
      setEscalatedLeave(escalatedCount || 0)

      // Year-end reminders (December only)
      const now = nowSGT() // SGT
      // Approved cancellation notifications
      const { data: cancelNotifs } = await supabase
        .from('cancellation_approved_notif')
        .select('id, member_name, gym_id, cancellation_date, approved_by_name')
        .is('seen_at', null)
        .order('approved_at', { ascending: false })
      setCancelApprovedNotifs(cancelNotifs || [])

      // Disputed roster shifts awaiting resolution
      const { data: disputed } = await supabase.from('duty_roster')
        .select('*, user:users!duty_roster_user_id_fkey(full_name), gym:gyms(name)')
        .eq('status', 'disputed')
        .order('disputed_at', { ascending: true })
      setDisputedShifts(disputed || [])

      if (now.getUTCMonth() === 11) {
        const nextYear = now.getUTCFullYear() + 1
        const { count } = await supabase.from('public_holidays')
          .select('id', { count: 'exact', head: true }).eq('year', nextYear)
        setHolidaysSetUp((count || 0) > 0)

        const { count: cpfCount } = await supabase.from('cpf_age_brackets')
          .select('id', { count: 'exact', head: true })
          .eq('effective_from', `${nextYear}-01-01`)
        setCpfRatesSetUp((cpfCount || 0) >= 5)
      }

      // Year-end leave reset reminder: 25 Dec to 2 Jan
      const month = now.getUTCMonth()
      const day = now.getUTCDate()
      const isInWindow = (month === 11 && day >= 28) || (month === 0 && day === 1)
      if (isInWindow) {
        const { data: appSettings } = await supabase
          .from('app_settings')
          .select('leave_reset_year, leave_reset_reminder_seen_at')
          .eq('id', 'global').maybeSingle()
        const resetYear = appSettings?.leave_reset_year || 2026
        setLeaveResetYear(resetYear)
        const resetAlreadyRun = resetYear === now.getUTCFullYear()
        if (!resetAlreadyRun) {
          const seenAt = appSettings?.leave_reset_reminder_seen_at
          const isJan1 = month === 0 && day === 1
          if (isJan1) {
            // On 1 Jan: only show if not yet permanently dismissed this year
            const windowStart = new Date(now.getUTCFullYear(), 0, 1) // 1 Jan
            if (!seenAt || new Date(seenAt) < windowStart) {
              setLeaveResetReminder(true)
            }
          } else {
            // 28-31 Dec: always show (session-only dismiss)
            setLeaveResetReminder(true)
          }
        }
      }
    }
    load()
  }, [])

  if (pendingManagerLeave === 0 && escalatedLeave === 0 && holidaysSetUp && cpfRatesSetUp && cancelApprovedNotifs.length === 0 && disputedShifts.length === 0 && !leaveResetReminder) return null

  return (
    <div className="space-y-3">
      {pendingManagerLeave > 0 && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <Calendar className="w-5 h-5 text-blue-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-800">
              {pendingManagerLeave} manager leave application{pendingManagerLeave > 1 ? 's' : ''} awaiting your approval
            </p>
          </div>
          <Link href="/dashboard/hr/leave" className="btn-primary text-xs py-1.5 flex-shrink-0">Review</Link>
        </div>
      )}
      {escalatedLeave > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <Calendar className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">
              Escalated: {escalatedLeave} leave application{escalatedLeave > 1 ? 's' : ''} awaiting your approval
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
              Action required — {nowSGT().getUTCFullYear() + 1} CPF age bracket rates not yet configured
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Update CPF rates effective from 1 Jan {nowSGT().getUTCFullYear() + 1} before processing payroll.
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
              Action required — {nowSGT().getUTCFullYear() + 1} public holidays not yet configured
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Set up next year's public holidays so leave calculations remain accurate.
            </p>
          </div>
          <Link href="/dashboard/config/public-holidays" className="btn-primary text-xs py-1.5 flex-shrink-0">Set Up</Link>
        </div>
      )}

      {leaveResetReminder && (() => {
        const today = nowSGT()
        const isJan1 = today.getUTCMonth() === 0 && today.getUTCDate() === 1
        return (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">
                Reminder — Run the year-end leave reset on 1 January
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                {isJan1
                  ? 'Today is 1 Jan — go to Leave Management to run the year-end reset now.'
                  : 'The year-end leave reset will be available from 1 Jan. Go to Leave Management to run it.'}
              </p>
            </div>
            {isJan1 ? (
              <button onClick={async () => {
                await supabase.from('app_settings')
                  .update({ leave_reset_reminder_seen_at: new Date().toISOString() }).eq('id', 'global')
                setLeaveResetReminder(false)
              }} className="text-xs text-amber-600 hover:underline flex-shrink-0">Dismiss</button>
            ) : (
              <button onClick={() => setLeaveResetReminder(false)}
                className="text-xs text-amber-600 hover:underline flex-shrink-0">Dismiss</button>
            )}
          </div>
        )
      })()}

      {cancelApprovedNotifs.length > 0 && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800">
              {cancelApprovedNotifs.length} mid-term membership cancellation{cancelApprovedNotifs.length > 1 ? 's' : ''} approved
            </p>
            <p className="text-xs text-red-600 mt-0.5">
              {cancelApprovedNotifs.slice(0, 2).map((n: any) => n.member_name).join(', ')}
              {cancelApprovedNotifs.length > 2 ? ` +${cancelApprovedNotifs.length - 2} more` : ''}
            </p>
          </div>
          <button onClick={async () => {
            const now = new Date().toISOString()
            for (const n of cancelApprovedNotifs) await supabase.from('cancellation_approved_notif').update({ seen_at: now }).eq('id', n.id)
            setCancelApprovedNotifs([])
          }} className="text-xs text-red-600 hover:underline flex-shrink-0">Dismiss</button>
        </div>
      )}

      {/* Disputed shifts banner */}
      {disputedShifts.length > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">
              {disputedShifts.length} disputed shift{disputedShifts.length !== 1 ? 's' : ''} awaiting resolution
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              {disputedShifts.map((s: any) => `${s.user?.full_name} (${s.shift_date})`).join(', ')}
            </p>
          </div>
          <button onClick={() => setShowDisputePanel(true)}
            className="text-xs text-amber-700 font-medium hover:underline flex-shrink-0">
            Review
          </button>
        </div>
      )}

      {/* Dispute resolution slide-out panel */}
      {showDisputePanel && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Disputed Shifts</h2>
              <button onClick={() => setShowDisputePanel(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {disputedShifts.map((shift: any) => (
                <div key={shift.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{shift.user?.full_name}</p>
                      <p className="text-xs text-gray-500">{shift.gym?.name} · {shift.shift_date} · {shift.shift_start}–{shift.shift_end}</p>
                      <p className="text-xs text-gray-500">{shift.hours_worked?.toFixed(1)}h · {formatSGD(shift.gross_pay)}</p>
                    </div>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-2">
                    <p className="text-xs text-amber-800"><strong>Reason:</strong> {shift.dispute_reason}</p>
                    <p className="text-xs text-amber-600 mt-0.5">Raised: {new Date(shift.disputed_at).toLocaleDateString('en-SG')}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => resolveDispute(shift.id, 'approved')}
                      disabled={resolvingDispute === shift.id}
                      className="flex-1 text-xs py-1.5 rounded-lg bg-red-100 text-red-700 font-medium hover:bg-red-200 disabled:opacity-50">
                      Approve — Mark Absent
                    </button>
                    <button onClick={() => resolveDispute(shift.id, 'rejected')}
                      disabled={resolvingDispute === shift.id}
                      className="flex-1 text-xs py-1.5 rounded-lg bg-green-100 text-green-700 font-medium hover:bg-green-200 disabled:opacity-50">
                      Reject — Confirm Worked
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── BizOpsGymTabs ─────────────────────────────────────────────
// Per-gym operational overview with bulk queries + commission stats
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
  const now = nowSGT() // SGT
  const monthStart = getMonthStart()
  const todayStart = getTodayStart()
  const todayEnd = getTodayEnd()
  const in7Days = getDaysFromToday(7)

  const bizCommPeriodDate = new Date(now.getUTCFullYear(), now.getUTCMonth() + bizCommOffset, 1)
  const bizCommPeriodStart = bizCommPeriodDate.toISOString()
  const bizCommPeriodEnd = new Date(now.getUTCFullYear(), now.getUTCMonth() + bizCommOffset + 1, 0, 23, 59, 59).toISOString()
  const bizCommPeriodLabel = bizCommPeriodDate.toLocaleDateString('en-SG', { month: 'long', year: 'numeric' })

  useEffect(() => {
    const load = async () => {
      const { data: gymsData } = await supabase.from('gyms').select('id, name').eq('is_active', true).order('name')

      const gymIds = (gymsData || []).map((g: any) => g.id)
      const todayStr = getTodayStr()
      const in30DaysBizOps = getDaysFromToday(30)

      // 10 bulk queries — all pure reads, safe for Promise.all
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
        { data: allCommItems },
      ] = await Promise.all([
        supabase.from('sessions').select('gym_id, scheduled_at, status, member:members(full_name), trainer:users!sessions_trainer_id_fkey(full_name)').in('gym_id', gymIds).gte('scheduled_at', todayStart).lte('scheduled_at', todayEnd).order('scheduled_at'),
        supabase.from('gym_memberships').select('gym_id').in('gym_id', gymIds).eq('sale_status', 'pending'),
        supabase.from('sessions').select('gym_id').in('gym_id', gymIds).eq('status', 'completed').not('notes_submitted_at', 'is', null).eq('manager_confirmed', false),
        supabase.from('packages').select('gym_id, package_name, sessions_used, total_sessions, member:members(full_name)').in('gym_id', gymIds).eq('status', 'active').limit(200),
        supabase.from('packages').select('gym_id, package_name, end_date_calculated, member:members(full_name)').in('gym_id', gymIds).eq('status', 'active').lte('end_date_calculated', in7Days).gte('end_date_calculated', todayStr).limit(50),
        supabase.from('gym_memberships').select('gym_id, id, end_date, member_id, membership_type_name, membership_actioned, escalated_to_biz_ops, member:members(full_name)').in('gym_id', gymIds).eq('status', 'active').eq('sale_status', 'confirmed').eq('escalated_to_biz_ops', true).eq('membership_actioned', false).lte('end_date', in30DaysBizOps).gte('end_date', todayStr),
        supabase.from('members').select('gym_id').in('gym_id', gymIds),
        supabase.from('gym_memberships').select('gym_id, price_sgd').in('gym_id', gymIds).eq('sale_status', 'confirmed').gte('created_at', monthStart),
        supabase.from('sessions').select('gym_id, session_commission_sgd').in('gym_id', gymIds).eq('status', 'completed').gte('marked_complete_at', monthStart),
        supabase.from('commission_items').select('gym_id, amount, payslip_id').in('gym_id', gymIds).gte('created_at', monthStart),
      ])

      // Per-gym assembly — escalation check stays sequential (write op)
      const enriched: any[] = []
      for (const g of (gymsData || [])) {
        const gId = g.id
        const todaySessions   = (allTodaySessions || []).filter((s: any) => s.gym_id === gId)
        const pendingMems     = (allPendingMems || []).filter((s: any) => s.gym_id === gId).length
        const pendingSess     = (allPendingSessions || []).filter((s: any) => s.gym_id === gId).length
        const lowPkgs         = (allLowPkgs || []).filter((p: any) => p.gym_id === gId && (p.total_sessions - p.sessions_used) <= 3).slice(0, 5)
        const expiringPkgs    = (allExpiringPkgs || []).filter((p: any) => p.gym_id === gId).slice(0, 5)
        const filteredExpiringMems = (allExpiringMems || []).filter((m: any) => m.gym_id === gId).slice(0, 10)
        const memberCount     = (allMembers || []).filter((m: any) => m.gym_id === gId).length
        const gymMemSales     = (allMemSales || []).filter((m: any) => m.gym_id === gId)
        const gymSessions     = (allSessions || []).filter((s: any) => s.gym_id === gId)
        const gymCommItems    = (allCommItems || []).filter((p: any) => p.gym_id === gId)

        // membership_expiry escalation moved to /api/cron/expire-memberships

        enriched.push({
          ...g, todaySessions, pendingMemberships: pendingMems, pendingSessions: pendingSess,
          lowPkgs, expiringPkgs, expiringMems: filteredExpiringMems,
          totalAlerts: pendingMems + pendingSess + lowPkgs.length + expiringPkgs.length + filteredExpiringMems.length,
          members: memberCount, membershipSalesCount: gymMemSales.length,
          membershipRevenue: gymMemSales.reduce((s: number, m: any) => s + (m.price_sgd || 0), 0),
          sessionsCount: gymSessions.length,
          commissionPayout: gymCommItems.reduce((s: number, p: any) => s + (p.amount || 0), 0),
        })
      }
      setGyms(enriched)
      const topGym = enriched.reduce((a: any, b: any) => b.totalAlerts > a.totalAlerts ? b : a, enriched[0])
      setSelectedGym(topGym?.id || enriched[0]?.id || null)
    }
    load()
  }, [])

  useEffect(() => {
    const loadBizComm = async () => {
      setBizCommLoading(true)
      const gymFilter = bizDrillGym || undefined
      let sessQ = supabase.from('sessions').select('session_commission_sgd').eq('status', 'completed').not('notes_submitted_at', 'is', null).eq('manager_confirmed', true).gte('marked_complete_at', bizCommPeriodStart).lte('marked_complete_at', bizCommPeriodEnd)
      if (gymFilter) sessQ = sessQ.eq('gym_id', gymFilter)
      const sessData = await sessQ
      let pkgQ = supabase.from('packages').select('signup_commission_sgd').eq('manager_confirmed', true).gte('created_at', bizCommPeriodStart).lte('created_at', bizCommPeriodEnd)
      if (gymFilter) pkgQ = pkgQ.eq('gym_id', gymFilter)
      const pkgData = await pkgQ
      let memQ = supabase.from('gym_memberships').select('commission_sgd').eq('sale_status', 'confirmed').gte('created_at', bizCommPeriodStart).lte('created_at', bizCommPeriodEnd)
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
    fetch('/api/activity-log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action_type: 'other', page: 'Commission Breakdown', description: `Biz Ops viewed commission breakdown by ${groupBy}` }) }).catch(() => {})
    let sessQ = supabase.from('sessions').select('session_commission_sgd, trainer_id, trainer:users!sessions_trainer_id_fkey(full_name)').eq('status', 'completed').not('notes_submitted_at', 'is', null).eq('manager_confirmed', true).gte('marked_complete_at', bizCommPeriodStart).lte('marked_complete_at', bizCommPeriodEnd)
    if (gymId) sessQ = sessQ.eq('gym_id', gymId)
    const sessData = await sessQ
    let pkgQ = supabase.from('packages').select('signup_commission_sgd, trainer_id, trainer:users!packages_trainer_id_fkey(full_name)').eq('manager_confirmed', true).gte('created_at', bizCommPeriodStart).lte('created_at', bizCommPeriodEnd)
    if (gymId) pkgQ = pkgQ.eq('gym_id', gymId)
    const pkgData = await pkgQ
    let memQ = supabase.from('gym_memberships').select('commission_sgd, sold_by_user_id, sold_by:users!gym_memberships_sold_by_user_id_fkey(full_name)').eq('sale_status', 'confirmed').gte('created_at', bizCommPeriodStart).lte('created_at', bizCommPeriodEnd)
    if (gymId) memQ = memQ.eq('gym_id', gymId)
    const memData = await memQ
    if (groupBy === 'staff') {
      const byStaff: Record<string, any> = {}
      sessData.data?.forEach((s: any) => { const id = s.trainer_id; if (!id) return; if (!byStaff[id]) byStaff[id] = { name: s.trainer?.full_name || 'Unknown', session: 0, signup: 0, membership: 0, total: 0 }; byStaff[id].session += s.session_commission_sgd || 0; byStaff[id].total += s.session_commission_sgd || 0 })
      pkgData.data?.forEach((p: any) => { const id = p.trainer_id; if (!id) return; if (!byStaff[id]) byStaff[id] = { name: p.trainer?.full_name || 'Unknown', session: 0, signup: 0, membership: 0, total: 0 }; byStaff[id].signup += p.signup_commission_sgd || 0; byStaff[id].total += p.signup_commission_sgd || 0 })
      memData.data?.forEach((m: any) => { const id = m.sold_by_user_id; if (!id) return; if (!byStaff[id]) byStaff[id] = { name: m.sold_by?.full_name || 'Unknown', session: 0, signup: 0, membership: 0, total: 0 }; byStaff[id].membership += m.commission_sgd || 0; byStaff[id].total += m.commission_sgd || 0 })
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

  useEffect(() => { if (bizDrillDown) loadBizDrillDown(bizDrillGym || undefined, bizDrillGroupBy) }, [bizCommOffset])

  if (gyms.length === 0) return null
  const g = gyms.find((x: any) => x.id === selectedGym) || gyms[0]
  const monthName = now.toLocaleString('default', { month: 'long' })
  const totals = gyms.reduce((acc: any, g: any) => ({
    members: acc.members + g.members,
    membershipRevenue: acc.membershipRevenue + g.membershipRevenue,
    sessionsCount: acc.sessionsCount + g.sessionsCount,
    commissionPayout: acc.commissionPayout + g.commissionPayout,
  }), { members: 0, membershipRevenue: 0, sessionsCount: 0, commissionPayout: 0 })

  return (
    <div className="space-y-3">
      {/* Commission drill-down modal */}
      {bizDrillDown && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-16 overflow-y-auto" onClick={() => setBizDrillDown(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">Commission Breakdown</h3>
                <p className="text-xs text-gray-400">{bizCommPeriodLabel} · {bizDrillGym ? gyms.find((g: any) => g.id === bizDrillGym)?.name || 'Selected gym' : 'All gyms'}</p>
              </div>
              <button onClick={() => setBizDrillDown(false)}><X className="w-4 h-4 text-gray-400" /></button>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => { setBizDrillGym(null); loadBizDrillDown(undefined, bizDrillGroupBy) }} className={cn('text-xs px-3 py-1 rounded-full border', !bizDrillGym ? 'bg-red-600 text-white border-red-600' : 'text-gray-600 border-gray-200')}>All gyms</button>
              {gyms.map((gym: any) => (
                <button key={gym.id} onClick={() => { setBizDrillGym(gym.id); loadBizDrillDown(gym.id, bizDrillGroupBy) }} className={cn('text-xs px-3 py-1 rounded-full border', bizDrillGym === gym.id ? 'bg-red-600 text-white border-red-600' : 'text-gray-600 border-gray-200')}>{gym.name}</button>
              ))}
            </div>
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
              {(['staff', 'type'] as const).map(opt => (
                <button key={opt} onClick={() => { setBizDrillGroupBy(opt); loadBizDrillDown(bizDrillGym || undefined, opt) }} className={cn('flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors', bizDrillGroupBy === opt ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500')}>
                  By {opt === 'staff' ? 'Staff' : 'Commission Type'}
                </button>
              ))}
            </div>
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
                      <p className="text-xs text-gray-400">{row.session > 0 && `Sessions: ${formatSGD(row.session)} `}{row.signup > 0 && `Signup: ${formatSGD(row.signup)} `}{row.membership > 0 && `Membership: ${formatSGD(row.membership)}`}</p>
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
                    <div><p className="text-sm font-medium text-gray-900">{row.name}</p><p className="text-xs text-gray-400">{row.count} transaction{row.count !== 1 ? 's' : ''}</p></div>
                    <p className="text-sm font-bold text-green-700">{formatSGD(row.amount)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Summary stats */}
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
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">Commission Earned</p>
            <div className="flex items-center gap-0.5">
              <button onClick={() => setBizCommOffset(o => Math.max(o - 1, -2))} disabled={bizCommOffset <= -2} className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30 px-1">←</button>
              <span className="text-xs text-gray-400">{bizCommPeriodLabel.split(' ')[0].slice(0, 3)}</span>
              <button onClick={() => setBizCommOffset(o => Math.min(o + 1, 0))} disabled={bizCommOffset >= 0} className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30 px-1">→</button>
            </div>
          </div>
          <p className="text-xl font-bold text-green-700 mt-1">{bizCommLoading ? '...' : formatSGD(bizCommStats.total)}</p>
          <div className="space-y-0.5 mt-1">
            <p className="text-xs text-gray-400">Sessions: {formatSGD(bizCommStats.session)}</p>
            <p className="text-xs text-gray-400">Signup: {formatSGD(bizCommStats.signup)}</p>
            <p className="text-xs text-gray-400">Membership: {formatSGD(bizCommStats.membership)}</p>
          </div>
          <button onClick={() => { setBizDrillDown(true); setBizDrillGroupBy('staff'); loadBizDrillDown(bizDrillGym || undefined, 'staff') }} className="text-xs text-red-600 hover:underline mt-1.5">View breakdown →</button>
        </div>
      </div>

      {/* Gym tabs */}
      <div className="flex gap-2 flex-wrap">
        {gyms.map((gym: any) => (
          <button key={gym.id} onClick={() => setSelectedGym(gym.id)} className={cn('flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors border', selectedGym === gym.id ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300')}>
            {gym.name}
            {gym.totalAlerts > 0 && (
              <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded-full', selectedGym === gym.id ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700')}>{gym.totalAlerts}</span>
            )}
          </button>
        ))}
      </div>

      {/* Selected gym detail */}
      {g && (
        <div className="card p-0 overflow-hidden">
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
          {(g.pendingMemberships > 0 || g.pendingSessions > 0) && (
            <div className="p-3 bg-amber-50 border-b border-amber-100">
              <p className="text-xs font-semibold text-amber-800 mb-1 flex items-center gap-1.5"><Bell className="w-3.5 h-3.5" /> Pending Confirmations</p>
              <div className="flex gap-3 text-xs text-amber-700">
                {g.pendingMemberships > 0 && <span>{g.pendingMemberships} membership sale{g.pendingMemberships !== 1 ? 's' : ''}</span>}
                {g.pendingSessions > 0 && <span>{g.pendingSessions} PT session{g.pendingSessions !== 1 ? 's' : ''}</span>}
              </div>
            </div>
          )}
          {(g.expiringMems.length > 0 || g.lowPkgs.length > 0 || g.expiringPkgs.length > 0) && (
            <div className="p-3 bg-red-50 border-b border-red-100">
              <p className="text-xs font-semibold text-red-800 mb-1 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Alerts</p>
              {g.expiringMems.map((m: any, i: number) => <p key={'mem'+i} className="text-xs text-amber-700">🪪 {m.member?.full_name} — {m.membership_type_name}: expires {formatDate(m.end_date)}</p>)}
              {g.lowPkgs.map((p: any, i: number) => <p key={'low'+i} className="text-xs text-red-700">{p.member?.full_name} — {p.package_name}: {p.total_sessions - p.sessions_used} sessions left</p>)}
              {g.expiringPkgs.map((p: any, i: number) => <p key={'exp'+i} className="text-xs text-red-700">{p.member?.full_name} — {p.package_name}: expires {formatDate(p.end_date_calculated)}</p>)}
            </div>
          )}
          <div className="p-3">
            <p className="text-xs font-semibold text-gray-600 mb-2">Today's PT Sessions ({g.todaySessions.length})</p>
            {g.todaySessions.length === 0 ? (
              <p className="text-xs text-gray-400">No sessions scheduled today</p>
            ) : (
              <div className="space-y-1">
                {g.todaySessions.map((s: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-gray-500 w-12 flex-shrink-0">{new Date(s.scheduled_at).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="text-gray-900 font-medium">{s.member?.full_name}</span>
                    <span className="text-gray-400">· {s.trainer?.full_name}</span>
                    <span className={cn('ml-auto px-1.5 py-0.5 rounded text-xs font-medium', s.status === 'completed' ? 'bg-green-100 text-green-700' : s.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700')}>{s.status}</span>
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

// ── BizOpsDashboard ───────────────────────────────────────────
export default function BizOpsDashboard({ user }: BizOpsDashboardProps) {
  const todayStr = new Date().toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{getGreeting(getDisplayName(user))} 👋</h1>
        <p className="text-sm text-gray-500">{todayStr}</p>
      </div>
      <StaffBirthdayPanel isBizOps={true} />
      <BizOpsDashboardAlerts user={user} />
      <BizOpsGymTabs />
    </div>
  )
}
