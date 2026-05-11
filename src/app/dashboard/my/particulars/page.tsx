'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { formatDate } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { StatusBanner } from '@/components/StatusBanner'
import { validatePhone, validateAddress, validateAll } from '@/lib/validators'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { User, Phone, Shield, Globe, Calendar, MapPin, Save, CheckCircle, AlertCircle } from 'lucide-react'

export default function MyParticularsPage() {
  const { user, loading } = useCurrentUser({ allowedRoles: ['trainer', 'staff', 'manager', 'business_ops'] })


  const { logActivity } = useActivityLog()
  const [form, setForm] = useState({ phone: '', address: '' })
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const { success, error, showMsg, showError, setError } = useToast()


  useEffect(() => {
    const load = async () => {
      logActivity('page_view', 'My Particulars', 'Viewed own profile particulars')
      setForm({ phone: user!.phone || '', address: (user as any).address || '' })
    }
    load()
  }, [])

  if (loading) return <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600" /></div>
  if (!user) return null

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); setError('')
    const err = validateAll([
      validatePhone(form.phone),
      validateAddress(form.address),
    ])
    if (err) { setError(err); return }
    setSaving(true)
    const res = await fetch('/api/staff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user!.id, phone: form.phone, address: form.address || null }),
    })
    const result = await res.json()
    if (!res.ok) { setError(result.error || 'Failed to save'); setSaving(false); return }
    setSaving(false)
    logActivity('update', 'My Particulars', 'Updated personal particulars')
    showMsg('Particulars updated')
  }

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }))

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600" />
    </div>
  )

  return (
    <div className="space-y-5 max-w-lg">
      <div>
        <h1 className="text-xl font-bold text-gray-900">My Particulars</h1>
        <p className="text-sm text-gray-500">View your personal details and update your contact information</p>
      </div>

      <StatusBanner success={success} error={error} />

      {/* Read-only personal details */}
      <div className="card p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Personal Details</p>
        <p className="text-xs text-gray-400 -mt-1">These fields are managed by Business Operations. Contact them to make changes.</p>

        <div className="flex items-start gap-3">
          <User className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs text-gray-400">Full Name</p>
            <p className="text-sm font-medium text-gray-900">{user.full_name}</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Globe className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs text-gray-400">Nationality</p>
            <p className="text-sm text-gray-900">{(user as any).nationality || <span className="italic text-gray-400">Not set</span>}</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Shield className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs text-gray-400">NRIC / FIN / Passport</p>
            <p className="text-sm text-gray-900">{user.nric
              ? user.nric.slice(0, 1) + '•••••' + user.nric.slice(-2)
              : <span className="italic text-gray-400">Not set</span>}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs text-gray-400">Date of Birth</p>
            <p className="text-sm text-gray-900">{user.date_of_birth ? formatDate(user.date_of_birth) : <span className="italic text-gray-400">Not set</span>}</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs text-gray-400">Date of Joining</p>
            <p className="text-sm text-gray-900">{(user as any).date_of_joining ? formatDate((user as any).date_of_joining) : <span className="italic text-gray-400">Not set</span>}</p>
          </div>
        </div>
      </div>

      {/* Editable contact details */}
      <form onSubmit={handleSave} className="card p-4 space-y-4">
        <div>
          <label className="label">Nickname *</label>
          <input className="input" required value={form.nickname}
            onChange={set('nickname')} placeholder="e.g. Alex" />
          <p className="text-xs text-gray-400 mt-1">Used in dashboard greeting and birthday notifications</p>
        </div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Contact Information</p>

        <div>
          <label className="label">Phone Number *</label>
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <input className="input flex-1" required type="tel" value={form.phone}
              onChange={set('phone')} placeholder="+65 9123 4567" />
          </div>
        </div>

        <div>
          <label className="label">Residential Address</label>
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-2.5" />
            <input className="input flex-1" value={form.address}
              onChange={set('address')} placeholder="e.g. 123 Orchard Road, #01-01, Singapore 238858" />
          </div>
        </div>

        <button type="submit" disabled={saving}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  )
}
