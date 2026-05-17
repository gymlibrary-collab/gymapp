'use client'

import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { formatSGD } from '@/lib/utils'
import { Plus, Edit2, X, Save, Layers, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { StatusBanner } from '@/components/StatusBanner'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { PageSpinner } from '@/components/PageSpinner'

type FormType = { name: string; duration_type: 'months' | 'days'; duration_months: string; duration_days: string; price_sgd: string; gym_id: string }
const EMPTY_FORM: FormType = { name: '', duration_type: 'months', duration_months: '', duration_days: '', price_sgd: '', gym_id: '' }


// ── TypeForm — defined outside MembershipTypesPage to prevent focus loss ──────
// When defined inside the component, every state change (e.g. typing in Name)
// recreates the function reference, causing React to unmount+remount the form
// and lose input focus. Props replace closed-over state.
interface TypeFormProps {
  isGlobal: boolean
  form: any
  setForm: (fn: (f: any) => any) => void
  gyms: any[]
  selectedGymFilter: string
  editing: any
  setShowGlobalForm: (v: boolean) => void
  setShowGymForm: (v: boolean) => void
  handleSubmit: (e: React.FormEvent, isGlobal: boolean) => void
  saving: boolean
}

function TypeForm({ isGlobal, form, setForm, gyms, selectedGymFilter, editing, setShowGlobalForm, setShowGymForm, handleSubmit, saving }: TypeFormProps) {
  return (
    <form onSubmit={e => handleSubmit(e, isGlobal)} className="card p-4 space-y-4 border-red-200">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 text-sm">{editing ? 'Edit Type' : isGlobal ? 'New Global Type' : 'New Gym-Specific Type'}</h2>
        <button type="button" onClick={() => { isGlobal ? setShowGlobalForm(false) : setShowGymForm(false); setForm(() => EMPTY_FORM) }}><X className="w-4 h-4 text-gray-400" /></button>
      </div>
      {!isGlobal && (
        <div>
          <label className="label">Gym *</label>
          <select className="input" value={form.gym_id || selectedGymFilter} onChange={e => setForm(f => ({ ...f, gym_id: e.target.value }))} required>
            {gyms.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
      )}
      <div><label className="label">Name *</label><input className="input" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={isGlobal ? 'e.g. Monthly, Annual' : 'e.g. 12-Month Promo — Gym A'} /></div>
      <div>
        <label className="label">Duration *</label>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs mb-2">
          <button type="button" onClick={() => setForm(f => ({ ...f, duration_type: 'months', duration_days: '' }))}
            className={cn('px-3 py-1.5 font-medium flex-1 transition-colors', form.duration_type === 'months' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50')}>
            Months
          </button>
          <button type="button" onClick={() => setForm(f => ({ ...f, duration_type: 'days', duration_months: '' }))}
            className={cn('px-3 py-1.5 font-medium flex-1 transition-colors', form.duration_type === 'days' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50')}>
            Days (short pass)
          </button>
        </div>
        {form.duration_type === 'months' ? (
          <select className="input" required value={form.duration_months} onChange={e => setForm(f => ({ ...f, duration_months: e.target.value }))}>
            <option value="">Select duration...</option>
            {[1,3,6,12,18,24].map(m => <option key={m} value={m}>{m} month{m !== 1 ? 's' : ''}</option>)}
          </select>
        ) : (
          <select className="input" required value={form.duration_days} onChange={e => setForm(f => ({ ...f, duration_days: e.target.value }))}>
            <option value="">Select duration...</option>
            {[1,7,14,21].map(d => <option key={d} value={d}>{d} day{d !== 1 ? 's' : ''}</option>)}
          </select>
        )}
      </div>
      <div><label className="label">Price (SGD) *</label><input className="input" required type="number" min="0" step="0.01" value={form.price_sgd} onChange={e => setForm(f => ({ ...f, price_sgd: e.target.value }))} placeholder="0.00" /></div>
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2"><Save className="w-4 h-4" />{saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Type'}</button>
        <button type="button" onClick={() => { isGlobal ? setShowGlobalForm(false) : setShowGymForm(false); setForm(() => EMPTY_FORM) }} className="btn-secondary">Cancel</button>
      </div>
    </form>
  )
}

// ── TypeRow ───────────────────────────────────────────────────────────────────
function TypeRow({ type, isGlobal, openEdit, toggleActive }: { type: any; isGlobal: boolean; openEdit: (t: any, g: boolean) => void; toggleActive: (t: any) => void }) {
  return (
    <div className={cn('flex items-center gap-3 p-4', !type.is_active && 'opacity-60')}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium text-gray-900 text-sm">{type.name}</p>
          <span className={type.is_active ? 'badge-active' : 'badge-inactive'}>{type.is_active ? 'Active' : 'Inactive'}</span>
        </div>
        <p className="text-xs text-gray-500">{type.duration_months ? `${type.duration_months} month${type.duration_months !== 1 ? 's' : ''}` : `${type.duration_days} day${type.duration_days !== 1 ? 's' : ''}`} · {formatSGD(type.price_sgd)}</p>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={() => openEdit(type, isGlobal)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 className="w-4 h-4" /></button>
        <button onClick={() => toggleActive(type)} className={cn('text-xs px-2 py-1 rounded-lg', type.is_active ? 'text-gray-500 hover:bg-gray-100' : 'text-green-600 hover:bg-green-50')}>{type.is_active ? 'Deactivate' : 'Activate'}</button>
      </div>
    </div>
  )
}

export default function MembershipTypesPage() {
  const { user, loading } = useCurrentUser({ allowedRoles: ['business_ops'] })
  const { logActivity } = useActivityLog()
  const supabase = createClient()
  const { success, error, showMsg, showError, setError } = useToast()

  const [types, setTypes] = useState<any[]>([])
  const [gyms, setGyms] = useState<any[]>([])
  const [selectedGymFilter, setSelectedGymFilter] = useState<string>('')
  const [showGlobalForm, setShowGlobalForm] = useState(false)
  const [showGymForm, setShowGymForm] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [form, setForm] = useState<FormType>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [dataLoading, setDataLoading] = useState(true)

  const load = async () => {
    logActivity('page_view', 'Membership Types', 'Viewed membership types')
    const [{ data: typesData }, { data: gymsData }] = await Promise.all([
      supabase.from('membership_types').select('*, gym:gyms(name)').order('price_sgd'),
      supabase.from('gyms').select('id, name').eq('is_active', true).order('name'),
    ])
    setTypes(typesData || [])
    setGyms(gymsData || [])
    if (gymsData && gymsData.length > 0 && !selectedGymFilter) setSelectedGymFilter(gymsData[0].id)
  }

  useEffect(() => { if (!user) return; load().finally(() => setDataLoading(false)) }, [user])

  const globalTypes = types.filter(t => !t.gym_id)
  const gymTypes    = types.filter(t => t.gym_id === selectedGymFilter)

  const validateName = (name: string, excludeId?: string) => {
    const exists = types.some(t => t.name.toLowerCase() === name.toLowerCase() && t.id !== excludeId)
    return exists ? 'A membership type with this name already exists.' : null
  }

  const handleSubmit = async (e: React.FormEvent, isGlobal: boolean) => {
    e.preventDefault(); setSaving(true); setError('')
    const nameErr = validateName(form.name, editing?.id)
    if (nameErr) { setError(nameErr); setSaving(false); return }
    let durationMonths: number | null = null
    let durationDays: number | null = null
    if (form.duration_type === 'months') {
      const months = parseInt(form.duration_months)
      if (!months || months < 1) { setError('Duration must be at least 1 month.'); setSaving(false); return }
      durationMonths = months
      durationDays = null  // day count not stored for month-based — end date calculated at use time via addCalendarMonths()
    } else {
      const days = parseInt(form.duration_days)
      if (!days || days < 1) { setError('Please select a duration.'); setSaving(false); return }
      durationDays = days
      durationMonths = null
    }
    const payload: any = {
      name: form.name.trim(),
      duration_months: durationMonths,
      duration_days: durationDays ?? null,
      price_sgd: parseFloat(form.price_sgd),
      gym_id: isGlobal ? null : (form.gym_id || selectedGymFilter || null),
    }
    let err
    if (editing) {
      const { error: e } = await supabase.from('membership_types').update(payload).eq('id', editing.id); err = e
    } else {
      const { error: e } = await supabase.from('membership_types').insert({ ...payload, is_active: true }); err = e
    }
    if (err) { setError(err.message); setSaving(false); return }
    await load()
    setShowGlobalForm(false); setShowGymForm(false); setEditing(null); setForm(EMPTY_FORM)
    setSaving(false)
    logActivity('update', 'Membership Types', editing ? 'Updated membership type' : 'Added membership type')
    showMsg(editing ? 'Membership type updated' : 'Membership type added')
  }

  const openEdit = (type: any, isGlobal: boolean) => {
    setEditing(type)
    setForm({ name: type.name, duration_type: type.duration_months ? 'months' : 'days', duration_months: (type.duration_months || '').toString(), duration_days: (!type.duration_months && type.duration_days ? type.duration_days : '').toString(), price_sgd: type.price_sgd.toString(), gym_id: type.gym_id || '' })
    if (isGlobal) { setShowGlobalForm(true); setShowGymForm(false) }
    else { setShowGymForm(true); setShowGlobalForm(false) }
  }

  const toggleActive = async (type: any) => {
    if (type.is_active) {
      const { count } = await supabase.from('gym_memberships')
        .select('id', { count: 'exact', head: true })
        .eq('membership_type_id', type.id).eq('status', 'active').eq('sale_status', 'confirmed')
      if ((count || 0) > 0) {
        setError(`Cannot deactivate — ${count} active membership${count === 1 ? '' : 's'} use this type.`)
        return
      }
    }
    await supabase.from('membership_types').update({ is_active: !type.is_active }).eq('id', type.id)
    await load()
    logActivity('update', 'Membership Types', type.is_active ? 'Deactivated membership type' : 'Activated membership type')
    showMsg(type.is_active ? 'Membership type deactivated' : 'Membership type activated')
  }

  // TypeForm and TypeRow are defined as top-level components below.

  if (loading || !user || dataLoading) return <PageSpinner />

  return (
    <div className="space-y-5 max-w-2xl">
      <div><h1 className="text-xl font-bold text-gray-900">Membership Types</h1><p className="text-sm text-gray-500">Configure global and gym-specific membership types</p></div>
      <StatusBanner success={success} error={error} />

      {/* Global Types */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2"><Layers className="w-4 h-4 text-red-600" /> Global Types <span className="text-xs text-gray-400 font-normal">(available at all gyms)</span></h2>
          <button onClick={() => { setShowGlobalForm(!showGlobalForm); setShowGymForm(false); setEditing(null); setForm(EMPTY_FORM) }} className="btn-primary text-xs py-1.5 flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add Global</button>
        </div>
        {showGlobalForm && <div className="p-4 border-b border-gray-100"><TypeForm isGlobal={true} form={form} setForm={setForm} gyms={gyms} selectedGymFilter={selectedGymFilter} editing={editing} setShowGlobalForm={setShowGlobalForm} setShowGymForm={setShowGymForm} handleSubmit={handleSubmit} saving={saving} /></div>}
        {globalTypes.length === 0
          ? <p className="p-4 text-sm text-gray-400 text-center">No global types configured</p>
          : <div className="divide-y divide-gray-100">{globalTypes.map(t => <TypeRow key={t.id} type={t} isGlobal={true} openEdit={openEdit} toggleActive={toggleActive} />)}</div>
        }
      </div>

      {/* Gym-Specific Types */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2"><Building2 className="w-4 h-4 text-red-600" /> Gym-Specific Types</h2>
          <button onClick={() => { setShowGymForm(!showGymForm); setShowGlobalForm(false); setEditing(null); setForm(EMPTY_FORM) }} className="btn-primary text-xs py-1.5 flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add</button>
        </div>
        {showGymForm && <div className="p-4 border-b border-gray-100"><TypeForm isGlobal={false} form={form} setForm={setForm} gyms={gyms} selectedGymFilter={selectedGymFilter} editing={editing} setShowGlobalForm={setShowGlobalForm} setShowGymForm={setShowGymForm} handleSubmit={handleSubmit} saving={saving} /></div>}
        {gymTypes.length === 0
          ? <p className="p-4 text-sm text-gray-400 text-center">No gym-specific types for this gym</p>
          : <div className="divide-y divide-gray-100">{gymTypes.map(t => <TypeRow key={t.id} type={t} isGlobal={false} openEdit={openEdit} toggleActive={toggleActive} />)}</div>
        }
      </div>

      <div className="card p-4 bg-blue-50 border-blue-200">
        <p className="text-xs text-blue-700"><strong>Note:</strong> Deactivating removes a type from the sales flow but does not affect existing memberships. Add new types rather than editing active ones mid-period.</p>
      </div>
    </div>
  )
}
