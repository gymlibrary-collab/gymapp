'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { PackageTemplate } from '@/types'
import { formatSGD } from '@/lib/utils'
import { Plus, Package, Edit, ToggleLeft, ToggleRight } from 'lucide-react'

export default function PackageTemplatesPage() {
  const [templates, setTemplates] = useState<PackageTemplate[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<PackageTemplate | null>(null)
  const [form, setForm] = useState({ name: '', description: '', total_sessions: '', default_price_sgd: '' })
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const loadTemplates = async () => {
    const { data } = await supabase.from('package_templates').select('*').order('created_at', { ascending: false })
    setTemplates(data || [])
  }

  useEffect(() => { loadTemplates() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()

    const payload = {
      name: form.name,
      description: form.description || null,
      total_sessions: parseInt(form.total_sessions),
      default_price_sgd: parseFloat(form.default_price_sgd),
    }

    if (editing) {
      await supabase.from('package_templates').update(payload).eq('id', editing.id)
    } else {
      await supabase.from('package_templates').insert({ ...payload, created_by: user?.id })
    }

    await loadTemplates()
    setShowForm(false)
    setEditing(null)
    setForm({ name: '', description: '', total_sessions: '', default_price_sgd: '' })
    setLoading(false)
  }

  const handleEdit = (tpl: PackageTemplate) => {
    setEditing(tpl)
    setForm({
      name: tpl.name,
      description: tpl.description || '',
      total_sessions: tpl.total_sessions.toString(),
      default_price_sgd: tpl.default_price_sgd.toString(),
    })
    setShowForm(true)
  }

  const toggleActive = async (tpl: PackageTemplate) => {
    await supabase.from('package_templates').update({ is_active: !tpl.is_active }).eq('id', tpl.id)
    loadTemplates()
  }

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }))

  const pricePerSession = form.total_sessions && form.default_price_sgd
    ? parseFloat(form.default_price_sgd) / parseInt(form.total_sessions)
    : null

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Package Templates</h1>
          <p className="text-sm text-gray-500">Define session packages for trainers to assign to clients</p>
        </div>
        <button onClick={() => { setShowForm(!showForm); setEditing(null); setForm({ name: '', description: '', total_sessions: '', default_price_sgd: '' }) }}
          className="btn-primary flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> New Package
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card p-4 space-y-3 border-green-200">
          <h2 className="font-semibold text-gray-900 text-sm">{editing ? 'Edit Package' : 'New Package Template'}</h2>
          <div>
            <label className="label">Package Name *</label>
            <input className="input" required value={form.name} onChange={set('name')} placeholder="e.g. Gold Pack — 20 Sessions" />
          </div>
          <div>
            <label className="label">Description</label>
            <input className="input" value={form.description} onChange={set('description')} placeholder="Brief description for trainers..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Number of Sessions *</label>
              <input className="input" type="number" required min="1" value={form.total_sessions} onChange={set('total_sessions')} placeholder="e.g. 20" />
            </div>
            <div>
              <label className="label">Default Price (SGD) *</label>
              <input className="input" type="number" required min="0" step="0.01" value={form.default_price_sgd} onChange={set('default_price_sgd')} placeholder="e.g. 1500.00" />
            </div>
          </div>
          {pricePerSession && (
            <p className="text-xs text-green-600 font-medium">
              = {formatSGD(pricePerSession)} per session
            </p>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? 'Saving...' : editing ? 'Update Package' : 'Create Package'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setEditing(null) }} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      {templates.length === 0 ? (
        <div className="card p-8 text-center">
          <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No package templates yet</p>
          <button onClick={() => setShowForm(true)} className="btn-primary mt-3">Create first package</button>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map(tpl => (
            <div key={tpl.id} className={`card p-4 ${!tpl.is_active ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900 text-sm">{tpl.name}</p>
                    <span className={tpl.is_active ? 'badge-active' : 'badge-inactive'}>
                      {tpl.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {tpl.description && <p className="text-xs text-gray-500 mt-0.5">{tpl.description}</p>}
                  <div className="flex items-center gap-3 mt-2 text-sm">
                    <span className="font-bold text-gray-900">{formatSGD(tpl.default_price_sgd)}</span>
                    <span className="text-gray-400">·</span>
                    <span className="text-gray-600">{tpl.total_sessions} sessions</span>
                    <span className="text-gray-400">·</span>
                    <span className="text-green-600 font-medium">{formatSGD(tpl.default_price_sgd / tpl.total_sessions)}/session</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleEdit(tpl)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
                    <Edit className="w-4 h-4" />
                  </button>
                  <button onClick={() => toggleActive(tpl)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
                    {tpl.is_active ? <ToggleRight className="w-4 h-4 text-green-600" /> : <ToggleLeft className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
