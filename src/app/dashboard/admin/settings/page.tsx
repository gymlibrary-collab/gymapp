'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { Upload, Save, CheckCircle, ImageIcon, Timer, Type } from 'lucide-react'
import { uploadToStorage } from '@/lib/utils'

export default function AdminSettingsPage() {
  const [appName, setAppName] = useState('GymApp')
  const [loginLogoFile, setLoginLogoFile] = useState<File | null>(null)
  const [loginLogoPreview, setLoginLogoPreview] = useState<string | null>(null)
  const [sidebarLogoFile, setSidebarLogoFile] = useState<File | null>(null)
  const [sidebarLogoPreview, setSidebarLogoPreview] = useState<string | null>(null)
  const [autoLogoutMinutes, setAutoLogoutMinutes] = useState('10')
  const [companyName, setCompanyName] = useState('Gym Operations Suite')
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
    // Route guard
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) { router.replace('/dashboard'); return }
    const { data: me } = await supabase.from('users').select('role').eq('id', authUser.id).single()
    if (!me || (me.role !== 'admin')) { router.replace('/dashboard'); return }

      const { data } = await supabase.from('app_settings')
        .select('login_logo_url, admin_sidebar_logo_url, auto_logout_minutes, app_name')
        .eq('id', 'global').single()
      if (data) {
        setAppName(data.app_name || 'GymApp')
        setAutoLogoutMinutes(data.auto_logout_minutes?.toString() || '10')
        if (data.login_logo_url) setLoginLogoPreview(data.login_logo_url + '?t=' + Date.now())
        if (data.admin_sidebar_logo_url) setSidebarLogoPreview(data.admin_sidebar_logo_url + '?t=' + Date.now())
        if ((data as any).company_name) setCompanyName((data as any).company_name)
      }
    }
    load()
  }, [])


  const handleSaveBranding = async () => {
    setSaving('branding')
    const updates: any = { id: 'global', app_name: appName, updated_at: new Date().toISOString() }
    if (loginLogoFile) {
      const url = await uploadToStorage(supabase, loginLogoFile, 'app-logos', 'login-logo')
      if (url) { updates.login_logo_url = url.split('?')[0]; setLoginLogoPreview(url) }
    }
    if (sidebarLogoFile) {
      const url = await uploadToStorage(supabase, sidebarLogoFile, 'app-logos', 'admin-sidebar-logo')
      if (url) { updates.admin_sidebar_logo_url = url.split('?')[0]; setSidebarLogoPreview(url) }
    }
    updates.company_name = companyName
    await supabase.from('app_settings').upsert(updates)
    setSaving(null); setSaved('branding'); setTimeout(() => setSaved(null), 3000)
  }

  const handleSaveLogout = async () => {
    setSaving('logout')
    await supabase.from('app_settings').upsert({
      id: 'global', auto_logout_minutes: parseInt(autoLogoutMinutes), updated_at: new Date().toISOString(),
    })
    setSaving(null); setSaved('logout'); setTimeout(() => setSaved(null), 3000)
  }

  const LogoBox = ({ label, desc, preview, onChange, id }: {
    label: string; desc: string; preview: string | null
    onChange: (f: File) => void; id: string
  }) => (
    <div className="space-y-2">
      <label className="label">{label}</label>
      <p className="text-xs text-gray-400 -mt-1">{desc}</p>
      <div className="flex items-center gap-4">
        <div className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden bg-gray-50 flex-shrink-0">
          {preview ? <img src={preview} alt={label} className="w-full h-full object-contain p-1" onError={() => {}} />
            : <ImageIcon className="w-8 h-8 text-gray-300" />}
        </div>
        <div>
          <label htmlFor={id} className="btn-secondary cursor-pointer flex items-center gap-2 text-xs">
            <Upload className="w-3.5 h-3.5" /> Upload Image
          </label>
          <input id={id} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onChange(f) }} />
          <p className="text-xs text-gray-400 mt-1">PNG, JPG or SVG · Transparent background recommended · Max 2MB</p>
          {preview && <p className="text-xs text-green-600 mt-1">✓ Image loaded</p>}
        </div>
      </div>
    </div>
  )

  const SaveBtn = ({ k, label, onSave }: { k: string; label: string; onSave: () => void }) => (
    <button onClick={onSave} disabled={saving === k} className="btn-primary flex items-center gap-2">
      {saved === k ? <><CheckCircle className="w-4 h-4" /> Saved!</> : <><Save className="w-4 h-4" /> {saving === k ? 'Saving...' : label}</>}
    </button>
  )

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">App Settings</h1>
        <p className="text-sm text-gray-500">Branding, logos and system configuration</p>
      </div>

      {/* Branding */}
      <div className="card p-4 space-y-5">
        <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-red-600" /> App Branding
        </h2>
        <div>
          <label className="label flex items-center gap-1.5">
            <Type className="w-3.5 h-3.5 text-gray-400" /> App Name
          </label>
          <input className="input" value={appName} onChange={e => setAppName(e.target.value)}
            placeholder="e.g. GymApp" maxLength={40} />
          <p className="text-xs text-gray-400 mt-1">Shown on the login page and browser tab</p>
        </div>
        <LogoBox id="login-logo" label="Login Page Logo" desc="Shown on the login screen for all gym clubs"
          preview={loginLogoPreview}
          onChange={f => { setLoginLogoFile(f); setLoginLogoPreview(URL.createObjectURL(f)) }} />
        <LogoBox id="sidebar-logo" label="Admin Sidebar Logo" desc="Shown in the left panel when an admin is logged in"
          preview={sidebarLogoPreview}
          onChange={f => { setSidebarLogoFile(f); setSidebarLogoPreview(URL.createObjectURL(f)) }} />

        <SaveBtn k="branding" label="Save App Branding" onSave={handleSaveBranding} />
      </div>

      {/* Auto logout */}
      <div className="card p-4 space-y-4">
        <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
          <Timer className="w-4 h-4 text-red-600" /> Auto Logout Timer
        </h2>
        <p className="text-xs text-gray-500">Automatically logs out all users after inactivity. Applies to all roles.</p>
        <div>
          <label className="label">Inactivity timeout</label>
          <select className="input" value={autoLogoutMinutes} onChange={e => setAutoLogoutMinutes(e.target.value)}>
            <option value="5">5 minutes</option>
            <option value="10">10 minutes</option>
            <option value="15">15 minutes</option>
            <option value="20">20 minutes</option>
            <option value="30">30 minutes</option>
            <option value="45">45 minutes</option>
            <option value="60">60 minutes</option>
            <option value="120">2 hours</option>
          </select>
        </div>
        <SaveBtn k="logout" label="Save Auto Logout" onSave={handleSaveLogout} />
      </div>
    </div>
  )
}
