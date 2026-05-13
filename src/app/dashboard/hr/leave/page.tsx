'use client'

import { useActivityLog } from '@/hooks/useActivityLog'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { formatDate , getRoleLabel } from '@/lib/utils'
import { Calendar, CheckCircle, XCircle, Clock, AlertCircle, Users, Save } from 'lucide-react'
import { queueWhatsApp } from '@/lib/whatsapp'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { StatusBanner } from '@/components/StatusBanner'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { PageSpinner } from '@/components/PageSpinner'

const LEAVE_TYPES: Record<string, string> = {
  annual: 'Annual Leave', medical: 'Medical Leave',
  hospitalisation: 'Hospitalisation Leave', other: 'Other',
}

export default function LeaveManagementPage() {
  const { user, loading } = useCurrentUser({ allowedRoles: ['manager', 'business_ops', 'admin'] })

  const [applications, setApplications] = useState<any[]>([])
  const [staffBalances, setStaffBalances] = useState<any[]>([])
  const [filter, setFilter] = useState('pending')
  const [leaveResetYear, setLeaveResetYear] = useState<number>(2026)
  const [resetAlreadyRun, setResetAlreadyRun] = useState(false)
  const [pendingBlockingStaff, setPendingBlockingStaff] = useState<any[]>([])
  const [bulkAnnual, setBulkAnnual] = useState('14')
  const [bulkMedical, setBulkMedical] = useState('14')
  const [bulkHosp, setBulkHosp] = useState('60')
  const [maxCarryForward, setMaxCarryForward] = useState('5')
  const [bulkResetting, setBulkResetting] = useState(false)
  const [bulkResult, setBulkResult] = useState('')
  const { logActivity } = useActivityLog()
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [tab, setTab] = useState<'pending' | 'calendar' | 'history'>('pending')
  const [calendarOffset, setCalendarOffset] = useState(0) // days offset for 7-day view
  const router = useRouter()
  const supabase = createClient()

  const { success, error, showMsg } = useToast()




  const load = async () => {
    logActivity('page_view', 'Leave Management', 'Viewed leave management')
    const { data: settings } = await supabase
      .from('app_settings').select('max_leave_carry_forward_days, leave_reset_year').eq('id', 'global').maybeSingle()
    if (settings) {
      setMaxCarryForward((settings as any).max_leave_carry_forward_days?.toString() || '5')
      const resetYear = (settings as any).leave_reset_year || 2026
      setLeaveResetYear(resetYear)
      setResetAlreadyRun(resetYear === new Date().getFullYear())
    }

    // Get staff IDs this user can approve for
    let staffIds: string[] = []
    if (user!.role === 'manager' && user!.manager_gym_id) {
      // Manager approves: full-time trainers + ops staff at their gym
      // Part-timers do NOT apply for leave in this system
      const { data: opsStaff } = await supabase.from('users')
        .select('id').eq('manager_gym_id', user!.manager_gym_id)
        .eq('role', 'staff').neq('id', user!.id)
      const { data: gymTrainers } = await supabase.from('trainer_gyms')
        .select('trainer_id').eq('gym_id', user!.manager_gym_id)
      // Full-time trainers only — filter out part-timers
      const rawTrainerIds = (gymTrainers?.map((t: any) => t.trainer_id) || [])
        .filter((id: string) => id !== user!.id)
      let ftTrainerIds: string[] = []
      if (rawTrainerIds.length > 0) {
        const { data: ftOnly } = await supabase.from('users')
          .select('id').in('id', rawTrainerIds)
          .eq('role', 'trainer').eq('employment_type', 'full_time')
        ftTrainerIds = ftOnly?.map((t: any) => t.id) || []
      }
      const opsIds = opsStaff?.map((s: any) => s.id) || []
      staffIds = Array.from(new Set([...opsIds, ...ftTrainerIds]))
    } else if (user!.role === 'business_ops') {
      // Biz Ops approves:
      //   1. Manager leave (always)
      //   2. Trainer + staff leave escalated after 48h without manager action
      // staffIds must cover all three groups — the pending filter then applies
      // escalated_to_biz_ops=true to show only what needs biz-ops attention
      const { data: allStaff } = await supabase.from('users')
        .select('id').in('role', ['manager', 'trainer', 'staff']).eq('is_archived', false)
      staffIds = allStaff?.map((m: any) => m.id) || []
    } else if (user!.role === 'admin') {
      // Admin approves Business Ops leave
      const { data: bizOps } = await supabase.from('users')
        .select('id').eq('role', 'business_ops')
      staffIds = bizOps?.map((b: any) => b.id) || []
    }

    if (staffIds.length === 0) { return }

    let q = supabase.from('leave_applications')
      .select('*, user:users!leave_applications_user_id_fkey(full_name, role, leave_entitlement_days)')
      .in('user_id', staffIds)
      .order('created_at', { ascending: false })
    if (filter === 'pending') {
      q = q.in('status', ['pending', 'withdrawal_requested'])
      if (user!.role === 'business_ops') {
        // Biz-ops pending tab: escalated_to_biz_ops=true covers both
        // manager leave (always escalated) and escalated trainer/staff leave
        q = q.eq('escalated_to_biz_ops', true)
      }
      // Manager: no escalation filter — retains visibility even after escalation to biz-ops
    } else if (filter !== 'all') {
      q = q.eq('status', filter)
    }
    const { data } = await q
    setApplications(data || [])

    // Staff leave balances
    const { data: staff } = await supabase.from('users')
      .select('id, full_name, role, leave_entitlement_days')
      .in('id', staffIds).eq('is_archived', false)

    const currentYear = new Date().getFullYear()

    // Count only days falling within the current calendar year
    // Handles cross-year leave (e.g. Dec 30 — Jan 3) by prorating days_applied
    const countDaysInYear = (app: any, year: number) => {
      const yearStart = `${year}-01-01`
      const yearEnd = `${year}-12-31`
      const start = app.start_date < yearStart ? yearStart : app.start_date
      const end = app.end_date > yearEnd ? yearEnd : app.end_date
      if (end < start) return 0
      const appDays = (new Date(app.end_date).getTime() - new Date(app.start_date).getTime()) / 86400000 + 1
      const inYearDays = (new Date(end).getTime() - new Date(start).getTime()) / 86400000 + 1
      return appDays > 0 ? Math.round(app.days_applied * inYearDays / appDays) : 0
    }

    // Load leave applications overlapping the current year (not just starting in it)
    const { data: approvedLeave } = await supabase.from('leave_applications')
      .select('user_id, days_applied, start_date, end_date')
      .in('user_id', staffIds).eq('status', 'approved')
      .lte('start_date', `${currentYear}-12-31`)
      .gte('end_date', `${currentYear}-01-01`)
    const { data: pendingLeave } = await supabase.from('leave_applications')
      .select('user_id, days_applied, start_date, end_date')
      .in('user_id', staffIds).eq('status', 'pending')
      .lte('start_date', `${currentYear}-12-31`)
      .gte('end_date', `${currentYear}-01-01`)

    const takenByStaff: Record<string, number> = {}
    approvedLeave?.forEach((l: any) => {
      takenByStaff[l.user_id] = (takenByStaff[l.user_id] || 0) + countDaysInYear(l, currentYear)
    })
    const pendingByStaff: Record<string, number> = {}
    pendingLeave?.forEach((l: any) => {
      pendingByStaff[l.user_id] = (pendingByStaff[l.user_id] || 0) + countDaysInYear(l, currentYear)
    })

    setStaffBalances(staff?.map(s => ({
      ...s,
      taken: takenByStaff[s.id] || 0,
      pending: pendingByStaff[s.id] || 0,
      // balance = approved-only (shown as flag if negative — Issue 2)
      balance: s.leave_entitlement_days != null
        ? s.leave_entitlement_days - (takenByStaff[s.id] || 0)
        : 0,
      // available = entitlement minus approved AND pending (used for approval check — Issue 1)
      available: s.leave_entitlement_days != null
        ? s.leave_entitlement_days - (takenByStaff[s.id] || 0) - (pendingByStaff[s.id] || 0)
        : 0,
    })) || [])

  }

  useEffect(() => { if (user) load() }, [user, filter])

  if (loading) return <PageSpinner />
  if (!user) return null


  const handleApprove = async (id: string) => {
    const { data: { user: authUser } } = await supabase.auth.getUser()

    // Hard block: check entitlement before approving
    const app = applications.find(a => a.id === id)
    if (app) {
      const staffBalance = staffBalances.find(s => s.id === app.user_id)
      if (staffBalance) {
        if (staffBalance.leave_entitlement_days == null) {
          alert('Cannot approve — leave entitlement has not been set for this staff member. Please ask Business Operations to update their entitlement first.')
          return
        }
        // Check: entitlement - taken - OTHER pending (excluding the app being approved)
        // Do NOT include app.days_applied in pending — it would double-count
        const otherPending = Math.max(0, staffBalance.pending - app.days_applied)
        const availableForApproval = (staffBalance.leave_entitlement_days ?? 0) - staffBalance.taken - otherPending
        const remainingAfterApproval = availableForApproval - app.days_applied
        if (remainingAfterApproval < 0) {
          const pendingNote = otherPending > 0
            ? ` (${otherPending} day${otherPending !== 1 ? 's' : ''} already committed to other pending applications)`
            : ''
          alert(`Cannot approve — this would exceed the staff member's leave entitlement. They have ${availableForApproval} day${availableForApproval !== 1 ? 's' : ''} available${pendingNote}, but this application is for ${app.days_applied} day${app.days_applied !== 1 ? 's' : ''}.`)
          return
        }
      }
    }

    await supabase.from('leave_applications').update({
      status: 'approved', approver_id: user!.id, approved_at: new Date().toISOString(),
    }).eq('id', id)
    // WhatsApp to applicant (app already declared above)
    if (app) {
      const { data: applicant } = await supabase.from('users').select('phone, full_name').eq('id', app.user_id).maybeSingle()
      await queueWhatsApp(supabase, {
        notificationType: 'leave_approved',
        phone: applicant?.phone,
        name: applicant?.full_name,
        placeholders: {
          staff_name: applicant?.full_name || '',
          leave_type: LEAVE_TYPES[app.leave_type] || app.leave_type,
          start_date: formatDate(app.start_date),
          end_date: formatDate(app.end_date),
          days: String(app.days_applied),
        },
        fallbackMessage: `Your ${LEAVE_TYPES[app.leave_type] || app.leave_type} from ${formatDate(app.start_date)} to ${formatDate(app.end_date)} (${app.days_applied} day${app.days_applied !== 1 ? 's' : ''}) has been APPROVED.`,
      })
    }
    logActivity('approve', 'Leave Management', 'Approved leave application')
    // Write in-app decision notification
    if (app) {
        await supabase.from('leave_decision_notif').insert({
        user_id: app.user_id,
        leave_type: app.leave_type,
        start_date: app.start_date,
        end_date: app.end_date,
        days_applied: app.days_applied,
        decision: 'approved',
        decided_by_name: user!.full_name || 'Manager',
      })
    }
    await load(); showMsg('Leave approved')
  }

  const handleReject = async () => {
    if (!rejectId || !rejectReason.trim()) return
    const { data: rejectedApp } = await supabase.from('leave_applications')
      .select('user_id, leave_type, start_date, end_date, days_applied').eq('id', rejectId).maybeSingle()
    const { data: { user: authUser3 } } = await supabase.auth.getUser()
    const { data: me3 } = await supabase.from('users').select('full_name').eq('id', authUser3!.id).maybeSingle()
    await supabase.from('leave_applications').update({
      status: 'rejected', rejection_reason: rejectReason,
      rejected_at: new Date().toISOString(),
    }).eq('id', rejectId)
    // WhatsApp to applicant
    const app = applications.find(a => a.id === rejectId)
    if (app) {
      const { data: applicant } = await supabase.from('users').select('phone, full_name').eq('id', app.user_id).maybeSingle()
      await queueWhatsApp(supabase, {
        notificationType: 'leave_rejected',
        phone: applicant?.phone,
        name: applicant?.full_name,
        placeholders: {
          staff_name: applicant?.full_name || '',
          leave_type: LEAVE_TYPES[app.leave_type] || app.leave_type,
          start_date: formatDate(app.start_date),
          end_date: formatDate(app.end_date),
          rejection_reason: rejectReason,
        },
        fallbackMessage: `Your ${LEAVE_TYPES[app.leave_type] || app.leave_type} from ${formatDate(app.start_date)} to ${formatDate(app.end_date)} has been REJECTED. Reason: ${rejectReason}`,
      })
    }
    logActivity('reject', 'Leave Management', 'Rejected leave application')
    // Write in-app decision notification
    if (rejectedApp) {
      await supabase.from('leave_decision_notif').insert({
        user_id: rejectedApp.user_id,
        leave_type: rejectedApp.leave_type,
        start_date: rejectedApp.start_date,
        end_date: rejectedApp.end_date,
        days_applied: rejectedApp.days_applied,
        decision: 'rejected',
        rejection_reason: rejectReason,
        decided_by_name: (me3 as any)?.full_name || 'Manager',
      })
    }
    setRejectId(null); setRejectReason(''); await load(); showMsg('Leave rejected')
  }

  const statusBadge = (s: string) => s === 'approved' ? 'badge-active' : s === 'pending' ? 'badge-pending' : 'badge-danger'


  const handleBulkReset = async () => {
    const closingYear = new Date().getFullYear() - 1
    const { data: blocking } = await supabase
      .from('leave_applications')
      .select('id, start_date, end_date, user:users!leave_applications_user_id_fkey(full_name)')
      .eq('status', 'pending')
      .gte('start_date', `${closingYear}-01-01`)
      .lte('start_date', `${closingYear}-12-31`)
    if (blocking && blocking.length > 0) { setPendingBlockingStaff(blocking); return }
    if (!confirm(`Reset leave entitlements for ALL active full-time staff for year ${closingYear}? This cannot be undone.`)) return
    setBulkResetting(true); setBulkResult('')
    const annualDays = parseInt(bulkAnnual) || 14
    const medicalDays = parseInt(bulkMedical) || 14
    const hospDays = parseInt(bulkHosp) || 60
    const maxCarryFwd = parseInt(maxCarryForward) || 0
    const { data: staff } = await supabase.from('users')
      .select('id, leave_entitlement_days, leave_carry_forward_days')
      .in('role', ['trainer', 'staff', 'manager']).eq('employment_type', 'full_time')
      .is('date_of_departure', null).eq('is_archived', false)
    const { data: approvedLeave } = await supabase.from('leave_applications')
      .select('user_id, start_date, end_date').eq('status', 'approved').eq('leave_type', 'annual')
      .gte('start_date', `${closingYear}-01-01`).lte('start_date', `${closingYear}-12-31`)
    const daysTakenMap: Record<string, number> = {}
    for (const leave of approvedLeave || []) {
      const days = Math.round((new Date(leave.end_date).getTime() - new Date(leave.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1
      daysTakenMap[leave.user_id] = (daysTakenMap[leave.user_id] || 0) + days
    }
    let count = 0
    for (const s of staff || []) {
      const total = (s.leave_entitlement_days || 0) + (s.leave_carry_forward_days || 0)
      const carryFwd = Math.min(Math.max(0, total - (daysTakenMap[s.id] || 0)), maxCarryFwd)
      await supabase.from('users').update({
        leave_entitlement_days: annualDays, leave_carry_forward_days: carryFwd,
        medical_leave_entitlement_days: medicalDays, hospitalisation_leave_entitlement_days: hospDays,
      }).eq('id', s.id)
      count++
    }
    const newResetYear = new Date().getFullYear()
    await supabase.from('app_settings').update({ leave_reset_year: newResetYear }).eq('id', 'global')
    setResetAlreadyRun(true); setLeaveResetYear(newResetYear)
    logActivity('update', 'Leave Management', `Year-end leave reset for ${closingYear} — ${count} staff updated`)
    setBulkResult(`Reset complete for ${closingYear} — ${count} staff updated`)
    setBulkResetting(false)
  }

  const handleAcknowledgeWithdrawal = async (app: any) => {
    // Balance was already restored when staff submitted the withdrawal request
    // (status changed from approved → withdrawal_requested, removed from taken calc)
    // Just mark as withdrawn and acknowledge
    await supabase.from('leave_applications').update({
      status: 'withdrawn',
      withdrawal_acknowledged_at: new Date().toISOString(),
      withdrawal_acknowledged_by: user!.id,
    }).eq('id', app.id)
    logActivity('confirm', 'Leave Management', `Acknowledged leave withdrawal for ${app.user?.full_name}`)
    showMsg('Withdrawal acknowledged')
    await load()
  }

  const isJanuary = new Date().getMonth() === 0

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Leave Management</h1>
        <p className="text-sm text-gray-500">
          {user?.role === 'manager' && 'Approving leave for full-time trainers and operations staff at your gym'}
          {user?.role === 'business_ops' && 'Approving leave for gym managers'}
          {user?.role === 'admin' && 'Approving leave for Business Operations staff'}
        </p>
      </div>

      <StatusBanner success={success} />

      {/* View tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        <button onClick={() => setTab('pending')}
          className={cn('flex-1 py-2 text-sm font-medium rounded-lg transition-colors relative',
            tab === 'pending' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
          Pending
          {applications.filter(a => a.status === 'pending' || a.status === 'withdrawal_requested').length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 text-white text-xs rounded-full flex items-center justify-center">
              {applications.filter(a => a.status === 'pending' || a.status === 'withdrawal_requested').length}
            </span>
          )}
        </button>
        <button onClick={() => setTab('calendar')}
          className={cn('flex-1 py-2 text-sm font-medium rounded-lg transition-colors',
            tab === 'calendar' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
          Calendar
        </button>
        <button onClick={() => setTab('history')}
          className={cn('flex-1 py-2 text-sm font-medium rounded-lg transition-colors',
            tab === 'history' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
          History
        </button>
      </div>

      {/* Calendar tab — 7-day rolling leave view */}
      {tab === 'calendar' && (() => {
        const LEAVE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
          annual: { bg: '#E6F1FB', text: '#0C447C', label: 'Annual' },
          medical: { bg: '#EAF3DE', text: '#27500A', label: 'Medical' },
          hospitalisation: { bg: '#FAEEDA', text: '#633806', label: 'Hospitalisation' },
          other: { bg: '#F1EFE8', text: '#444441', label: 'Other' },
        }
        const today = new Date(); today.setHours(0,0,0,0)
        const days = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(today); d.setDate(d.getDate() + calendarOffset + i); return d
        })
        const startStr = days[0].toISOString().split('T')[0]
        const endStr = days[6].toISOString().split('T')[0]

        return (
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900 text-sm">Leave Calendar</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => setCalendarOffset(o => o - 7)}
                  className="text-xs text-gray-500 px-2 py-1 rounded border border-gray-200">← Prev</button>
                <button onClick={() => setCalendarOffset(0)}
                  className="text-xs text-red-600 px-2 py-1 rounded border border-red-200">Today</button>
                <button onClick={() => setCalendarOffset(o => o + 7)}
                  className="text-xs text-gray-500 px-2 py-1 rounded border border-gray-200">Next →</button>
              </div>
            </div>
            {/* Legend */}
            <div className="flex gap-3 px-4 py-2 border-b border-gray-100 bg-gray-50 flex-wrap">
              {Object.entries(LEAVE_COLORS).map(([k, v]) => (
                <span key={k} className="flex items-center gap-1.5 text-xs" style={{ color: v.text }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: v.bg, border: `0.5px solid ${v.text}33`, display: 'inline-block' }} />
                  {v.label}
                </span>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <thead>
                  <tr style={{ background: 'var(--color-background-secondary)', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
                    <th style={{ width: 100, textAlign: 'left', padding: '6px 8px', fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 500, borderRight: '0.5px solid var(--color-border-tertiary)' }}>Staff</th>
                    {days.map(d => {
                      const isToday = d.toDateString() === new Date().toDateString()
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6
                      return (
                        <th key={d.toISOString()} style={{ padding: '6px 4px', textAlign: 'center', fontSize: 11, fontWeight: 500, color: isToday ? '#E24B4A' : isWeekend ? '#E24B4A' : 'var(--color-text-secondary)', background: isToday ? '#E24B4A' : 'transparent', borderRight: '0.5px solid var(--color-border-tertiary)' }}>
                          <span style={{ color: isToday ? 'white' : undefined }}>
                            {d.toLocaleDateString('en-SG', { weekday: 'short' })}<br />
                            {d.toLocaleDateString('en-SG', { day: '2-digit', month: 'short' })}
                          </span>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {staffBalances.map(s => {
                    // Get approved leave for this staff in the 7-day window
                    const staffLeave = applications.filter(a =>
                      a.user_id === s.id && a.status === 'approved' &&
                      a.start_date <= endStr && a.end_date >= startStr
                    )
                    return (
                      <tr key={s.id} style={{ borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
                        <td style={{ padding: '6px 8px', fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)', borderRight: '0.5px solid var(--color-border-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {s.full_name.split(' ')[0]}
                        </td>
                        {days.map(d => {
                          const dStr = d.toISOString().split('T')[0]
                          const isWeekend = d.getDay() === 0 || d.getDay() === 6
                          const onLeave = staffLeave.find(a => a.start_date <= dStr && a.end_date >= dStr)
                          const col = onLeave ? LEAVE_COLORS[onLeave.leave_type] || LEAVE_COLORS.other : null
                          return (
                            <td key={dStr} style={{ padding: '4px', borderRight: '0.5px solid var(--color-border-tertiary)', background: isWeekend ? 'var(--color-background-secondary)' : 'transparent', textAlign: 'center', minHeight: 40, verticalAlign: 'middle' }}>
                              {col && (
                                <div style={{ background: col.bg, color: col.text, fontSize: 10, fontWeight: 500, padding: '2px 4px', borderRadius: 3 }}>
                                  {onLeave.is_half_day ? '½' : col.label}
                                </div>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {/* Conflict warning */}
            {(() => {
              const conflicts: string[] = []
              days.forEach(d => {
                const dStr = d.toISOString().split('T')[0]
                if (d.getDay() === 0 || d.getDay() === 6) return
                const onLeave = staffBalances.filter(s =>
                  applications.some(a => a.user_id === s.id && a.status === 'approved' && a.start_date <= dStr && a.end_date >= dStr)
                )
                if (onLeave.length >= 2) conflicts.push(`${d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}: ${onLeave.map(s => s.full_name.split(' ')[0]).join(', ')} on leave`)
              })
              return conflicts.length > 0 ? (
                <div style={{ padding: '8px 12px', background: '#FAEEDA', borderTop: '0.5px solid #FAC775' }}>
                  {conflicts.map((c, i) => <p key={i} style={{ fontSize: 11, color: '#633806' }}>⚠ {c}</p>)}
                </div>
              ) : null
            })()}
          </div>
        )
      })()}

      {/* History tab */}
      {tab === 'history' && (() => {
        const history = applications.filter(a => a.status !== 'pending')
        return (
          <div className="card">
            <div className="p-4 border-b border-gray-100"><h2 className="font-semibold text-gray-900 text-sm">Leave History</h2></div>
            {history.length === 0 ? <p className="p-6 text-sm text-gray-400 text-center">No historical records</p> : (
              <div className="divide-y divide-gray-100">
                {history.map(a => (
                  <div key={a.id} className="p-3 flex items-start gap-3">
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0', a.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>{a.status}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{a.user?.full_name}</p>
                      <p className="text-xs text-gray-500">{a.leave_type} · {formatDate(a.start_date)} — {formatDate(a.end_date)} · {a.days_applied} days</p>
                      {a.rejection_reason && <p className="text-xs text-red-500 mt-0.5">Reason: {a.rejection_reason}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })()}

      {/* Pending tab — existing content */}
      {tab === 'pending' && <>

      {/* Context banner */}
      <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <p>
          {user?.role === 'manager' && 'You are reviewing leave from full-time trainers and operations staff at your gym. Approved leave will be deducted from their annual entitlement.'}
          {user?.role === 'business_ops' && 'Showing leave escalated after 48 hours without manager action — and managers\' own leave applications.'}
          {user?.role === 'admin' && 'You are reviewing leave from Business Operations staff. Their leave escalates to you for approval.'}
        </p>
      </div>

      {/* Leave balances */}
      <div className="card">
        <div className="p-4 border-b border-gray-100"><h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2"><Users className="w-4 h-4 text-red-600" /> Staff Leave Balances ({new Date().getFullYear()})</h2></div>
        {staffBalances.length === 0 ? <p className="p-4 text-sm text-gray-400 text-center">No staff found</p> : (
          <div className="divide-y divide-gray-100">
            {staffBalances.map(s => (
              <div key={s.id} className="flex items-center gap-3 p-3">
                <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-red-700 font-semibold text-xs">{s.full_name.charAt(0)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{s.full_name}</p>
                  <p className="text-xs text-gray-400">{getRoleLabel(s.role)}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={cn('text-sm font-bold', s.balance < 0 ? 'text-red-700' : s.balance < 3 ? 'text-red-600' : 'text-gray-900')}>
                    {s.balance < 0 ? `${s.balance} days (over-taken)` : `${s.balance} days left`}
                  </p>
                  <p className="text-xs text-gray-400">
                    {s.taken} taken / {s.leave_entitlement_days != null ? s.leave_entitlement_days : '0 (not set)'} entitled
                  </p>
                  {s.pending > 0 && <p className="text-xs text-amber-500">{s.pending} days pending</p>}
                  {s.leave_entitlement_days == null && (
                    <p className="text-xs text-red-600 font-medium">Entitlement not set — contact Business Ops</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Applications */}
      <div className="flex gap-1">
        {['pending', 'approved', 'rejected', 'all'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors',
              filter === f ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
            {f}
          </button>
        ))}
      </div>

      {applications.length === 0 ? (
        <div className="card p-8 text-center"><Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" /><p className="text-gray-500 text-sm">No {filter === 'all' ? '' : filter} leave applications</p></div>
      ) : (
        <div className="space-y-2">
          {applications.map(app => (
            <div key={app.id} className="card p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900 text-sm">{app.user?.full_name}</p>
                    <span className={app.status === 'withdrawal_requested'
                      ? 'text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700'
                      : statusBadge(app.status)}>
                      {app.status === 'withdrawal_requested' ? 'withdrawal requested' : app.status}
                    </span>
                    <span className="text-xs text-gray-500">{LEAVE_TYPES[app.leave_type] || app.leave_type}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {formatDate(app.start_date)} — {formatDate(app.end_date)} · <strong>{app.days_applied} day{app.days_applied !== 1 ? 's' : ''}</strong>
                  </p>
                  {app.reason && <p className="text-xs text-gray-400 mt-0.5">Reason: {app.reason}</p>}
                  {app.rejection_reason && <p className="text-xs text-red-500 mt-0.5">Rejected: {app.rejection_reason}</p>}
                  {app.withdrawal_reason && <p className="text-xs text-blue-600 mt-0.5">Withdrawal reason: {app.withdrawal_reason}</p>}
                  {app.status === 'withdrawal_requested' && <p className="text-xs text-green-600 mt-0.5">✓ {app.days_applied} days restored to staff balance</p>}
                </div>
                {app.status === 'pending' && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => handleApprove(app.id)} className="btn-primary text-xs py-1.5 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Approve</button>
                    <button onClick={() => setRejectId(app.id)} className="btn-danger text-xs py-1.5 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> Reject</button>
                  </div>
                )}
                {app.status === 'withdrawal_requested' && (
                  <button onClick={() => handleAcknowledgeWithdrawal(app)}
                    className="btn-secondary text-xs py-1.5 flex items-center gap-1 flex-shrink-0">
                    <CheckCircle className="w-3.5 h-3.5" /> Acknowledge
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      </> }

      {/* Reject modal — outside tab blocks so it persists regardless of active tab */}
      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4">
            <h3 className="font-bold text-gray-900">Reject Leave Application</h3>
            <p className="text-sm text-gray-500">Please provide a reason — this will be shown to the staff member.</p>
            <div>
              <label className="label">Reason *</label>
              <textarea className="input min-h-[80px]" placeholder="e.g. Insufficient leave balance, critical staffing period..."
                value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <button onClick={handleReject} disabled={!rejectReason.trim()} className="btn-danger flex-1">Confirm Rejection</button>
              <button onClick={() => { setRejectId(null); setRejectReason('') }} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Year-End Leave Reset — biz-ops only */}
      {user?.role === 'business_ops' && (
        <div className="card p-4 space-y-4">
          <h2 className="font-semibold text-gray-900 text-sm">
            Year-End Leave Reset
            {!isJanuary && <span className="ml-2 text-xs font-normal text-gray-400">(Available in January only)</span>}
            {resetAlreadyRun && <span className="ml-2 text-xs font-normal text-green-600">✓ Completed for {leaveResetYear}</span>}
          </h2>
          <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-xs text-amber-700 space-y-1">
            <p className="font-medium">What this does:</p>
            <p>1. Sets the new annual entitlement for ALL active full-time staff</p>
            <p>2. Calculates carry-forward from unused leave in {new Date().getFullYear() - 1} (capped at {maxCarryForward} days max)</p>
            <p>3. Resets medical and hospitalisation to default entitlements</p>
            <p className="text-amber-600 font-medium mt-1">⚠ This action cannot be undone. Run in January only.</p>
          </div>

          {/* Pending leave blocking warning */}
          {pendingBlockingStaff.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
              <p className="text-sm font-medium text-red-700">⚠ Cannot run reset — {pendingBlockingStaff.length} staff have pending leave from {new Date().getFullYear() - 1} that must be resolved first:</p>
              <ul className="text-xs text-red-600 space-y-1">
                {pendingBlockingStaff.map((l: any) => (
                  <li key={l.id}>• {(l.user as any)?.full_name} — {l.start_date} to {l.end_date}</li>
                ))}
              </ul>
              <button onClick={() => setPendingBlockingStaff([])} className="text-xs text-red-600 underline">Dismiss</button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">New Annual Entitlement (days)</label>
              <input className="input" type="number" min="0" step="1" value={bulkAnnual} onChange={e => setBulkAnnual(e.target.value)} placeholder="14" disabled={!isJanuary || resetAlreadyRun} /></div>
            <div><label className="label">New Medical Entitlement (days)</label>
              <input className="input" type="number" min="0" step="1" value={bulkMedical} onChange={e => setBulkMedical(e.target.value)} placeholder="14" disabled={!isJanuary || resetAlreadyRun} /></div>
            <div><label className="label">New Hospitalisation (days)</label>
              <input className="input" type="number" min="0" step="1" value={bulkHosp} onChange={e => setBulkHosp(e.target.value)} placeholder="60" disabled={!isJanuary || resetAlreadyRun} /></div>
          </div>
          {bulkResult && <p className="text-sm text-green-700 font-medium">✓ {bulkResult}</p>}
          <button
            onClick={handleBulkReset}
            disabled={bulkResetting || !isJanuary || resetAlreadyRun}
            title={!isJanuary ? 'Available from 1 January' : resetAlreadyRun ? `Reset already run for ${leaveResetYear}` : ''}
            className="btn-primary flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed bg-amber-600 hover:bg-amber-700">
            <Save className="w-4 h-4" />
            {bulkResetting ? 'Resetting...' : resetAlreadyRun ? `Reset done for ${leaveResetYear}` : !isJanuary ? 'Available from 1 January' : 'Run Year-End Reset'}
          </button>
        </div>
      )}
    </div>
  )
}
