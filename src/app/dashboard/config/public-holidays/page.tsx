'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { formatDate, nowSGT} from '@/lib/utils'
import { Plus, Trash2, CheckCircle, AlertCircle, Calendar, X, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { StatusBanner } from '@/components/StatusBanner'
import { useCurrentUser } from '@/hooks/useCurrentUser'

export default function PublicHolidaysPage() {

  const { user, loading } = useCurrentUser({ allowedRoles: ['business_ops'] })
  const { logActivity } = useActivityLog()
  const [holidays, setHolidays] = useState<any[]>([])
  const [selectedYear, setSelectedYear] = useState(nowSGT().getUTCFullYear())
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ holiday_date: '', name: '' })
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const { success, error, showMsg, showError, setError } = useToast()
  const years = [nowSGT().getUTCFullYear() - 1, nowSGT().getUTCFullYear(), nowSGT().getUTCFullYear() + 1]


  const load = async () => {
    logActivity('page_view', 'Public Holidays', 'Viewed public holidays')

    const { data } = await supabase.from('public_holidays')
      .select('*').eq('year', selectedYear).order('holiday_date')
    setHolidays(data || [])
  }

  useEffect(() => { load() }, [selectedYear])


  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('')
    const { data: { user } } = await supabase.auth.getUser()
    const { error: err } = await supabase.from('public_holidays').insert({
      holiday_date: form.holiday_date,
      name: form.name,
      created_by: user?.id,
    })
    if (err) { setError(err.message); setSaving(false); return }
    await load(); setShowForm(false); setForm({ holiday_date: '', name: '' })
    setSaving(false); logActivity('create', 'Public Holidays', 'Added public holiday')
    showMsg('Holiday added')
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Remove "${name}" from the holiday list?`)) return
    await supabase.from('public_holidays').delete().eq('id', id)
    await load(); logActivity('delete', 'Public Holidays', 'Deleted public holiday')
    showMsg('Holiday removed')
  }

  const nextYear = nowSGT().getUTCFullYear() + 1
  const hasNextYear = holidays.some(h => new Date(h.holiday_date).getFullYear() === nextYear) ||
    selectedYear !== nextYear
  const needsNextYearSetup = nowSGT().getUTCMonth() >= 10 && // November onwards (SGT)
    !holidays.filter(h => h.year === nextYear).length

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Public Holidays</h1>
        <p className="text-sm text-gray-500">
          Singapore public holidays used for leave day calculation. Update annually by end of November.
        </p>
      </div>

      {needsNextYearSetup && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Action required — {nextYear} holidays not yet set up</p>
            <p className="text-xs text-amber-600 mt-1">
              Please add the public holidays for {nextYear} before the year ends so leave calculations remain accurate.
              Switch to {nextYear} using the year selector below and add the holidays.
            </p>
          </div>
        </div>
      )}

      <StatusBanner success={success} error={error} />

      {/* Year selector */}
      <div className="flex gap-1">
        {years.map(y => (
          <button key={y} onClick={() => setSelectedYear(y)}
            className={cn('px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              selectedYear === y ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
            {y}
          </button>
        ))}
        <button onClick={() => setShowForm(!showForm)} className="btn-primary ml-auto flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Add Holiday
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="card p-4 space-y-3 border-red-200">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 text-sm">Add Public Holiday</h2>
            <button type="button" onClick={() => setShowForm(false)}><X className="w-4 h-4 text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date *</label>
              <input className="input" type="date" required value={form.holiday_date}
                onChange={e => setForm(f => ({ ...f, holiday_date: e.target.value }))} />
            </div>
            <div>
              <label className="label">Holiday Name *</label>
              <input className="input" required value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. National Day" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : 'Add Holiday'}</button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      <div className="card">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
            <Calendar className="w-4 h-4 text-red-600" /> {selectedYear} Public Holidays
          </h2>
          <span className="text-xs text-gray-400">{holidays.length} holidays</span>
        </div>
        {holidays.length === 0 ? (
          <div className="p-8 text-center">
            <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No holidays configured for {selectedYear}</p>
            <p className="text-xs text-gray-400 mt-1">Add holidays using the button above</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {holidays.map(h => (
              <div key={h.id} className="flex items-center gap-3 p-4">
                <div className="w-12 text-center flex-shrink-0">
                  <p className="text-xs text-gray-400">{new Date(h.holiday_date).toLocaleDateString('en-SG', { month: 'short' })}</p>
                  <p className="text-lg font-bold text-gray-900">{new Date(h.holiday_date).getDate()}</p>
                  <p className="text-xs text-gray-400">{new Date(h.holiday_date).toLocaleDateString('en-SG', { weekday: 'short' })}</p>
                </div>
                <p className="flex-1 text-sm font-medium text-gray-900">{h.name}</p>
                <button onClick={() => handleDelete(h.id, h.name)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        Public holidays and weekends are excluded from leave day calculations. Update this list each year by end of November.
      </div>
    </div>
  )
}
