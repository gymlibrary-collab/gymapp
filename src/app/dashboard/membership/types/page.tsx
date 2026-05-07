'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { formatSGD } from '@/lib/utils'
import { Plus, Edit2, X, Save, CheckCircle, Layers, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { StatusBanner } from '@/components/StatusBanner'
import { useCurrentUser } from '@/hooks/useCurrentUser'

export default function MembershipTypesPage() {

  const { user, loading } = useCurrentUser({ allowedRoles: ['manager', 'business_ops'] })
  const { logActivity } = useActivityLog()
  const [types, setTypes] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', duration_days: '', duration_months: '', price_sgd: '' })
  const supabase = createClient()
  const router = useRouter()

  const { success, error, showMsg, showError, setError } = useToast()

  useEffect(() => { load() }, [])

  const load = async () => {
    // Route guard — Business Ops only

    const { data } = await supabase.from('membership_types').select('*').order('price_sgd')
    setTypes(data || [])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('')
    const { data: { user } } = await supabase.auth.getUser()
    const payload = { name: form.name, duration_days: parseInt(form.duration_days), duration_months: parseInt(form.duration_months) || null, price_sgd: parseFloat(form.price_sgd), created_by: user?.id }
    let err
    if (editing) {
      const { error: e } = await supabase.from('membership_types').update(payload).eq('id', editing.id); err = e
    } else {
      const { error: e } = await supabase.from('membership_types').insert({ ...payload, is_active: true }); err = e
    }
    if (err) { setError(err.message); setSaving(false); return }
    await load(); setShowForm(false); setEditing(null); setForm({ name: '', duration_days: '', duration_months: '', price_sgd: '' })
    setSaving(false); logActivity('update', 'Membership Types', editing ? 'Updated membership type' : 'Added membership type')
    showMsg(editing ? 'Membership type updated' : 'Membership type added')
  }

  const openEdit = (type: any) => {
    setEditing(type)
    setForm({ name: type.name, duration_days: type.duration_days.toString(), duration_months: (type as any).duration_months?.toString() || '', price_sgd: type.price_sgd.toString() })
    setShowForm(true)
  }

  const toggleActive = async (type: any) => {
    await supabase.from('membership_types').update({ is_active: !type.is_active }).eq('id', type.id)
    await load(); logActivity('update', 'Membership Types', type.is_active ? 'Deactivated membership type' : 'Activated membership type')
    showMsg(type.is_active ? 'Membership type deactivated' : 'Membership type activated')
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900">Membership Types</h1><p className="text-sm text-gray-500">Configure gym membership types and pricing</p></div>
        <button onClick={() => { setShowForm(!showForm); setEditing(null); setForm({ name: '', duration_days: '', duration_months: '', price_sgd: '' }) }} className="btn-primary flex items-center gap-1.5"><Plus className="w-4 h-4" /> Add Type</button>
      </div>

      <StatusBanner success={success} error={error} />

      {showForm && (
        <form onSubmit={handleSubmit} className="card p-4 space-y-4 border-red-200">
          <div className="flex items-center justify-between"><h2 className="font-semibold text-gray-900 text-sm">{editing ? 'Edit Type' : 'New Membership Type'}</h2><button type="button" onClick={() => setShowForm(false)}><X className="w-4 h-4 text-gray-400" /></button></div>
          <div><label className="label">Name *</label><input className="input" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Monthly, Annual, Student" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Duration (days) *</label><input className="input" required type="number" min="1" value={form.duration_days} onChange={e => setForm(f => ({ ...f, duration_days: e.target.value }))} placeholder="e.g. 30, 365" /></div>
            <div>
              <label className="label">Duration (months)</label>
              <input className="input" type="number" min="1" max="36" step="1"
                value={form.duration_months}
                onChange={e => setForm((f: any) => ({ ...f, duration_months: e.target.value }))}
                placeholder="e.g. 1, 12" />
              <p className="text-xs text-gray-400 mt-1">Used for expiry alerts on manager dashboard. Leave blank for trials.</p>
            </div>
            <div><label className="label">Price (SGD) *</label><input className="input" required type="number" min="0" step="0.01" value={form.price_sgd} onChange={e => setForm(f => ({ ...f, price_sgd: e.target.value }))} /></div>
          </div>
          <div className="flex gap-2"><button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2"><Save className="w-4 h-4" />{saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Type'}</button><button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button></div>
        </form>
      )}

      <div className="card">
        <div className="p-4 border-b border-gray-100"><h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2"><Layers className="w-4 h-4 text-red-600" /> Current Types</h2></div>
        {types.length === 0 ? <p className="p-4 text-sm text-gray-400 text-center">No membership types configured</p> : (
          <div className="divide-y divide-gray-100">
            {types.map(type => (
              <div key={type.id} className={cn('flex items-center gap-3 p-4', !type.is_active && 'opacity-60')}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2"><p className="font-medium text-gray-900 text-sm">{type.name}</p><span className={type.is_active ? 'badge-active' : 'badge-inactive'}>{type.is_active ? 'Active' : 'Inactive'}</span></div>
                  <p className="text-xs text-gray-500">{type.duration_days} days · {formatSGD(type.price_sgd)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEdit(type)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => toggleActive(type)} className={cn('text-xs px-2 py-1 rounded-lg', type.is_active ? 'text-gray-500 hover:bg-gray-100' : 'text-green-600 hover:bg-green-50')}>{type.is_active ? 'Deactivate' : 'Activate'}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-4 bg-blue-50 border-blue-200">
        <p className="text-xs text-blue-700"><strong>Note:</strong> Deactivating a type removes it from the sales flow but does not affect existing memberships of that type. Always add new types rather than editing active ones mid-period.</p>
      </div>
    </div>
  )
}
