'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Gym, User } from '@/types'
import { Upload, Save, Building2, CheckCircle, Plus, ImageIcon, Timer } from 'lucide-react'

interface GymWithManager extends Gym {
  manager?: User
}

export default function SettingsPage() {
  const [gyms, setGyms] = useState<GymWithManager[]>([])
  const [managers, setManagers] = useState<User[]>([])
  const [selectedGym, setSelectedGym] = useState<GymWithManager | null>(null)
  const [gymForm, setGymForm] = useState({ name: '', address: '', phone: '', manager_id: '' })
  const [gymLogoFile, setGymLogoFile] = useState<File | null>(null)
  const [gymLogoPreview, setGymLogoPreview] = useState<string | null>(null)

  // Global app logos
  const [loginLogoFile, setLoginLogoFile] = useState<File | null>(null)
  const [loginLogoPreview, setLoginLogoPreview] = useState<string | null>(null)
  const [sidebarLogoFile, setSidebarLogoFile] = useState<File | null>(null)
  const [sidebarLogoPreview, setSidebarLogoPreview] = useState<string | null>(null)

  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newGymName, setNewGymName] = useState('')
  const [commissionForm, setCommissionForm] = useState({ signup_pct: '10', session_pct: '15' })
  const [autoLogoutMinutes, setAutoLogoutMinutes] = useState('10')
  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    const { data: gymData } = await supabase.from('gyms').select('*').order('name')
    const { data: managerData } = await supabase.from('users').select('*')
      .eq('role', 'manager').eq('is_active', true).order('full_name')
    const { data: settings } = await supabase.from('app_settings').select('*').eq('id', 'global').single()

    setManagers(managerData || [])
    const enriched = (gymData || []).map(gym => ({
      ...gym,
      manager: managerData?.find(m => m.manager_gym_id === gym.id),
    }))
    setGyms(enriched)
    if (enriched.length > 0 && !selectedGym) selectGym(enriched[0])

    if (settings) {
      setLoginLogoPreview(settings.login_logo_url || null)
      setSidebarLogoPreview(settings.admin_sidebar_logo_url || null)
      setAutoLogoutMinutes(settings.auto_logout_minutes?.toString() || '10')
    }
  }

  const selectGym = (gym: GymWithManager) => {
    setSelectedGym(gym)
    setGymForm({
      name: gym.name,
      address: gym.address || '',
      phone: gym.phone || '',
      manager_id: gym.manager?.id || '',
    })
    setGymLogoPreview(gym.logo_url || null)
    setGymLogoFile(null)
    setSaved(null)
  }

  const uploadLogo = async (file: File, bucket: string, path: string): Promise<string | null> => {
    const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true })
    if (error) return null
    const { data } = supabase.storage.from(bucket).getPublicUrl(path)
    return data.publicUrl + '?t=' + Date.now()
  }

  const handleSaveGlobalLogos = async () => {
    setSaving('logos')
    const updates: any = { updated_at: new Date().toISOString() }

    if (loginLogoFile) {
      const url = await uploadLogo(loginLogoFile, 'app-logos', 'login-logo')
      if (url) { updates.login_logo_url = url; setLoginLogoPreview(url) }
    }
    if (sidebarLogoFile) {
      const url = await uploadLogo(sidebarLogoFile, 'app-logos', 'admin-sidebar-logo')
      if (url) { updates.admin_sidebar_logo_url = url; setSidebarLogoPreview(url) }
    }

    await supabase.from('app_settings').upsert({ id: 'global', ...updates })
    setSaving(null)
    setSaved('logos')
    setTimeout(() => setSaved(null), 3000)
  }

  const handleSaveGym = async () => {
    if (!selectedGym) return
    setSaving('gym')

    let logo_url = selectedGym.logo_url
    if (gymLogoFile) {
      const url = await uploadLogo(gymLogoFile, 'gym-logos', `${selectedGym.id}/logo`)
      if (url) logo_url = url
    }

    await supabase.from('gyms').update({
      name: gymForm.name,
      address: gymForm.address || null,
      phone: gymForm.phone || null,
      logo_url,
    }).eq('id', selectedGym.id)

    // Update manager assignment
    if (selectedGym.manager && selectedGym.manager.id !== gymForm.manager_id) {
      await supabase.from('users').update({ manager_gym_id: null }).eq('id', selectedGym.manager.id)
    }
    if (gymForm.manager_id) {
      await supabase.from('users').update({ manager_gym_id: selectedGym.id }).eq('id', gymForm.manager_id)
    }

    await loadData()
    setSaving(null)
    setSaved('gym')
    setTimeout(() => setSaved(null), 3000)
  }

  const handleAddGym = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newGymName.trim()) return
    await supabase.from('gyms').insert({ name: newGymName.trim() })
    setNewGymName('')
    setShowAddForm(false)
    loadData()
  }

  const handleToggleActive = async (gym: GymWithManager) => {
    await supabase.from('gyms').update({ is_active: !gym.is_active }).eq('id', gym.id)
    loadData()
  }

  const handleSaveCommission = async () => {
    setSaving('commission')
    await supabase.from('users').update({
      commission_signup_pct: parseFloat(commissionForm.signup_pct),
      commission_session_pct: parseFloat(commissionForm.session_pct),
    }).eq('role', 'trainer')
    setSaving(null)
    setSaved('commission')
    setTimeout(() => setSaved(null), 3000)
  }

  const handleSaveAutoLogout = async () => {
    setSaving('logout')
    const mins = parseInt(autoLogoutMinutes)
    if (isNaN(mins) || mins < 1) return
    await supabase.from('app_settings').upsert({
      id: 'global',
      auto_logout_minutes: mins,
      updated_at: new Date().toISOString(),
    })
    setSaving(null)
    setSaved('logout')
    setTimeout(() => setSaved(null), 3000)
  }

  const LogoUploadBox = ({
    label, description, preview, onChange, id,
  }: {
    label: string; description: string; preview: string | null
    onChange: (f: File) => void; id: string
  }) => (
    <div className="space-y-2">
      <label className="label">{label}</label>
      <p className="text-xs text-gray-400 -mt-1">{description}</p>
      <div className="flex items-center gap-4">
        <div className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden bg-gray-50 flex-shrink-0">
          {preview
            ? <img src={preview} alt={label} className="w-full h-full object-contain p-1" />
            : <ImageIcon className="w-8 h-8 text-gray-300" />
          }
        </div>
        <div>
          <label htmlFor={id} className="btn-secondary cursor-pointer flex items-center gap-2 text-xs">
            <Upload className="w-3.5 h-3.5" /> Upload Image
          </label>
          <input id={id} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onChange(f) }} />
          <p className="text-xs text-gray-400 mt-1">PNG, JPG or SVG. Recommended: transparent background.</p>
        </div>
      </div>
    </div>
  )

  const availableManagers = managers.filter(m =>
    !m.manager_gym_id || m.manager_gym_id === selectedGym?.id
  )

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500">Logos, gym clubs and commission rates</p>
      </div>

      {/* ── GLOBAL LOGOS ── */}
      <div className="card p-4 space-y-5">
        <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-green-600" /> Global Logo Settings
        </h2>

        <LogoUploadBox
          id="login-logo"
          label="Login Page Logo"
          description="Shown on the login screen for all gym clubs"
          preview={loginLogoPreview}
          onChange={f => { setLoginLogoFile(f); setLoginLogoPreview(URL.createObjectURL(f)) }}
        />

        <LogoUploadBox
          id="sidebar-logo"
          label="Admin Sidebar Logo"
          description="Shown in the left panel when an admin is logged in"
          preview={sidebarLogoPreview}
          onChange={f => { setSidebarLogoFile(f); setSidebarLogoPreview(URL.createObjectURL(f)) }}
        />

        <button onClick={handleSaveGlobalLogos} disabled={saving === 'logos'} className="btn-primary flex items-center gap-2">
          {saved === 'logos'
            ? <><CheckCircle className="w-4 h-4" /> Saved!</>
            : <><Save className="w-4 h-4" /> {saving === 'logos' ? 'Saving...' : 'Save Global Logos'}</>
          }
        </button>
      </div>

      {/* ── GYM CLUBS ── */}
      <div className="card">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
            <Building2 className="w-4 h-4 text-green-600" /> Gym Clubs
          </h2>
          <button onClick={() => setShowAddForm(!showAddForm)}
            className="btn-primary flex items-center gap-1.5 text-xs py-1.5">
            <Plus className="w-3.5 h-3.5" /> Add Gym
          </button>
        </div>

        {showAddForm && (
          <form onSubmit={handleAddGym} className="p-4 border-b border-gray-100 bg-green-50 flex gap-2">
            <input className="input flex-1" placeholder="New gym name..."
              value={newGymName} onChange={e => setNewGymName(e.target.value)} required />
            <button type="submit" className="btn-primary">Add</button>
            <button type="button" onClick={() => setShowAddForm(false)} className="btn-secondary">Cancel</button>
          </form>
        )}

        {/* Gym tabs */}
        <div className="p-3 flex gap-2 flex-wrap border-b border-gray-100">
          {gyms.map(g => (
            <button key={g.id} onClick={() => selectGym(g)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedGym?.id === g.id ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              } ${!g.is_active ? 'opacity-50' : ''}`}>
              {g.name}{!g.is_active ? ' (Inactive)' : ''}
            </button>
          ))}
        </div>

        {selectedGym && (
          <div className="p-4 space-y-4">
            {/* Gym club logo */}
            <LogoUploadBox
              id="gym-logo"
              label="Gym Club Logo"
              description={`Shown in the sidebar for ${selectedGym.name} managers and trainers`}
              preview={gymLogoPreview}
              onChange={f => { setGymLogoFile(f); setGymLogoPreview(URL.createObjectURL(f)) }}
            />

            <div>
              <label className="label">Gym Name *</label>
              <input className="input" required value={gymForm.name}
                onChange={e => setGymForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="label">Address</label>
              <input className="input" value={gymForm.address}
                onChange={e => setGymForm(f => ({ ...f, address: e.target.value }))}
                placeholder="e.g. 391 Orchard Road, #B1-01, Singapore 238872" />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" value={gymForm.phone}
                onChange={e => setGymForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="+65 6123 4567" />
            </div>
            <div>
              <label className="label">Assigned Manager</label>
              <select className="input" value={gymForm.manager_id}
                onChange={e => setGymForm(f => ({ ...f, manager_id: e.target.value }))}>
                <option value="">— No manager assigned —</option>
                {availableManagers.map(m => (
                  <option key={m.id} value={m.id}>{m.full_name} ({m.email})</option>
                ))}
              </select>
              {selectedGym.manager && (
                <p className="text-xs text-green-600 mt-1">Currently: {selectedGym.manager.full_name}</p>
              )}
              {managers.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">⚠ No manager accounts yet. Create one in Staff Management.</p>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={handleSaveGym} disabled={saving === 'gym'} className="btn-primary flex items-center gap-2 flex-1">
                {saved === 'gym'
                  ? <><CheckCircle className="w-4 h-4" /> Saved!</>
                  : <><Save className="w-4 h-4" /> {saving === 'gym' ? 'Saving...' : 'Save Gym Settings'}</>
                }
              </button>
              <button onClick={() => handleToggleActive(selectedGym)} className="btn-secondary text-xs">
                {selectedGym.is_active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── AUTO LOGOUT ── */}
      <div className="card p-4 space-y-4">
        <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
          <Timer className="w-4 h-4 text-green-600" /> Auto Logout Timer
        </h2>
        <p className="text-xs text-gray-500">
          Automatically logs out all users after the specified period of inactivity. Applies to all roles across all gym clubs.
        </p>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="label">Inactivity timeout (minutes)</label>
            <select
              className="input"
              value={autoLogoutMinutes}
              onChange={e => setAutoLogoutMinutes(e.target.value)}
            >
              <option value="5">5 minutes</option>
              <option value="10">10 minutes</option>
              <option value="15">15 minutes</option>
              <option value="20">20 minutes</option>
              <option value="30">30 minutes</option>
              <option value="45">45 minutes</option>
              <option value="60">60 minutes</option>
              <option value="120">2 hours</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Currently set to: <span className="font-medium text-gray-600">{autoLogoutMinutes} minutes</span>
            </p>
          </div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
          ⚠ Changing this setting takes effect immediately for all active sessions on next page interaction.
        </div>
        <button onClick={handleSaveAutoLogout} disabled={saving === 'logout'} className="btn-primary flex items-center gap-2">
          {saved === 'logout'
            ? <><CheckCircle className="w-4 h-4" /> Saved!</>
            : <><Save className="w-4 h-4" /> {saving === 'logout' ? 'Saving...' : 'Save Auto Logout Setting'}</>
          }
        </button>
      </div>

      {/* ── COMMISSION RATES ── */}
      <div className="card p-4 space-y-4">
        <h2 className="font-semibold text-gray-900 text-sm">Default Commission Rates</h2>
        <p className="text-xs text-gray-500">Applied to all trainers. Override individually in Staff Management.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Sign-up Commission %</label>
            <input className="input" type="number" min="0" max="100" step="0.5"
              value={commissionForm.signup_pct}
              onChange={e => setCommissionForm(f => ({ ...f, signup_pct: e.target.value }))} />
            <p className="text-xs text-gray-400 mt-1">% of total package price</p>
          </div>
          <div>
            <label className="label">Per-Session Commission %</label>
            <input className="input" type="number" min="0" max="100" step="0.5"
              value={commissionForm.session_pct}
              onChange={e => setCommissionForm(f => ({ ...f, session_pct: e.target.value }))} />
            <p className="text-xs text-gray-400 mt-1">% of session price</p>
          </div>
        </div>
        <button onClick={handleSaveCommission} disabled={saving === 'commission'} className="btn-primary flex items-center gap-2">
          {saved === 'commission'
            ? <><CheckCircle className="w-4 h-4" /> Saved!</>
            : <><Save className="w-4 h-4" /> {saving === 'commission' ? 'Saving...' : 'Save Commission Rates'}</>
          }
        </button>
      </div>
    </div>
  )
}
