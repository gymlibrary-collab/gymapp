'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { formatDate, formatDateTime } from '@/lib/utils'
import {
  Plus, Edit2, Trash2, X, Save, CheckCircle,
  AlertCircle, Briefcase, Archive
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { StatusBanner } from '@/components/StatusBanner'
import { validatePhone, validateNric, validateNationality, validateAddress, validateAll } from '@/lib/validators'
import { useCurrentUser } from '@/hooks/useCurrentUser'

interface BizOpsUser {
  id: string
  full_name: string
  email: string
  phone?: string
  is_active: boolean
  is_archived: boolean
  date_of_birth?: string
  date_of_joining?: string
  created_at: string
}

const emptyForm = { full_name: '', email: '', phone: '', date_of_joining: '', nric: '', nationality: '', date_of_birth: '', leave_entitlement_days: '', address: '' }

export default function AdminStaffPage() {

  const { user, loading } = useCurrentUser({ allowedRoles: ['admin'] })
  const { logActivity } = useActivityLog()
  const [staff, setStaff] = useState<BizOpsUser[]>([])
  const [archived, setArchived] = useState<BizOpsUser[]>([])
  const [tab, setTab] = useState<'active' | 'archived'>('active')
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingUser, setEditingUser] = useState<BizOpsUser | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const router = useRouter()
  const supabase = createClient()

  const { success, error, showMsg, showError, setError } = useToast()


  const loadData = async () => {
    logActivity('page_view', 'Business Ops Staff', 'Viewed Business Ops staff')

    const { data: active } = await supabase.from('users').select('*')
      .eq('role', 'business_ops').eq('is_archived', false).order('full_name')
    const { data: arch } = await supabase.from('users').select('*')
      .eq('role', 'business_ops').eq('is_archived', true).order('full_name')
    setStaff(active || [])
    setArchived(arch || [])
  }

  useEffect(() => { loadData() }, [])


  const openCreate = () => {
    setEditingUser(null)
    setForm({ ...emptyForm })
    setShowForm(true)
    setError('')
  }

  const openEdit = (user: BizOpsUser) => {
    setEditingUser(user)
    setForm({
      full_name: user.full_name,
      email: user.email,
      phone: user.phone || '',
      date_of_joining: user.date_of_joining || '',
      nric: (user as any).nric || '',
      nationality: (user as any).nationality || '',
      date_of_birth: (user as any).date_of_birth || '',
      leave_entitlement_days: (user as any).leave_entitlement_days?.toString() || '',
      address: (user as any).address || '',
    })
    setShowForm(true)
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('')
    const err = validateAll([
      validatePhone(form.phone),
      validateNric((form as any).nric),
      validateNationality((form as any).nationality),
      validateAddress((form as any).address),
    ])
    if (err) { setError(err); return }
    setSaving(true)

    if (editingUser) {
      // Update via trainers API (handles auth email update too)
      const res = await fetch('/api/trainers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: editingUser.id,
          full_name: form.full_name,
          email: form.email,
          phone: form.phone,
          date_of_joining: form.date_of_joining,
          nric: (form as any).nric || null,
          nationality: (form as any).nationality || null,
          date_of_birth: (form as any).date_of_birth || null,
          leave_entitlement_days: (form as any).leave_entitlement_days || null,
          address: (form as any).address || null,
        }),
      })
      const result = await res.json()
      if (!res.ok) { setError(result.error || 'Failed to update'); setSaving(false); return }
      logActivity('update', 'Business Ops Staff', 'Updated Business Ops staff account')
    showMsg('Account updated')
    } else {
      const res = await fetch('/api/trainers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, role: 'business_ops' }),
      })
      const result = await res.json()
      if (!res.ok) { setError(result.error || 'Failed to create'); setSaving(false); return }
      logActivity('create', 'Business Ops Staff', 'Created Business Ops staff account')
    showMsg('Business Ops account created')
    }

    await loadData()
    setShowForm(false)
    setEditingUser(null)
    setForm({ ...emptyForm })
    setSaving(false)
  }

  const handleDelete = async (user: BizOpsUser) => {
    if (!confirm(`Archive ${user!.full_name}? Their account will be disabled.`)) return
    setSaving(true)
    const res = await fetch('/api/trainers', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user!.id }),
    })
    const result = await res.json()
    if (!res.ok) { setError(result.error || 'Failed'); setSaving(false); return }
    await loadData(); setSaving(false)
    logActivity('update', 'Business Ops Staff', 'Archived Business Ops staff account')
    showMsg(`${user!.full_name} archived`)
  }

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }))


  const list = tab === 'active' ? staff : archived

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Business Ops Accounts</h1>
          <p className="text-sm text-gray-500">{staff.length} active · {archived.length} archived</p>
        </div>
        {tab === 'active' && (
          <button onClick={openCreate} className="btn-primary flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Add Account
          </button>
        )}
      </div>

      <StatusBanner success={success} error={error} onDismissError={() => setError('')} />

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        <button onClick={() => setTab('active')}
          className={cn('flex-1 py-1.5 rounded-md text-xs font-medium transition-colors',
            tab === 'active' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600')}>
          Active ({staff.length})
        </button>
        <button onClick={() => setTab('archived')}
          className={cn('flex-1 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-1.5',
            tab === 'archived' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600')}>
          <Archive className="w-3.5 h-3.5" /> Archived ({archived.length})
        </button>
      </div>

      {/* Form */}
      {showForm && tab === 'active' && (
        <form onSubmit={handleSubmit} className="card p-4 space-y-4 border-red-200">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 text-sm">
              {editingUser ? `Edit: ${editingUser.full_name}` : 'New Business Ops Account'}
            </h2>
            <button type="button" onClick={() => { setShowForm(false); setEditingUser(null) }}>
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Full Name *</label>
              <input className="input" required value={form.full_name} onChange={set('full_name')}
                placeholder="e.g. Jane Lim" />
            </div>
            <div>
              <label className="label">Email *</label>
              <input className="input" required type="email" value={form.email} onChange={set('email')}
                placeholder="jane@company.com" />
              {editingUser && <p className="text-xs text-gray-400 mt-1">Changing email updates their Google login</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Phone *</label>
              <input className="input" required type="tel" value={form.phone} onChange={set('phone')}
                placeholder="+65 9123 4567" />
            </div>
            <div>
              <label className="label">Date of Joining</label>
              <input className="input" type="date" value={form.date_of_joining}
                onChange={set('date_of_joining')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">NRIC / FIN / Passport</label>
              <input className="input" value={(form as any).nric} onChange={e => setForm((f: any) => ({ ...f, nric: e.target.value.toUpperCase() }))} placeholder="e.g. S1234567A" />
            </div>
            <div>
              <label className="label">Nationality</label>
              <input className="input" value={(form as any).nationality} onChange={set('nationality')} placeholder="e.g. Singaporean" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date of Birth</label>
              <input className="input" type="date" value={(form as any).date_of_birth} onChange={set('date_of_birth')} />
            </div>
            <div>
              <label className="label">Annual Leave Entitlement (days)</label>
              <input className="input" type="number" min="0" max="365" value={(form as any).leave_entitlement_days} onChange={set('leave_entitlement_days')} placeholder="e.g. 14" />
            </div>
          </div>

          <div>
            <label className="label">Residential Address</label>
            <input className="input" value={(form as any).address} onChange={set('address')}
              placeholder="e.g. 123 Orchard Road, #01-01, Singapore 238858" />
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
            Business Ops accounts have access to staff management, gym clubs configuration, payroll, reports and CPF configuration.
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50">
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : editingUser ? 'Save Changes' : 'Create Account'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setEditingUser(null) }}
              className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      {/* List */}
      {list.length === 0 ? (
        <div className="card p-8 text-center">
          <Briefcase className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">
            {tab === 'active' ? 'No Business Ops accounts yet' : 'No archived accounts'}
          </p>
          {tab === 'active' && (
            <button onClick={openCreate} className="btn-primary mt-3">Add first account</button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {list.map(user => (
            <div key={user.id}
              className={cn('card p-4', tab === 'archived' && 'opacity-70 border-l-4 border-l-red-200')}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-purple-700 font-semibold text-sm">{user.full_name.charAt(0)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900 text-sm">{user.full_name}</p>
                    <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full font-medium">
                      Business Ops
                    </span>
                    <span className={user.is_active ? 'badge-active' : 'badge-inactive'}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">{user.email}</p>
                  {user.phone && <p className="text-xs text-gray-400">{user.phone}</p>}
                  {user.date_of_joining && (
                    <p className="text-xs text-gray-400 mt-0.5">Joined: {formatDate(user.date_of_joining)}</p>
                  )}
                </div>
                {tab === 'active' && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => openEdit(user)}
                      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(user)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
