'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { getGymStaffIds } from '@/lib/dashboard'
import { createClient } from '@/lib/supabase-browser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { validateHourlyRate } from '@/lib/validators'
import { AlertTriangle, Plus, Lock, CheckCircle, AlertCircle, X, Trash2,
  ChevronLeft, ChevronRight, Settings, Clock, Users
} from 'lucide-react'
import { formatDate, formatSGD, todaySGT, cn, nowSGT} from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { StatusBanner } from '@/components/StatusBanner'
import { useCurrentUser } from '@/hooks/useCurrentUser'

const DEFAULT_PRESETS = [
  { label: 'Morning', shift_start: '08:00', shift_end: '13:00' },
  { label: 'Afternoon', shift_start: '13:00', shift_end: '18:00' },
  { label: 'Evening', shift_start: '18:00', shift_end: '22:00' },
  { label: 'Full Day', shift_start: '09:00', shift_end: '18:00' },
]

export default function RosterPage() {

  const { user, loading } = useCurrentUser({ allowedRoles: ['manager', 'business_ops'] })
  const { logActivity } = useActivityLog()
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [gymId, setGymId] = useState<string | null>(null)
  const [gymName, setGymName] = useState('')
  const [partTimers, setPartTimers] = useState<any[]>([])
  const [roster, setRoster] = useState<any[]>([])
  const [presets, setPresets] = useState<any[]>([])
  const [weekStart, setWeekStart] = useState(() => {
    // Use SGT for correct week calculation in Singapore timezone
    const sgNow = nowSGT()
    const day = sgNow.getUTCDay() || 7  // 1=Mon ... 7=Sun
    sgNow.setUTCDate(sgNow.getUTCDate() - day + 1)
    return sgNow.toISOString().split('T')[0]
  })
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week')
  const [monthOffset, setMonthOffset] = useState(0)

  // Bulk entry state
  const [showBulkForm, setShowBulkForm] = useState(false)
  const [bulkForm, setBulkForm] = useState({
    user_id: '', preset_id: '', custom_start: '', custom_end: '', hourly_rate: '',
    dates: [] as string[],
  })

  // Preset management
  const [showPresetForm, setShowPresetForm] = useState(false)
  const [presetForm, setPresetForm] = useState({ label: '', shift_start: '', shift_end: '' })

  const [saving, setSaving] = useState(false)
  const [disputeEntry, setDisputeEntry] = useState<any>(null)
  const [disputeReason, setDisputeReason] = useState('')
  const [paidPayslipKeys, setPaidPayslipKeys] = useState<Set<string>>(new Set())
  const [overlapWarning, setOverlapWarning] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const { success, error, showMsg, showError, setError } = useToast()


  const loadData = async (isInitial = false) => {
    if (!user) return
    if (isInitial) logActivity('page_view', 'Duty Roster', 'Viewed duty roster')
    // Biz Ops has no assigned gym — default to first active gym for roster view
    let gId = user.manager_gym_id || null
    if (user!.role === 'business_ops' && !gId) {
      const { data: firstGym } = await supabase.from('gyms').select('id').eq('is_active', true).order('name').limit(1).maybeSingle()
      gId = firstGym?.id || null
    }
    setGymId(gId)

    if (gId) {
      const { data: gym } = await supabase.from('gyms').select('name').eq('id', gId).maybeSingle()
      setGymName(gym?.name || '')

      // Load presets for this gym
      const { data: presetsData } = await supabase.from('roster_shift_presets')
        .select('*').eq('gym_id', gId).eq('is_active', true).order('sort_order')
      setPresets(presetsData?.length ? presetsData : DEFAULT_PRESETS)

      // Load part-timers assigned to this gym only (via trainer_gyms)
      const { data: ptGymRows } = await supabase.from('trainer_gyms')
        .select('trainer_id').eq('gym_id', gId)
      const ptIds = (ptGymRows || []).map((r: any) => r.trainer_id)
      let pt: any[] = []
      if (ptIds.length > 0) {
        const { data: ptData } = await supabase.from('users_safe')
          .select('*').eq('employment_type', 'part_time').eq('is_archived', false)
          .in('id', ptIds).order('full_name')
        pt = ptData || []
      }
      setPartTimers(pt)
    }

    // Load roster — week or month range
    let rangeStart: string, rangeEnd: string
    if (viewMode === 'month') {
      const now = nowSGT() // SGT
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthOffset, 1))
      rangeStart = d.toISOString().split('T')[0]
      const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
      rangeEnd = last.toISOString().split('T')[0]
    } else {
      const [wy, wm, wd] = weekStart.split('-').map(Number)
      const weekEnd = new Date(wy, wm - 1, wd + 6)
      rangeStart = weekStart
      rangeEnd = `${weekEnd.getFullYear()}-${String(weekEnd.getMonth()+1).padStart(2,'0')}-${String(weekEnd.getDate()).padStart(2,'0')}`
    }
    let rQ = supabase.from('duty_roster')
      .select('*, user:users!duty_roster_user_id_fkey(full_name, phone, hourly_rate)')
      .gte('shift_date', rangeStart).lte('shift_date', rangeEnd)
      .order('shift_date').order('shift_start')
    if (gId) rQ = rQ.eq('gym_id', gId)
    const { data: rData } = await rQ
    setRoster(rData || [])

    // Load approved/paid payslip keys to block disputes on already-paid shifts
    // Key format: userId:gymId:month:year
    if (gId) {
      const { data: paidPs } = await supabase.from('payslips')
        .select('user_id, gym_id, month, year')
        .eq('gym_id', gId).in('status', ['approved', 'paid'])
      const keys = new Set<string>(
        (paidPs || []).map((p: any) => `${p.user_id}:${p.gym_id}:${p.month}:${p.year}`)
      )
      setPaidPayslipKeys(keys)
    }
  }

  useEffect(() => { if (user) loadData(true) }, [weekStart, viewMode, monthOffset, user])


  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const [y, m, d] = weekStart.split('-').map(Number)
    const date = new Date(y, m - 1, d + i) // local date arithmetic, no UTC conversion
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
  })

  const shiftWeek = (dir: number) => {
    const [y, m, d] = weekStart.split('-').map(Number)
    const date = new Date(y, m - 1, d + dir * 7)
    setWeekStart(`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`)
  }

  // Toggle a date in bulk selection
  const toggleDate = (date: string) => {
    setBulkForm(f => ({
      ...f, dates: f.dates.includes(date) ? f.dates.filter(d => d !== date) : [...f.dates, date]
    }))
  }

  // Get shift times from selected preset or custom
  const getShiftTimes = () => {
    if (bulkForm.preset_id === 'custom') {
      return { start: bulkForm.custom_start, end: bulkForm.custom_end }
    }
    const preset = presets.find(p => p.id === bulkForm.preset_id || p.label === bulkForm.preset_id)
    return preset ? { start: preset.shift_start, end: preset.shift_end } : null
  }

  // Check for overlaps on selected dates for selected staff
  const checkOverlaps = () => {
    if (!bulkForm.user_id || bulkForm.dates.length === 0) return null
    const times = getShiftTimes()
    if (!times) return null
    const overlapping = bulkForm.dates.filter(date => {
      return roster.some(r =>
        r.user_id === bulkForm.user_id && r.shift_date === date && !r.is_locked
      )
    })
    if (overlapping.length > 0) return `${bulkForm.user_id === 'all' ? 'Some staff' : 'This staff member'} already has shifts on: ${overlapping.map(d => formatDate(d)).join(', ')}`

    // Check multiple staff on same slot
    if (bulkForm.dates.length > 0 && times) {
      const conflicts = bulkForm.dates.filter(date =>
        roster.filter(r => r.shift_date === date && r.shift_start === times.start && r.shift_end === times.end).length > 0
      )
      if (conflicts.length > 0) return `Other staff are already rostered for ${times.start}–${times.end} on: ${conflicts.map(d => formatDate(d)).join(', ')}. You can still proceed if accepted.`
    }
    return null
  }

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Hourly rate is read-only from staff profile — no validation needed
    if (!gymId || bulkForm.dates.length === 0) { setError('Select at least one date'); return }
    const times = getShiftTimes()
    if (!times) { setError('Select a shift time'); return }
    const staff = bulkForm.user_id === 'all'
      ? partTimers : partTimers.filter(p => p.id === bulkForm.user_id)
    if (staff.length === 0) { setError('Select staff member(s)'); return }

    setSaving(true); setError(''); setOverlapWarning(null)

    const rows = []
    for (const date of bulkForm.dates) {
      for (const pt of staff) {
        const rate = parseFloat(bulkForm.hourly_rate) || pt.hourly_rate || 0
        if (!rate) continue
        const startParts = times.start.split(':').map(Number)
        const endParts = times.end.split(':').map(Number)
        const hours = (endParts[0] * 60 + endParts[1] - startParts[0] * 60 - startParts[1]) / 60
        rows.push({
          user_id: pt.id, gym_id: gymId,
          shift_date: date, shift_start: times.start, shift_end: times.end,
          hours_worked: Math.max(hours, 0), hourly_rate: rate,
          gross_pay: Math.max(hours, 0) * rate,
          status: 'scheduled', created_by: user?.id,
        })
      }
    }

    if (rows.length > 0) {
      const { error: err } = await supabase.from('duty_roster').insert(rows)
      if (err) { setError(err.message); setSaving(false); return }
    }

    setSaving(false)
    setBulkForm({ user_id: '', preset_id: '', custom_start: '', custom_end: '', hourly_rate: '', dates: [] })
    setShowBulkForm(false)
    logActivity('create', 'Duty Roster', `Added ${rows.length} roster shift(s)`)
    showMsg(`${rows.length} shift${rows.length !== 1 ? 's' : ''} added`)
    await loadData()
  }

  const handleDispute = async () => {
    if (!disputeEntry || !disputeReason.trim()) return
    setSaving(true)
    const { error } = await supabase.from('duty_roster').update({
      status: 'disputed',
      disputed_at: nowSGT().toISOString(),
      disputed_by: user?.id,
      dispute_reason: disputeReason.trim(),
    }).eq('id', disputeEntry.id)
    if (error) { setError(error.message); setSaving(false); return }
    logActivity('update', 'Duty Roster', `Disputed shift for ${disputeEntry.user?.full_name} on ${disputeEntry.shift_date}`)
    showMsg('Dispute raised — Biz Ops will review')
    setDisputeEntry(null); setDisputeReason('')
    setSaving(false); await loadData()
  }

  const handleSavePreset = async (e: React.FormEvent) => {
    e.preventDefault(); if (!gymId) return
    await supabase.from('roster_shift_presets').insert({
      gym_id: gymId, label: presetForm.label,
      shift_start: presetForm.shift_start, shift_end: presetForm.shift_end,
      sort_order: presets.length, created_by: user?.id,
    })
    await loadData(); setShowPresetForm(false); setPresetForm({ label: '', shift_start: '', shift_end: '' })
    logActivity('create', 'Duty Roster', 'Saved roster shift preset')
    showMsg('Shift preset saved')
  }

  const handleLock = async (entry: any) => {
    if (!confirm(`Lock shift for ${entry.user?.full_name}?`)) return
    await supabase.from('duty_roster').update({
      is_locked: true, locked_at: new Date(Date.now() + 8*60*60*1000).toISOString(), locked_by: user?.id, status: 'completed'
    }).eq('id', entry.id)
    logActivity('update', 'Duty Roster', 'Locked roster shift')
    await loadData(); showMsg('Shift locked')
  }

  const handleDelete = async (entry: any) => {
    if (entry.is_locked) {
      setError('Shift is locked and cannot be deleted. Contact Business Ops to handle via payroll.'); return
    }
    if (!confirm('Delete this shift?')) return
    await supabase.from('duty_roster').delete().eq('id', entry.id)
    logActivity('delete', 'Duty Roster', 'Deleted roster shift')
    await loadData(); showMsg('Shift deleted')
  }

  const totalHours = roster.reduce((s, r) => s + (r.hours_worked || 0), 0)
  const totalPay = roster.reduce((s, r) => s + (r.gross_pay || 0), 0)
  const isBizOps = user?.role === 'business_ops'
  const overlap = showBulkForm ? checkOverlaps() : null

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Duty Roster</h1>
          <p className="text-sm text-gray-500">{gymName} · Part-time staff</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
            <button onClick={() => setViewMode('week')}
              className={cn('px-3 py-1.5 font-medium transition-colors', viewMode === 'week' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50')}>
              Week
            </button>
            <button onClick={() => setViewMode('month')}
              className={cn('px-3 py-1.5 font-medium transition-colors', viewMode === 'month' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50')}>
              Month
            </button>
          </div>
          {!isBizOps && <button onClick={() => setShowPresetForm(!showPresetForm)} className="btn-secondary flex items-center gap-1.5 text-xs py-1.5">
            <Settings className="w-3.5 h-3.5" /> Manage Shifts
          </button>}
          {!isBizOps && <button onClick={() => setShowBulkForm(!showBulkForm)} className="btn-primary flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Add Shifts
          </button>}
        </div>
      </div>

      <StatusBanner success={success} error={error} onDismissError={() => setError('')} />

      {/* Preset manager */}
      {showPresetForm && !isBizOps && (
        <div className="card p-4 space-y-4 border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 text-sm">Shift Time Presets</h2>
            <button onClick={() => setShowPresetForm(false)}><X className="w-4 h-4 text-gray-400" /></button>
          </div>
          <div className="space-y-2">
            {presets.map((p, i) => (
              <div key={i} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg text-sm">
                <span className="font-medium text-gray-900 w-24">{p.label}</span>
                <span className="text-gray-500">{p.shift_start} – {p.shift_end}</span>
                <span className="text-xs text-gray-400">
                  {(() => { const [sh,sm] = p.shift_start.split(':').map(Number); const [eh,em] = p.shift_end.split(':').map(Number); return ((eh*60+em-sh*60-sm)/60).toFixed(1) })()}h
                </span>
              </div>
            ))}
          </div>
          <form onSubmit={handleSavePreset} className="grid grid-cols-3 gap-2">
            <input className="input" required placeholder="Label (e.g. Split)" value={presetForm.label} onChange={e => setPresetForm(f => ({ ...f, label: e.target.value }))} />
            <input className="input" required type="time" value={presetForm.shift_start} onChange={e => setPresetForm(f => ({ ...f, shift_start: e.target.value }))} />
            <input className="input" required type="time" value={presetForm.shift_end} onChange={e => setPresetForm(f => ({ ...f, shift_end: e.target.value }))} />
            <button type="submit" className="col-span-3 btn-primary text-sm">Add Preset</button>
          </form>
        </div>
      )}

      {/* Navigator */}
      {viewMode === 'week' ? (
        <div className="flex items-center gap-3">
          <button onClick={() => shiftWeek(-1)} className="btn-secondary p-2"><ChevronLeft className="w-4 h-4" /></button>
          <div className="flex-1 text-center">
            <p className="text-sm font-medium text-gray-900">{formatDate(weekStart)} — {formatDate(weekDays[6])}</p>
            <p className="text-xs text-gray-400">{roster.length} shifts · {totalHours.toFixed(1)}h · {formatSGD(totalPay)}</p>
          </div>
          <button onClick={() => shiftWeek(1)} className="btn-secondary p-2"><ChevronRight className="w-4 h-4" /></button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <button onClick={() => setMonthOffset(o => Math.max(o - 1, -1))} disabled={monthOffset <= -1}
            className="btn-secondary p-2 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
          <div className="flex-1 text-center">
            <p className="text-sm font-medium text-gray-900">{(() => {
              const nowSGTms = new Date(Date.now() + 8*60*60*1000)
              const d = new Date(nowSGTms.getUTCFullYear(), nowSGTms.getUTCMonth() + monthOffset, 1)
              return d.toLocaleDateString('en-SG', { month: 'long', year: 'numeric' })
            })()}</p>
            <p className="text-xs text-gray-400">{roster.length} shifts · {totalHours.toFixed(1)}h · {formatSGD(totalPay)}</p>
          </div>
          <button onClick={() => setMonthOffset(o => Math.min(o + 1, 1))} disabled={monthOffset >= 1}
            className="btn-secondary p-2 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
        </div>
      )}

      {/* Bulk entry form */}
      {showBulkForm && !isBizOps && (
        <form onSubmit={handleBulkSubmit} className="card p-4 space-y-4 border-red-200">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 text-sm">Add Shifts in Bulk</h2>
            <button type="button" onClick={() => setShowBulkForm(false)}><X className="w-4 h-4 text-gray-400" /></button>
          </div>

          {/* Step 1: Staff */}
          <div>
            <label className="label">Step 1 — Select Staff Member</label>
            <select className="input" required value={bulkForm.user_id}
              onChange={e => { setBulkForm(f => ({ ...f, user_id: e.target.value, hourly_rate: partTimers.find(p => p.id === e.target.value)?.hourly_rate?.toString() || '' })) }}>
              <option value="">Select staff...</option>
              {partTimers.map(p => <option key={p.id} value={p.id}>{p.full_name} {p.hourly_rate ? `(${formatSGD(p.hourly_rate)}/hr)` : ''}</option>)}
            </select>
          </div>

          {/* Step 2: Shift time */}
          <div>
            <label className="label">Step 2 — Select Shift</label>
            <div className="grid grid-cols-2 gap-2">
              {presets.map((p, i) => (
                <label key={i} className={cn('flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors',
                  (bulkForm.preset_id === p.id || bulkForm.preset_id === p.label) ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-gray-300')}>
                  <input type="radio" name="preset" checked={bulkForm.preset_id === (p.id || p.label)}
                    onChange={() => setBulkForm(f => ({ ...f, preset_id: p.id || p.label, custom_start: '', custom_end: '' }))} />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{p.label}</p>
                    <p className="text-xs text-gray-400">{p.shift_start} – {p.shift_end}</p>
                  </div>
                </label>
              ))}
              <label className={cn('flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors',
                bulkForm.preset_id === 'custom' ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-gray-300')}>
                <input type="radio" name="preset" checked={bulkForm.preset_id === 'custom'}
                  onChange={() => setBulkForm(f => ({ ...f, preset_id: 'custom' }))} />
                <p className="text-sm font-medium text-gray-900">Custom time</p>
              </label>
            </div>
            {bulkForm.preset_id === 'custom' && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div><label className="label text-xs">Start</label><input className="input" type="time" required={bulkForm.preset_id === 'custom'} value={bulkForm.custom_start} onChange={e => setBulkForm(f => ({ ...f, custom_start: e.target.value }))} /></div>
                <div><label className="label text-xs">End</label><input className="input" type="time" required={bulkForm.preset_id === 'custom'} value={bulkForm.custom_end} onChange={e => setBulkForm(f => ({ ...f, custom_end: e.target.value }))} /></div>
              </div>
            )}
          </div>

          {/* Hourly rate — read-only, pulled from staff profile */}
          {bulkForm.user_id && (
            <div>
              <label className="label">Hourly Rate (SGD)</label>
              <input className="input bg-gray-50 text-gray-600 cursor-not-allowed" type="number" readOnly
                value={bulkForm.hourly_rate}
                title="Hourly rate is set in the staff profile and cannot be changed here" />
              <p className="text-xs text-gray-400 mt-1">Rate from staff profile — edit in Staff Management to change</p>
            </div>
          )}

          {/* Step 3: Pick dates from current week */}
          <div>
            <label className="label">Step 3 — Select Dates (current week shown)</label>
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map(date => {
                const dayLabel = new Date(date).toLocaleDateString('en-SG', { weekday: 'short' })
                const dayNum = new Date(date).getDate()
                const isSelected = bulkForm.dates.includes(date)
                const isPast = date < todaySGT()
                return (
                  <button key={date} type="button" onClick={() => !isPast && toggleDate(date)}
                    className={cn('flex flex-col items-center py-2.5 rounded-lg border transition-colors text-xs',
                      isPast ? 'opacity-40 cursor-not-allowed border-gray-100' :
                      isSelected ? 'border-red-500 bg-red-600 text-white' : 'border-gray-200 hover:border-red-300')}>
                    <span className={cn('font-medium', isSelected ? 'text-white' : 'text-gray-400')}>{dayLabel}</span>
                    <span className={cn('text-sm font-bold', isSelected ? 'text-white' : 'text-gray-900')}>{dayNum}</span>
                  </button>
                )
              })}
            </div>
            {bulkForm.dates.length > 0 && (
              <p className="text-xs text-gray-500 mt-1">{bulkForm.dates.length} date{bulkForm.dates.length !== 1 ? 's' : ''} selected</p>
            )}
          </div>

          {/* Overlap warning */}
          {overlap && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-amber-800">{overlap}</p>
                <p className="text-xs text-amber-600 mt-0.5">You can still proceed — multiple staff per shift is allowed with manager acceptance.</p>
              </div>
            </div>
          )}

          {/* Preview */}
          {bulkForm.dates.length > 0 && bulkForm.user_id && bulkForm.preset_id && bulkForm.hourly_rate && (() => {
            const times = getShiftTimes()
            if (!times) return null
            const [sh,sm] = times.start.split(':').map(Number)
            const [eh,em] = times.end.split(':').map(Number)
            const hrs = Math.max((eh*60+em-sh*60-sm)/60, 0)
            const rate = parseFloat(bulkForm.hourly_rate)
            const total = hrs * rate * bulkForm.dates.length
            return (
              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600">
                <p className="font-medium text-gray-900 mb-1">Summary</p>
                <p>{bulkForm.dates.length} shift{bulkForm.dates.length !== 1 ? 's' : ''} × {hrs.toFixed(1)}h × {formatSGD(rate)}/hr = <strong>{formatSGD(total)}</strong></p>
              </div>
            )
          })()}

          <div className="flex gap-2">
            <button type="submit" disabled={saving || bulkForm.dates.length === 0}
              className="btn-primary flex-1 disabled:opacity-50">
              {saving ? 'Saving...' : `Add ${bulkForm.dates.length * (bulkForm.user_id === 'all' ? partTimers.length : 1) || 0} Shift${bulkForm.dates.length !== 1 ? 's' : ''}`}
            </button>
            <button type="button" onClick={() => setShowBulkForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      {/* Monthly view — staff grouped with shift pills */}
      {viewMode === 'month' && (
        <div className="space-y-3">
          {/* Group roster by user_id — shift-centric so historical shifts always show */}
          {(() => {
            const grouped: Record<string, any[]> = {}
            roster.forEach((r: any) => {
              if (!grouped[r.user_id]) grouped[r.user_id] = []
              grouped[r.user_id].push(r)
            })
            if (Object.keys(grouped).length === 0) return (
              <div className="card p-8 text-center">
                <p className="text-sm text-gray-500">No shifts this month.</p>
              </div>
            )
            return Object.entries(grouped).map(([userId, ptShifts]) => {
            const pt = { id: userId, full_name: (ptShifts[0] as any).user?.full_name || userId }
            if (ptShifts.length === 0) return null
            const totalHrs = ptShifts.reduce((s: number, r: any) => s + (r.hours_worked || 0), 0)
            const totalPay2 = ptShifts.reduce((s: number, r: any) => s + (r.gross_pay || 0), 0)
            return (
              <div key={pt.id} className="card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-gray-900 text-sm">{pt.full_name}</p>
                  <div className="flex gap-3 text-xs text-gray-500">
                    <span>{ptShifts.length} shifts · {totalHrs.toFixed(1)}h</span>
                    <span className="font-medium text-gray-700">{formatSGD(totalPay2)}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ptShifts.map((r: any) => (
                    <div key={r.id} className={cn('text-xs px-2 py-1 rounded-lg border', r.is_locked ? 'bg-gray-100 border-gray-200 text-gray-500' : 'bg-blue-50 border-blue-100 text-blue-700')}>
                      <span className="font-medium">{new Date(r.shift_date).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}</span>
                      <span className="text-gray-400 ml-1">{r.shift_start?.slice(0,5)}–{r.shift_end?.slice(0,5)}</span>
                      {r.is_locked && <span className="ml-1">🔒</span>}
                    </div>
                  ))}
                </div>
              </div>
            )
          })
          })()}
        </div>
      )}

      {/* Weekly roster */}
      {viewMode === 'week' && weekDays.map(date => {
        const dayShifts = roster.filter(r => r.shift_date === date)
        const dayLabel = new Date(date).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' })
        const hasMultiple = dayShifts.length > 1
        return (
          <div key={date} className="card">
            <div className={cn('flex items-center justify-between p-3 border-b border-gray-100 rounded-t-xl', hasMultiple ? 'bg-blue-50' : 'bg-gray-50')}>
              <p className="text-sm font-medium text-gray-700">{dayLabel}</p>
              <div className="flex items-center gap-2">
                {hasMultiple && (
                  <span className="flex items-center gap-1 text-xs text-blue-600 font-medium">
                    <Users className="w-3.5 h-3.5" /> {dayShifts.length} staff rostered
                  </span>
                )}
                {dayShifts.length > 0 && (
                  <p className="text-xs text-gray-400">
                    {dayShifts.reduce((s, r) => s + r.hours_worked, 0).toFixed(1)}h · {formatSGD(dayShifts.reduce((s, r) => s + r.gross_pay, 0))}
                  </p>
                )}
              </div>
            </div>
            {dayShifts.length === 0 ? (
              <p className="p-3 text-xs text-gray-300 text-center">No shifts</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {dayShifts.map(entry => (
                  <div key={entry.id} className={cn('p-3 flex items-center gap-3', entry.is_locked && 'bg-gray-50')}>
                    <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-red-700 font-semibold text-xs">{entry.user?.full_name?.charAt(0)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900">{entry.user?.full_name}</p>
                        {entry.is_locked && <Lock className="w-3 h-3 text-gray-400" />}
                        {entry.whatsapp_reminder_sent && <span className="text-xs text-green-600">✓ Reminded</span>}
                      </div>
                      <p className="text-xs text-gray-500">
                        {entry.shift_start} – {entry.shift_end} · {entry.hours_worked?.toFixed(1)}h · {formatSGD(entry.gross_pay)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {/* Status badge for locked shifts */}
                      {entry.is_locked && entry.status === 'disputed' && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Disputed</span>
                      )}
                      {entry.is_locked && entry.status === 'absent' && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Absent</span>
                      )}
                      {/* Lock button — only on unlocked shifts */}
                      {!isBizOps && !entry.is_locked && (
                        <button onClick={() => handleLock(entry)} title="Lock" className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg">
                          <Lock className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {/* Delete button — only on unlocked shifts */}
                      {!isBizOps && !entry.is_locked && (
                        <button onClick={() => handleDelete(entry)} title="Delete" className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {/* Dispute button — blocked if payslip already approved/paid */}
                      {!isBizOps && entry.is_locked && entry.status === 'completed' && !entry.disputed_at &&
                        (() => {
                          // 3 calendar days grace period from shift date
                          const [sy, sm, sd] = entry.shift_date.split('-').map(Number)
                          const shiftDate = new Date(sy, sm - 1, sd)
                          const todayDate = new Date(todaySGT())
                          const diffDays = Math.floor((todayDate.getTime() - shiftDate.getTime()) / (1000 * 60 * 60 * 24))
                          return diffDays <= 3
                        })() && (() => {
                          const [sy, sm] = entry.shift_date.split('-')
                          const psKey = `${entry.user_id}:${gymId}:${parseInt(sm)}:${parseInt(sy)}`
                          return !paidPayslipKeys.has(psKey)
                        })() && (
                        <button onClick={() => { setDisputeEntry(entry); setDisputeReason('') }}
                          title="Raise dispute" className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg">
                          <AlertTriangle className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}


      {/* Dispute modal */}
      {disputeEntry && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-5 max-w-md w-full space-y-4">
            <div>
              <h2 className="font-semibold text-gray-900">Raise Dispute</h2>
              <p className="text-xs text-gray-500 mt-0.5">{disputeEntry.user?.full_name} · {disputeEntry.shift_date} · {disputeEntry.shift_start}–{disputeEntry.shift_end}</p>
            </div>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              ⚠ This shift was auto-locked and marked as worked. Raise a dispute if the part-timer did not show up. Business Operations will review and resolve.
            </div>
            <div>
              <label className="label">Reason for dispute *</label>
              <textarea className="input min-h-[80px] resize-none" required
                placeholder="e.g. Part-timer did not show up for this shift"
                value={disputeReason} onChange={e => setDisputeReason(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <button onClick={handleDispute} disabled={saving || !disputeReason.trim()}
                className="btn-primary flex-1 disabled:opacity-50">
                {saving ? 'Submitting...' : 'Submit Dispute'}
              </button>
              <button onClick={() => { setDisputeEntry(null); setDisputeReason('') }}
                className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
