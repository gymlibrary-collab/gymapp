'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { formatDate } from '@/lib/utils'
import { Calendar, Plus, CheckCircle, Clock, XCircle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { StatusBanner } from '@/components/StatusBanner'
import { useCurrentUser } from '@/hooks/useCurrentUser'

const LEAVE_TYPES = [
  { value: 'annual', label: 'Annual Leave', entitlementKey: 'leave_entitlement_days' },
  // Medical and Hospitalisation leave types disabled — not yet implemented
  // { value: 'medical', label: 'Medical Leave', entitlementKey: 'medical_leave_entitlement_days' },
  // { value: 'hospitalisation', label: 'Hospitalisation Leave', entitlementKey: 'hospitalisation_leave_entitlement_days' },
  { value: 'other', label: 'Other', entitlementKey: 'leave_entitlement_days' },
]

export default function MyLeavePage() {
  const { user, loading } = useCurrentUser({ allowedRoles: ['trainer', 'staff', 'manager', 'business_ops'] })


  const { logActivity } = useActivityLog()
  const [applications, setApplications] = useState<any[]>([])
  const [takenByType, setTakenByType] = useState<Record<string, number>>({})
  const [pendingByType, setPendingByType] = useState<Record<string, number>>({})
  const [holidays, setHolidays] = useState<string[]>([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [withdrawId, setWithdrawId] = useState<string | null>(null)
  const [withdrawReason, setWithdrawReason] = useState('')
  const [withdrawSaving, setWithdrawSaving] = useState(false)
  const [leaveResetYear, setLeaveResetYear] = useState<number>(2026)
  const [dataLoading, setDataLoading] = useState(true)
  const [form, setForm] = useState({
    leave_type: 'annual', start_date: '', end_date: '', reason: '',
    is_half_day: false, half_day_period: 'morning' as 'morning' | 'afternoon',
  })

  const router = useRouter()
  const supabase = createClient()
  const { success, error, showMsg, showError, setError } = useToast()


  const load = async () => {
    logActivity('page_view', 'My Leave', 'Viewed own leave')

    const { data: apps } = await supabase.from('leave_applications')
      .select('*').eq('user_id', user!.id)
      .order('created_at', { ascending: false })
    setApplications(apps || [])

    const { data: appSettings } = await supabase
      .from('app_settings').select('leave_reset_year').eq('id', 'global').maybeSingle()
    if (appSettings?.leave_reset_year) setLeaveResetYear(appSettings.leave_reset_year)

    const currentYear = new Date().getFullYear()
    const countDaysInYear = (app: any, year: number) => {
      const yearEnd = `${year}-12-31`
      const yearStart = `${year}-01-01`
      const start = app.start_date > yearStart ? app.start_date : yearStart
      const end = app.end_date < yearEnd ? app.end_date : yearEnd
      if (end < start) return 0
      const appDays = (new Date(app.end_date).getTime() - new Date(app.start_date).getTime()) / 86400000 + 1
      const inYearDays = (new Date(end).getTime() - new Date(start).getTime()) / 86400000 + 1
      return appDays > 0 ? Number((app.days_applied * inYearDays / appDays).toFixed(1)) : 0
    }

    const taken: Record<string, number> = {}
    const pending: Record<string, number> = {}
    apps?.filter(a => a.start_date <= `${currentYear}-12-31` && a.end_date >= `${currentYear}-01-01`)
      .forEach((a: any) => {
        const days = countDaysInYear(a, currentYear)
        if (a.status === 'approved') taken[a.leave_type] = (taken[a.leave_type] || 0) + days
        if (a.status === 'pending') pending[a.leave_type] = (pending[a.leave_type] || 0) + days
      })
    setTakenByType(taken)
    setPendingByType(pending)

    const { data: ph } = await supabase.from('public_holidays')
      .select('holiday_date').in('year', [currentYear, currentYear + 1])
    setHolidays(ph?.map((h: any) => h.holiday_date) || [])
  }

  useEffect(() => {
    if (!user) return
    load().finally(() => setDataLoading(false))
  }, [user])

  const handleWithdraw = async () => {
    if (!withdrawId || !withdrawReason.trim()) return
    setWithdrawSaving(true)
    const app = applications.find((a: any) => a.id === withdrawId)
    if (!app) { setWithdrawSaving(false); return }
    // Changing status from 'approved' to 'withdrawal_requested' automatically
    // restores the leave balance since balance is calculated dynamically
    // from approved applications only.
    const { error } = await supabase.from('leave_applications').update({
      status: 'withdrawal_requested',
      withdrawal_reason: withdrawReason.trim(),
      withdrawal_requested_at: new Date().toISOString(),
    }).eq('id', withdrawId)
    if (error) { setWithdrawSaving(false); return }
    logActivity('update', 'My Leave', `Requested withdrawal of approved leave — ${app.days_applied} days`)
    setWithdrawId(null); setWithdrawReason(''); setWithdrawSaving(false)
    load().finally(() => setDataLoading(false))
  }

  if (loading || dataLoading) return <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600" /></div>
  if (!user) return null

  const calcDays = (start: string, end: string, isHalfDay: boolean) => {
    if (!start || !end) return 0
    if (isHalfDay) return 0.5
    const [sy, sm, sd] = start.split('-').map(Number)
    const [ey, em, ed] = end.split('-').map(Number)
    const s = new Date(sy, sm - 1, sd)
    const e = new Date(ey, em - 1, ed)
    if (e < s) return 0
    let days = 0
    const cur = new Date(s)
    while (cur <= e) {
      const day = cur.getDay()
      const dateStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
      if (day !== 0 && day !== 6 && !holidays.includes(dateStr)) days++
      cur.setDate(cur.getDate() + 1)
    }
    return days
  }

  // Get entitlement for a given leave type
  const getEntitlement = (leaveType: string) => {
    const lt = LEAVE_TYPES.find(t => t.value === leaveType)
    if (!lt || !user) return { entitlement: 0, carryForward: 0, total: 0, taken: 0, pending: 0, available: 0, notSet: true }
    const entitlement = user[lt.entitlementKey] ?? 0
    const carryForward = leaveType === 'annual' ? ((user as any).leave_carry_forward_days ?? 0) : 0
    const total = entitlement + carryForward
    const taken = takenByType[leaveType] || 0
    const pending = pendingByType[leaveType] || 0
    const available = Math.max(0, total - taken - pending)
    const notSet = user[lt.entitlementKey] == null
    return { entitlement, carryForward, total, taken, pending, available, notSet }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('')
    const { data: { user: authUser } } = await supabase.auth.getUser()
    const days = calcDays(form.start_date, form.end_date, form.is_half_day)
    if (days === 0) { setError('Invalid date range'); setSaving(false); return }

    const startYear = new Date(form.start_date).getFullYear()
    const endYear = new Date(form.end_date).getFullYear()
    if (endYear > startYear) {
      setError('Leave applications cannot cross into the new year. Please apply up to 31 Dec only. If you intend to continue leave in the new year, note your intended return date in the Reason field and submit a separate application after the year-end reset.')
      setSaving(false); return
    }
    if (startYear > leaveResetYear) {
      setError('New year leave applications are not available yet. Please wait for Business Operations to run the year-end leave reset.')
      setSaving(false); return
    }

    const lt = getEntitlement(form.leave_type)
    // Note: if leave_entitlement_days is null, treat as 0 — balance check below handles it
    // Biz Ops accounts may not have entitlement configured — they should still see the form
    if (days > lt.available) {
      setError(`Insufficient ${LEAVE_TYPES.find(t => t.value === form.leave_type)?.label} balance. You have ${lt.available} day${lt.available !== 1 ? 's' : ''} available.`)
      setSaving(false); return
    }

    const { data: existing } = await supabase.from('leave_applications')
      .select('id, start_date, end_date, status, leave_type')
      .eq('user_id', user!.id).in('status', ['pending', 'approved', 'withdrawal_requested'])
      .lte('start_date', form.end_date).gte('end_date', form.start_date)
    if (existing && existing.length > 0) {
      const clash = existing[0]
      setError(`Overlapping leave exists (${LEAVE_TYPES.find(t => t.value === clash.leave_type)?.label}, ${formatDate(clash.start_date)} — ${formatDate(clash.end_date)}, ${clash.status}).`)
      setSaving(false); return
    }

    const { error: err } = await supabase.from('leave_applications').insert({
      user_id: authUser!.id, leave_type: form.leave_type,
      start_date: form.start_date, end_date: form.end_date,
      days_applied: days, reason: form.reason || null, status: 'pending',
      is_half_day: form.is_half_day,
      half_day_period: form.is_half_day ? form.half_day_period : null,
    })
    if (err) { setError(err.message); setSaving(false); return }

    setShowForm(false)
    setForm({ leave_type: 'annual', start_date: '', end_date: '', reason: '', is_half_day: false, half_day_period: 'morning' })
    setSaving(false); showMsg('Leave application submitted')
    logActivity('create', 'My Leave', 'Submitted leave application')

    // Reload
    const { data: apps } = await supabase.from('leave_applications')
      .select('*').eq('user_id', user!.id).order('created_at', { ascending: false })
    setApplications(apps || [])
  }

  const handleCancel = async (id: string) => {
    if (!confirm('Withdraw this leave application?')) return
    await supabase.from('leave_applications').delete().eq('id', id).eq('status', 'pending')
    const { data: { user: authUser } } = await supabase.auth.getUser()
    const { data: apps } = await supabase.from('leave_applications')
      .select('*').eq('user_id', user!.id).order('created_at', { ascending: false })
    setApplications(apps || [])
    showMsg('Application withdrawn')
  }

  const formDays = calcDays(form.start_date, form.end_date, form.is_half_day)
  const isHalfDayEligible = form.start_date && form.end_date && form.start_date === form.end_date
  const currentLtStats = getEntitlement(form.leave_type)

  const statusIcon = (s: string) => s === 'approved'
    ? <CheckCircle className="w-4 h-4 text-green-600" />
    : s === 'pending' ? <Clock className="w-4 h-4 text-amber-500" />
    : <XCircle className="w-4 h-4 text-red-500" />

  return (
    <div className="space-y-5 max-w-lg mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">My Leave</h1>
          <p className="text-sm text-gray-500">{new Date().getFullYear()} leave summary</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="btn-primary flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Apply
        </button>
      </div>

      <StatusBanner success={success} error={error} onDismissError={() => setError('')} />

      {/* Leave balance cards — one per type */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { type: 'annual', label: 'Annual Leave' },
          // Medical and Hospitalisation balance cards disabled — not yet implemented
          // { type: 'medical', label: 'Medical' },
          // { type: 'hospitalisation', label: 'Hospitalisation' },
        ].map(({ type, label }) => {
          const lt = getEntitlement(type)
          return (
            <div key={type} className="stat-card">
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className="text-xl font-bold text-gray-900">{lt.available}</p>
              <p className="text-xs text-gray-400">of {lt.total} available</p>
              {lt.taken > 0 && <p className="text-xs text-gray-400">{lt.taken} taken</p>}
              {lt.pending > 0 && <p className="text-xs text-amber-500">{lt.pending} pending</p>}
              {type === 'annual' && lt.carryForward > 0 && (
                <p className="text-xs text-gray-400">{lt.entitlement} + {lt.carryForward} c/f</p>
              )}
            </div>
          )
        })}
      </div>

      {/* Application form */}
      {showForm && (
        <div className="card p-4 space-y-3 bg-blue-50 border border-blue-100">
          <p className="text-sm font-semibold text-gray-900">New Leave Application</p>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="label">Leave Type</label>
              <select className="input" value={form.leave_type}
                onChange={e => setForm(f => ({ ...f, leave_type: e.target.value, is_half_day: false }))}>
                {LEAVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Start Date</label>
                <input className="input" type="date" required value={form.start_date}
                  onChange={e => setForm(f => ({ ...f, start_date: e.target.value, is_half_day: false }))} />
              </div>
              <div>
                <label className="label">End Date</label>
                <input className="input" type="date" required value={form.end_date}
                  min={form.start_date}
                  max={form.start_date ? `${new Date(form.start_date).getFullYear()}-12-31` : undefined}
                  onChange={e => setForm(f => ({ ...f, end_date: e.target.value, is_half_day: false }))} />
                {form.start_date && form.end_date && new Date(form.end_date).getFullYear() > new Date(form.start_date).getFullYear() && (
                  <p className="text-xs text-amber-600 mt-1">⚠ Leave cannot cross into the new year. Apply up to 31 Dec and note your intended return date in the Reason field.</p>
                )}
              </div>
            </div>

            {/* Half-day option — only when start = end */}
            {isHalfDayEligible && (
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.is_half_day}
                    onChange={e => setForm(f => ({ ...f, is_half_day: e.target.checked }))}
                    className="rounded border-gray-300 text-red-600" />
                  <span className="text-sm text-gray-700">Half day (0.5 days)</span>
                </label>
                {form.is_half_day && (
                  <div className="flex gap-2 ml-6">
                    {(['morning', 'afternoon'] as const).map(p => (
                      <label key={p} className={cn('flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer text-sm',
                        form.half_day_period === p ? 'border-red-500 bg-white text-red-700' : 'border-gray-200 text-gray-600')}>
                        <input type="radio" name="half_day_period" value={p}
                          checked={form.half_day_period === p}
                          onChange={() => setForm(f => ({ ...f, half_day_period: p }))} />
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {formDays > 0 && (
              <div className="bg-white rounded-lg border border-blue-200 p-3 text-xs space-y-1">
                <div className="flex justify-between"><span className="text-gray-500">Days applied</span><span className="font-medium">{formDays}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Balance after</span>
                  <span className={cn('font-medium', currentLtStats.available - formDays < 0 ? 'text-red-600' : 'text-gray-900')}>
                    {(currentLtStats.available - formDays).toFixed(1)}
                  </span>
                </div>
              </div>
            )}

            {/* Public holidays note */}
            {holidays.length > 0 && form.start_date && form.end_date && (
              (() => {
                const ph = holidays.filter(h => h >= form.start_date && h <= form.end_date)
                return ph.length > 0 ? (
                  <div className="bg-blue-100 rounded-lg p-2 text-xs text-blue-700">
                    Public holidays within range (excluded from count): {ph.map(h => formatDate(h)).join(', ')}
                  </div>
                ) : null
              })()
            )}

            <div>
              <label className="label">Reason (optional)</label>
              <textarea className="input min-h-[60px]" value={form.reason}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="Optional — add context for your manager" />
            </div>

            <div className="flex gap-2">
              <button type="submit" disabled={saving || formDays === 0}
                className="btn-primary flex-1 disabled:opacity-50">
                {saving ? 'Submitting...' : 'Submit Application'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Applications list */}
      <div className="card">
        <div className="p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm">My Applications</h2>
        </div>
        {applications.length === 0 ? (
          <div className="p-8 text-center">
            <Calendar className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No leave applications yet</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {applications.map(a => (
              <div key={a.id}>
                <div className="p-4 flex items-start gap-3">
                  {statusIcon(a.status)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-gray-900">
                        {LEAVE_TYPES.find(t => t.value === a.leave_type)?.label}
                      </p>
                      <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
                        a.status === 'approved' ? 'bg-green-100 text-green-700' :
                        a.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700')}>
                        {a.status}
                      </span>
                      {a.escalated_to_biz_ops && a.status === 'pending' && (
                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Escalated to Biz Ops</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatDate(a.start_date)} — {formatDate(a.end_date)} ·
                      {a.is_half_day ? ` ${a.half_day_period} (0.5 day)` : ` ${a.days_applied} day${a.days_applied !== 1 ? 's' : ''}`}
                    </p>
                    {a.reason && <p className="text-xs text-gray-400 mt-0.5">{a.reason}</p>}
                    {a.rejection_reason && <p className="text-xs text-red-500 mt-0.5">Reason: {a.rejection_reason}</p>}
                  </div>
                  {a.status === 'pending' && (
                    <button onClick={() => handleCancel(a.id)}
                      className="btn-secondary text-xs py-1 px-2 flex-shrink-0 text-red-600 border-red-200 hover:bg-red-50">
                      Withdraw
                    </button>
                  )}
                  {a.status === 'approved' && new Date(a.start_date) >= new Date(new Date().toISOString().split('T')[0]) && (
                    <button onClick={() => { setWithdrawId(a.id); setWithdrawReason('') }}
                      className="btn-secondary text-xs py-1 px-2 flex-shrink-0 text-red-600 border-red-200 hover:bg-red-50">
                      Request Withdrawal
                    </button>
                  )}
                  {a.status === 'withdrawal_requested' && (
                    <span className="text-xs text-blue-600 font-medium flex-shrink-0">Awaiting acknowledgement</span>
                  )}
                </div>
                {withdrawId === a.id && (
                  <div className="mx-4 mb-3 p-3 bg-red-50 border border-red-100 rounded-xl space-y-3">
                    <p className="text-xs text-gray-600 font-medium">Request Leave Withdrawal</p>
                    <p className="text-xs text-gray-500">Your leave balance will be restored immediately. Your manager will be notified.</p>
                    <div>
                      <label className="label">Reason for withdrawal *</label>
                      <textarea className="input" rows={2} value={withdrawReason}
                        onChange={e => setWithdrawReason(e.target.value)}
                        placeholder="e.g. Plans changed, no longer required" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleWithdraw}
                        disabled={withdrawSaving || !withdrawReason.trim()}
                        className="btn-primary text-xs py-1.5 flex-1 disabled:opacity-40">
                        {withdrawSaving ? 'Submitting...' : 'Submit Withdrawal'}
                      </button>
                      <button onClick={() => { setWithdrawId(null); setWithdrawReason('') }}
                        className="btn-secondary text-xs py-1.5 flex-1">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
