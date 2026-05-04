'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { formatDate } from '@/lib/utils'
import {
  Plus, Edit2, X, Save, CheckCircle, AlertCircle,
  Building2, MapPin, Maximize2, Calendar, ImageIcon, Upload, Power,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const emptyForm = {
  name: '', address: '', size_sqft: '', date_opened: '', is_active: true,
}

export default function GymManagementPage() {
  const [gyms, setGyms] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingGym, setEditingGym] = useState<any | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const showMsg = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000) }

  useEffect(() => { load() }, [])

  const load = async () => {
    // Route guard — Business Ops only
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) { router.replace('/dashboard'); return }
    const { data: me } = await supabase.from('users').select('role').eq('id', authUser.id).single()
    if (!me || me.role !== 'business_ops') { router.replace('/dashboard'); return }

    const { data } = await supabase.from('gyms').select('*').order('name')
    setGyms(data || [])
    setLoading(false)
  }

  const openCreate = () => {
    setEditingGym(null)
    setForm({ ...emptyForm })
    setLogoFile(null)
    setLogoPreview(null)
    setShowForm(true)
    setError('')
  }

  const openEdit = (gym: any) => {
    setEditingGym(gym)
    setForm({
      name: gym.name || '',
      address: gym.address || '',
      size_sqft: gym.size_sqft?.toString() || '',
      date_opened: gym.date_opened || '',
      is_active: gym.is_active ?? true,
    })
    setLogoFile(null)
    setLogoPreview(gym.logo_url ? gym.logo_url + '?t=' + Date.now() : null)
    setShowForm(true)
    setError('')
  }

  const uploadLogo = async (gymId: string, file: File): Promise<string | null> => {
    const path = `gym-${gymId}`
    await supabase.storage.from('gym-logos').remove([path])
    const { error } = await supabase.storage.from('gym-logos').upload(path, file, {
      upsert: true, cacheControl: '0',
    })
    if (error) return null
    const { data } = supabase.storage.from('gym-logos').getPublicUrl(path)
    return data.publicUrl
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Gym name is required'); return }
    setSaving(true); setError('')

    const payload: any = {
      name: form.name.trim(),
      address: form.address.trim() || null,
      size_sqft: form.size_sqft ? parseInt(form.size_sqft) : null,
      date_opened: form.date_opened || null,
      is_active: form.is_active,
    }

    if (editingGym) {
      const { data: updated, error: err } = await supabase.from('gyms')
        .update(payload).eq('id', editingGym.id).select().single()
      if (err) { setError(err.message); setSaving(false); return }
      // Upload logo if a new file was selected
      if (logoFile && updated) {
        const logoUrl = await uploadLogo(updated.id, logoFile)
        if (logoUrl) await supabase.from('gyms').update({ logo_url: logoUrl.split('?')[0] }).eq('id', updated.id)
      }
      showMsg('Gym updated')
    } else {
      const { data: created, error: err } = await supabase.from('gyms')
        .insert({ ...payload, is_active: true }).select().single()
      if (err) { setError(err.message); setSaving(false); return }
      if (logoFile && created) {
        const logoUrl = await uploadLogo(created.id, logoFile)
        if (logoUrl) await supabase.from('gyms').update({ logo_url: logoUrl.split('?')[0] }).eq('id', created.id)
      }
      showMsg('Gym club added')
    }

    await load()
    setShowForm(false)
    setEditingGym(null)
    setForm({ ...emptyForm })
    setLogoFile(null)
    setLogoPreview(null)
    setSaving(false)
  }

  const handleToggleActive = async (gym: any) => {
    const action = gym.is_active ? 'deactivate' : 'activate'
    if (!confirm(`${gym.is_active ? 'Deactivate' : 'Activate'} "${gym.name}"?\n\nStaff assigned to this gym will not be affected.`)) return
    await supabase.from('gyms').update({ is_active: !gym.is_active }).eq('id', gym.id)
    await load()
    showMsg(`"${gym.name}" ${action}d`)
  }

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }))

  const activeGyms = gyms.filter(g => g.is_active)
  const inactiveGyms = gyms.filter(g => !g.is_active)

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600" />
    </div>
  )

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Gym Clubs</h1>
          <p className="text-sm text-gray-500">
            {activeGyms.length} active · {inactiveGyms.length} inactive
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Add Gym Club
        </button>
      </div>

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

          {/* Name */}
          <div>
            <label className="label">Gym Name *</label>
            <input className="input" required value={form.name} onChange={set('name')}
              placeholder="e.g. FitZone Orchard" />
          </div>

          {/* Address */}
          <div>
            <label className="label">Address</label>
            <input className="input" value={form.address} onChange={set('address')}
              placeholder="e.g. 123 Orchard Road, #01-01, Singapore 238858" />
          </div>

          {/* Size + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label flex items-center gap-1.5">
                <Maximize2 className="w-3.5 h-3.5 text-gray-400" /> Size (sq ft)
              </label>
              <input className="input" type="number" min="0" value={form.size_sqft}
                onChange={set('size_sqft')} placeholder="e.g. 3000" />
            </div>
            <div>
              <label className="label flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-gray-400" /> Date Opened
              </label>
              <input className="input" type="date" value={form.date_opened} onChange={set('date_opened')} />
            </div>
          </div>

          {/* Logo */}
          <div>
            <label className="label flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5 text-gray-400" /> Gym Logo
            </label>
            <p className="text-xs text-gray-400 mb-2">
              Shown in the sidebar for staff assigned to this gym. Square image recommended.
            </p>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden bg-gray-50 flex-shrink-0">
                {logoPreview
                  ? <img src={logoPreview} alt="Logo preview" className="w-full h-full object-contain p-1" onError={() => setLogoPreview(null)} />
                  : <ImageIcon className="w-8 h-8 text-gray-300" />
                }
              </div>
              <div>
                <label htmlFor="gym-logo" className="btn-secondary cursor-pointer flex items-center gap-2 text-xs">
                  <Upload className="w-3.5 h-3.5" /> {logoPreview ? 'Change Logo' : 'Upload Logo'}
                </label>
                <input id="gym-logo" type="file" accept="image/*" className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) { setLogoFile(f); setLogoPreview(URL.createObjectURL(f)) }
                  }} />
                <p className="text-xs text-gray-400 mt-1">PNG, JPG or SVG · Transparent background recommended</p>
                {logoPreview && <p className="text-xs text-green-600 mt-1">✓ Logo ready to upload</p>}
              </div>
            </div>
          </div>

          {/* Active toggle (edit only) */}
          {editingGym && (
            <div>
              <label className="label">Status</label>
              <div className="flex gap-2">
                {[true, false].map(val => (
                  <label key={String(val)}
                    className={cn('flex-1 flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors',
                      form.is_active === val ? (val ? 'border-green-500 bg-green-50' : 'border-red-300 bg-red-50') : 'border-gray-200 hover:border-gray-300')}>
                    <input type="radio" checked={form.is_active === val}
                      onChange={() => setForm(f => ({ ...f, is_active: val }))} />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{val ? 'Active' : 'Inactive'}</p>
                      <p className="text-xs text-gray-400">{val ? 'Visible and operational' : 'Hidden from operations — staff unaffected'}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50">
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : editingGym ? 'Save Changes' : 'Add Gym Club'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setEditingGym(null) }}
              className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      {/* Gym list */}
      {gyms.length === 0 ? (
        <div className="card p-8 text-center">
          <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No gym clubs configured yet</p>
          <button onClick={openCreate} className="btn-primary mt-3">Add first gym club</button>
        </div>
      ) : (
        <div className="space-y-3">
          {gyms.map(gym => (
            <div key={gym.id} className={cn('card p-4', !gym.is_active && 'opacity-60')}>
              <div className="flex items-start gap-3">
                {/* Logo or icon */}
                <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden',
                  gym.is_active ? 'bg-red-100' : 'bg-gray-100')}>
                  {gym.logo_url
                    ? <img src={gym.logo_url + '?t=' + Date.now()} alt={gym.name}
                        className="w-full h-full object-contain p-1"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    : <Building2 className={cn('w-6 h-6', gym.is_active ? 'text-red-600' : 'text-gray-400')} />
                  }
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900">{gym.name}</p>
                    <span className={gym.is_active ? 'badge-active' : 'badge-inactive'}>
                      {gym.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  {gym.address && (
                    <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3 flex-shrink-0" /> {gym.address}
                    </p>
                  )}

                  <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-gray-400">
                    {gym.size_sqft && (
                      <span className="flex items-center gap-1">
                        <Maximize2 className="w-3 h-3" /> {gym.size_sqft.toLocaleString()} sq ft
                      </span>
                    )}
                    {gym.date_opened && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> Opened {formatDate(gym.date_opened)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => openEdit(gym)}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Edit">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleToggleActive(gym)}
                    className={cn('p-2 rounded-lg transition-colors',
                      gym.is_active
                        ? 'text-gray-400 hover:text-amber-600 hover:bg-amber-50'
                        : 'text-gray-400 hover:text-green-600 hover:bg-green-50')}
                    title={gym.is_active ? 'Deactivate' : 'Activate'}>
                    <Power className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        Deactivating a gym hides it from operations but does not affect staff assignments, member records, or historical data. Use this when a gym club temporarily or permanently closes.
      </div>
    </div>
  )
}
