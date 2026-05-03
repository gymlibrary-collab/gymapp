'use client'

import { useEffect, useState } from 'react'
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
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState({
    leave_type: 'annual', start_date: '', end_date: '', reason: '',
  })
  const supabase = createClient()

  const showMsg = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000) }

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return
    const { data: u } = await supabase.from('users').select('*').eq('id', authUser.id).single()
    setUser(u)

    const { data: apps } = await supabase.from('leave_applications')
      .select('*').eq('user_id', authUser.id)
      .order('created_at', { ascending: false })
    setApplications(apps || [])

    const taken = apps?.filter(a => a.status === 'approved' && new Date(a.start_date).getFullYear() === new Date().getFullYear())
      .reduce((s, a) => s + a.days_applied, 0) || 0
    setTakenDays(taken)
  }

  const calcDays = (start: string, end: string) => {
    if (!start || !end) return 0
    const s = new Date(start), e = new Date(end)
    if (e < s) return 0
    // Count weekdays only
    let days = 0
    const cur = new Date(s)
    while (cur <= e) {
      const day = cur.getDay()
      if (day !== 0 && day !== 6) days++
      cur.setDate(cur.getDate() + 1)
    }
    return days
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('')
    const { data: { user: authUser } } = await supabase.auth.getUser()
    const days = calcDays(form.start_date, form.end_date)
    if (days === 0) { setError('Invalid date range'); setSaving(false); return }
    const balance = (user?.leave_entitlement_days || 14) - takenDays
    if (days > balance) { setError(`Insufficient leave balance. You have ${balance} day${balance !== 1 ? 's' : ''} remaining.`); setSaving(false); return }

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

  const entitlement = user?.leave_entitlement_days || 14
  const balance = entitlement - takenDays
  const days = calcDays(form.start_date, form.end_date)

  const statusIcon = (s: string) => s === 'approved' ? <CheckCircle className="w-4 h-4 text-green-600" /> : s === 'pending' ? <Clock className="w-4 h-4 text-amber-500" /> : <XCircle className="w-4 h-4 text-red-500" />

  return (
    <div className="space-y-5 max-w-lg mx-auto">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900">My Leave</h1><p className="text-sm text-gray-500">{new Date().getFullYear()} leave summary</p></div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-1.5"><Plus className="w-4 h-4" /> Apply</button>
      </div>

      {success && <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700"><CheckCircle className="w-4 h-4 flex-shrink-0" />{success}</div>}

      {/* Balance card */}
      <div className="card p-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-red-50 rounded-xl p-3">
            <p className="text-2xl font-bold text-red-700">{entitlement}</p>
            <p className="text-xs text-red-600 mt-1">Entitled</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-2xl font-bold text-gray-700">{takenDays}</p>
            <p className="text-xs text-gray-500 mt-1">Taken</p>
          </div>
          <div className={cn('rounded-xl p-3', balance < 3 ? 'bg-amber-50' : 'bg-green-50')}>
            <p className={cn('text-2xl font-bold', balance < 3 ? 'text-amber-700' : 'text-green-700')}>{balance}</p>
            <p className={cn('text-xs mt-1', balance < 3 ? 'text-amber-600' : 'text-green-600')}>Remaining</p>
          </div>
        </div>
        <p className="text-xs text-gray-400 text-center mt-3">Weekdays only. Resets 1 Jan each year.</p>
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
            <div className={cn('rounded-lg p-3 text-sm font-medium text-center', days > balance ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700')}>
              {days} working day{days !== 1 ? 's' : ''}
              {days > balance && ` — exceeds your balance of ${balance} days`}
            </div>
          )}

          <div><label className="label">Reason</label><textarea className="input min-h-[70px] resize-none" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="Optional reason or notes" /></div>

          {error && <div className="flex items-center gap-2 text-xs text-red-600"><AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{error}</div>}

          <div className="flex gap-2">
            <button type="submit" disabled={saving || days > balance} className="btn-primary flex-1 disabled:opacity-50">{saving ? 'Submitting...' : 'Submit Application'}</button>
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
