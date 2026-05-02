'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { formatDate } from '@/lib/utils'
import {
  Building2, Plus, Edit2, Trash2, X, Save,
  CheckCircle, AlertCircle, MapPin, Calendar, Maximize2
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface GymClub {
  id: string
  name: string
  address?: string
  phone?: string
  date_opened?: string
  size_sqft?: number
  is_active: boolean
  logo_url?: string
  created_at: string
}

const emptyForm = {
  name: '', address: '', phone: '',
  date_opened: '', size_sqft: '',
}

export default function AdminGymsPage() {
  const [gyms, setGyms] = useState<GymClub[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingGym, setEditingGym] = useState<GymClub | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const supabase = createClient()

  const showMsg = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000) }

  useEffect(() => { loadGyms() }, [])

  const loadGyms = async () => {
    const { data } = await supabase.from('gyms').select('*').order('name')
    setGyms(data || [])
    setLoading(false)
  }

  const openCreate = () => {
    setEditingGym(null)
    setForm({ ...emptyForm })
    setShowForm(true)
    setError('')
  }

  const openEdit = (gym: GymClub) => {
    setEditingGym(gym)
    setForm({
      name: gym.name,
      address: gym.address || '',
      phone: gym.phone || '',
      date_opened: gym.date_opened || '',
      size_sqft: gym.size_sqft?.toString() || '',
    })
    setShowForm(true)
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setError('')

    const payload = {
      name: form.name,
      address: form.address || null,
      phone: form.phone || null,
      date_opened: form.date_opened || null,
      size_sqft: form.size_sqft ? parseFloat(form.size_sqft) : null,
    }

    if (editingGym) {
      const { error: err } = await supabase.from('gyms').update(payload).eq('id', editingGym.id)
      if (err) { setError(err.message); setSaving(false); return }
      showMsg('Gym club updated')
    } else {
      const { error: err } = await supabase.from('gyms').insert({ ...payload, is_active: true })
      if (err) { setError(err.message); setSaving(false); return }
      showMsg('Gym club created')
    }

    await loadGyms()
    setShowForm(false)
    setEditingGym(null)
    setForm({ ...emptyForm })
    setSaving(false)
  }

  const handleDelete = async (gym: GymClub) => {
    if (!confirm(`Delete "${gym.name}"? This cannot be undone. Members and sessions linked to this gym will remain.`)) return
    setSaving(true)
    const { error: err } = await supabase.from('gyms').update({ is_active: false }).eq('id', gym.id)
    if (err) { setError(err.message); setSaving(false); return }
    await loadGyms()
    setSaving(false)
    showMsg(`"${gym.name}" deactivated`)
  }

  const handleReactivate = async (gym: GymClub) => {
    await supabase.from('gyms').update({ is_active: true }).eq('id', gym.id)
    await loadGyms()
    showMsg(`"${gym.name}" reactivated`)
  }

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }))

  const activeGyms = gyms.filter(g => g.is_active)
  const inactiveGyms = gyms.filter(g => !g.is_active)

  if (loading) return <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600" /></div>

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Gym Clubs</h1>
          <p className="text-sm text-gray-500">{activeGyms.length} active · {inactiveGyms.length} inactive</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Add Gym Club
        </button>
      </div>

      {/* Banners */}
      {success && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
          <CheckCircle className="w-4 h-4 flex-shrink-0" /> {success}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          <button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Create / Edit form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="card p-4 space-y-4 border-red-200">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 text-sm">
              {editingGym ? `Edit: ${editingGym.name}` : 'New Gym Club'}
            </h2>
            <button type="button" onClick={() => { setShowForm(false); setEditingGym(null) }}>
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          <div>
            <label className="label">Gym Club Name *</label>
            <input className="input" required value={form.name} onChange={set('name')}
              placeholder="e.g. FitZone Orchard" />
          </div>

          <div>
            <label className="label">Address</label>
            <input className="input" value={form.address} onChange={set('address')}
              placeholder="e.g. 391 Orchard Road, #B1-01, Singapore 238872" />
          </div>

          <div>
            <label className="label">Phone</label>
            <input className="input" type="tel" value={form.phone} onChange={set('phone')}
              placeholder="+65 6123 4567" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-gray-400" /> Date Opened
              </label>
              <input className="input" type="date" value={form.date_opened} onChange={set('date_opened')} />
            </div>
            <div>
              <label className="label flex items-center gap-1.5">
                <Maximize2 className="w-3.5 h-3.5 text-gray-400" /> Size (sq ft)
              </label>
              <input className="input" type="number" min="0" step="0.01" value={form.size_sqft}
                onChange={set('size_sqft')} placeholder="e.g. 3500" />
            </div>
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50">
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : editingGym ? 'Save Changes' : 'Create Gym Club'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setEditingGym(null) }}
              className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      {/* Active gyms */}
      {activeGyms.length === 0 ? (
        <div className="card p-8 text-center">
          <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No gym clubs yet</p>
          <button onClick={openCreate} className="btn-primary mt-3">Add your first gym club</button>
        </div>
      ) : (
        <div className="space-y-2">
          {activeGyms.map(gym => (
            <div key={gym.id} className="card p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  {gym.logo_url
                    ? <img src={gym.logo_url} alt={gym.name} className="w-8 h-8 object-contain" />
                    : <Building2 className="w-5 h-5 text-red-600" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm">{gym.name}</p>
                  {gym.address && (
                    <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 flex-shrink-0" />
                      {gym.address}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {gym.phone && <p className="text-xs text-gray-400">{gym.phone}</p>}
                    {gym.date_opened && (
                      <p className="text-xs text-gray-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> Opened {formatDate(gym.date_opened)}
                      </p>
                    )}
                    {gym.size_sqft && (
                      <p className="text-xs text-gray-400 flex items-center gap-1">
                        <Maximize2 className="w-3 h-3" /> {gym.size_sqft.toLocaleString()} sq ft
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => openEdit(gym)}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Edit">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(gym)}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Deactivate">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Inactive gyms */}
      {inactiveGyms.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Inactive Gyms</p>
          {inactiveGyms.map(gym => (
            <div key={gym.id} className="card p-4 opacity-60">
              <div className="flex items-center gap-3">
                <Building2 className="w-5 h-5 text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-600 text-sm">{gym.name}</p>
                  {gym.address && <p className="text-xs text-gray-400">{gym.address}</p>}
                </div>
                <button onClick={() => handleReactivate(gym)}
                  className="btn-secondary text-xs py-1.5">Reactivate</button>
                <button onClick={() => openEdit(gym)}
                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
