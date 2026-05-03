'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { formatDate } from '@/lib/utils'
import { Calendar, Plus, CheckCircle, Clock, XCircle, X, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const LEAVE_TYPES = [
  { value: 'annual', label: 'Annual Leave' },
  { value: 'medical', label: 'Medical Leave' },
  { value: 'hospitalisation', label: 'Hospitalisation Leave' },
  { value: 'other', label: 'Other' },
]

export default function MyLeavePage() {
  const [user, setUser] = useState<any>(null)
  const [applications, setApplications] = useState<any[]>([])
  const [takenDays, setTakenDays] = useState(0)
  const [pendingDays, setPendingDays] = useState(0)
  const [holidays, setHolidays] = useState<string[]>([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState({
    leave_type: 'annual', start_date: '', end_date: '', reason: '',
  })
  const router = useRouter()
  const supabase = createClient()

  const showMsg = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000) }

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return
    const { data: u } = await supabase.from('users').select('*').eq('id', authUser.id).single()
    // Part-timers are not eligible for leave — redirect to dashboard
    if (!u || u.employment_type === 'part_time') { router.replace('/dashboard'); return }
    setUser(u)

    const { data: apps } = await supabase.from('leave_applications')
      .select('*').eq('user_id', authUser.id)
      .order('created_at', { ascending: false })
    setApplications(apps || [])

    const currentYear = new Date().getFullYear()
    const taken = apps?.filter(a => a.status === 'approved' && new Date(a.start_date).getFullYear() === currentYear)
      .reduce((s: number, a: any) => s + a.days_applied, 0) || 0
    setTakenDays(taken)
    const pending = apps?.filter(a => a.status === 'pending' && new Date(a.start_date).getFullYear() === currentYear)
      .reduce((s: number, a: any) => s + a.days_applied, 0) || 0
    setPendingDays(pending)

    // Load public holidays for leave day calculation
    const { data: ph } = await supabase.from('public_holidays')
      .select('holiday_date').in('year', [currentYear, currentYear + 1])
    setHolidays(ph?.map((h: any) => h.holiday_date) || [])
  }

  const calcDays = (start: string, end: string) => {
    if (!start || !end) return 0
    const s = new Date(start), e = new Date(end)
    if (e < s) return 0
    // Count weekdays excluding public holidays
    let days = 0
    const cur = new Date(s)
    while (cur <= e) {
      const day = cur.getDay()
      const dateStr = cur.toISOString().split('T')[0]
      if (day !== 0 && day !== 6 && !holidays.includes(dateStr)) days++
      cur.setDate(cur.getDate() + 1)
    }
    return days
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('')
    const { data: { user: authUser } } = await supabase.auth.getUser()
    const days = calcDays(form.start_date, form.end_date)
    if (days === 0) { setError('Invalid date range'); setSaving(false); return }
    if (user?.leave_entitlement_days == null) {
      setError('Your leave entitlement has not been configured. Please contact Business Operations before applying for leave.')
      setSaving(false); return
    }
    const entitlementDays = user.leave_entitlement_days
    const availableBalance = Math.max(0, entitlementDays - takenDays - pendingDays)
    if (availableBalance === 0) { setError('No leave balance remaining. Contact Business Operations if you believe this is incorrect.'); setSaving(false); return }
    if (days > availableBalance) { setError(`Insufficient leave balance. You have ${availableBalance} day${availableBalance !== 1 ? 's' : ''} available${pendingDays > 0 ? ` (${pendingDays} day${pendingDays !== 1 ? 's' : ''} pending approval)` : ''}.`); setSaving(false); return }

    // Check for overlapping pending or approved leave
    const { data: existing } = await supabase.from('leave_applications')
      .select('id, start_date, end_date, status, leave_type')
      .eq('user_id', authUser!.id)
      .in('status', ['pending', 'approved'])
      .lte('start_date', form.end_date)
      .gte('end_date', form.start_date)
    if (existing && existing.length > 0) {
      const clash = existing[0]
      setError(`Overlapping leave application exists (${LEAVE_TYPES.find(t => t.value === clash.leave_type)?.label || clash.leave_type}, ${formatDate(clash.start_date)} — ${formatDate(clash.end_date)}, ${clash.status}). Please withdraw or wait for a decision on that application first.`)
      setSaving(false); return
    }

    const { error: err } = await supabase.from('leave_applications').insert({
      user_id: authUser!.id, leave_type: form.leave_type,
      start_date: form.start_date, end_date: form.end_date,
      days_applied: days, reason: form.reason || null, status: 'pending',
    })
    if (err) { setError(err.message); setSaving(false); return }

    await load(); setShowForm(false); setForm({ leave_type: 'annual', start_date: '', end_date: '', reason: '' })
    setSaving(false); showMsg('Leave application submitted')
  }

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this leave application?')) return
    await supabase.from('leave_applications').delete().eq('id', id).eq('status', 'pending')
    await load(); showMsg('Application withdrawn')
  }

  // If entitlement not set, treat as 0 to force escalation — do not use fallback 14
  const entitlementNotSet = user != null && user.leave_entitlement_days == null
  const entitlement = user?.leave_entitlement_days ?? 0
  const balance = entitlementNotSet ? 0 : Math.max(0, entitlement - takenDays)
  const available = entitlementNotSet ? 0 : Math.max(0, entitlement - takenDays - pendingDays)
  const days = calcDays(form.start_date, form.end_date)

  const recentDecisions = applications.filter(a => {
    if (a.status === 'pending') return false
    const decided = a.approved_at || a.rejected_at
    if (!decided) return false
    return (Date.now() - new Date(decided).getTime()) < 7 * 24 * 60 * 60 * 1000
  })

  const statusIcon = (s: string) => s === 'approved' ? <CheckCircle className="w-4 h-4 text-green-600" /> : s === 'pending' ? <Clock className="w-4 h-4 text-amber-500" /> : <XCircle className="w-4 h-4 text-red-500" />

  return (
    <div className="space-y-5 max-w-lg mx-auto">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900">My Leave</h1><p className="text-sm text-gray-500">{new Date().getFullYear()} leave summary</p></div>
        <button onClick={() => setShowForm(!showForm)} disabled={entitlementNotSet}
          className="btn-primary flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          title={entitlementNotSet ? 'Leave entitlement not set — contact Business Ops' : undefined}>
          <Plus className="w-4 h-4" /> Apply
        </button>
      </div>

      {success && <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700"><CheckCircle className="w-4 h-4 flex-shrink-0" />{success}</div>}

      {/* In-app indicator for recent decisions */}
      {recentDecisions.filter(a => a.status === 'approved').length > 0 && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3">
          <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
          <p className="text-sm text-green-700 font-medium">
            {recentDecisions.filter(a => a.status === 'approved').length} leave application{recentDecisions.filter(a => a.status === 'approved').length > 1 ? 's' : ''} approved recently
          </p>
        </div>
      )}
      {recentDecisions.filter(a => a.status === 'rejected').length > 0 && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
          <XCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-700 font-medium">
            {recentDecisions.filter(a => a.status === 'rejected').length} leave application{recentDecisions.filter(a => a.status === 'rejected').length > 1 ? 's' : ''} rejected — see below for reason
          </p>
        </div>
      )}

      {/* Balance card */}
      <div className="card p-4">
        <div className="grid grid-cols-2 gap-3 text-center" style={{gridTemplateColumns: "1fr 1fr"}}>
          <div className="bg-red-50 rounded-xl p-3">
            <p className="text-2xl font-bold text-red-700">{entitlementNotSet ? '—' : entitlement}</p>
            <p className="text-xs text-red-600 mt-1">Entitled</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-2xl font-bold text-gray-700">{takenDays}</p>
            <p className="text-xs text-gray-500 mt-1">Approved & Taken</p>
          </div>
          {pendingDays > 0 && (
            <div className="bg-amber-50 rounded-xl p-3 col-span-2">
              <p className="text-2xl font-bold text-amber-700">{pendingDays}</p>
              <p className="text-xs text-amber-600 mt-1">Pending Approval</p>
            </div>
          )}
          <div className={cn('rounded-xl p-3 col-span-2', balance < 3 ? 'bg-amber-50' : 'bg-green-50')}>
            <p className={cn('text-2xl font-bold', balance < 3 ? 'text-amber-700' : 'text-green-700')}>{balance}</p>
            <p className={cn('text-xs mt-1', balance < 3 ? 'text-amber-600' : 'text-green-600')}>Current Balance (approved only)</p>
          </div>
        </div>
        {pendingDays > 0 && (
          <p className="text-xs text-amber-600 text-center">Available after pending approved: <strong>{Math.max(0, entitlement - takenDays - pendingDays)}</strong> days</p>
        )}
        {entitlementNotSet && (
          <p className="text-xs text-red-600 text-center mt-2 font-medium">
            Your leave entitlement has not been set. Please contact Business Operations to rectify this before applying for leave.
          </p>
        )}
        <p className="text-xs text-gray-400 text-center mt-1">Excludes weekends & public holidays. Resets on 1 Jan — unused leave does not carry forward.</p>
      </div>

      {/* Apply form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="card p-4 space-y-4 border-red-200">
          <div className="flex items-center justify-between"><h2 className="font-semibold text-gray-900 text-sm">Apply for Leave</h2><button type="button" onClick={() => setShowForm(false)}><X className="w-4 h-4 text-gray-400" /></button></div>

          <div>
            <label className="label">Leave Type *</label>
            <select className="input" value={form.leave_type} onChange={e => setForm(f => ({ ...f, leave_type: e.target.value }))}>
              {LEAVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">From *</label><input className="input" type="date" required value={form.start_date} min={new Date().toISOString().split('T')[0]} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} /></div>
            <div><label className="label">To *</label><input className="input" type="date" required value={form.end_date} min={form.start_date || new Date().toISOString().split('T')[0]} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} /></div>
          </div>

          {days > 0 && (
            <div className={cn('rounded-lg p-3 text-sm font-medium text-center', days > available ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700')}>
              {days} working day{days !== 1 ? 's' : ''} (excl. weekends & public holidays)
              {days > available && ` — exceeds your available balance of ${available} days`}
            </div>
          )}

          <div><label className="label">Reason</label><textarea className="input min-h-[70px] resize-none" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="Optional reason or notes" /></div>

          {error && <div className="flex items-center gap-2 text-xs text-red-600"><AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{error}</div>}

          <div className="flex gap-2">
            <button type="submit" disabled={saving || days > available} className="btn-primary flex-1 disabled:opacity-50">{saving ? 'Submitting...' : 'Submit Application'}</button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      {/* Applications list */}
      {applications.length === 0 ? (
        <div className="card p-8 text-center"><Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" /><p className="text-gray-500 text-sm">No leave applications yet</p></div>
      ) : (
        <div className="space-y-2">
          {applications.map(app => (
            <div key={app.id} className="card p-4 flex items-start gap-3">
              <div className="mt-0.5 flex-shrink-0">{statusIcon(app.status)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900">{LEAVE_TYPES.find(t => t.value === app.leave_type)?.label}</p>
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', app.status === 'approved' ? 'bg-green-100 text-green-700' : app.status === 'pending' ? 'badge-pending' : 'badge-danger')}>{app.status}</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{formatDate(app.start_date)} — {formatDate(app.end_date)} · {app.days_applied} day{app.days_applied !== 1 ? 's' : ''}</p>
                {app.reason && <p className="text-xs text-gray-400">{app.reason}</p>}
                {app.rejection_reason && <p className="text-xs text-red-500">Rejected: {app.rejection_reason}</p>}
              </div>
              {app.status === 'pending' && (
                <button onClick={() => handleCancel(app.id)} className="text-xs text-gray-400 hover:text-red-500 flex-shrink-0">Withdraw</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
