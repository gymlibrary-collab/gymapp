'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { formatDate, formatSGD } from '@/lib/utils'
import {
  Plus, Edit2, Archive, X, Save, CheckCircle,
  AlertCircle, Package, Calendar, Hash, DollarSign
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { StatusBanner } from '@/components/StatusBanner'
import { useCurrentUser } from '@/hooks/useCurrentUser'

interface PackageTemplate {
  id: string
  name: string
  total_sessions: number
  default_price_sgd: number
  validity_months?: number
  effective_from: string
  is_active: boolean
  is_archived: boolean
  archived_at?: string
  created_at: string
}

const emptyForm = {
  name: '', total_sessions: '', default_price_sgd: '', effective_from: '', validity_months: '3',
}

export default function PackagesPage() {

  const { user, loading } = useCurrentUser({ allowedRoles: ['manager', 'business_ops', 'trainer', 'staff'] })
  const { logActivity } = useActivityLog()
  const [packages, setPackages] = useState<PackageTemplate[]>([])
  const [archived, setArchived] = useState<PackageTemplate[]>([])
  const [tab, setTab] = useState<'active' | 'archived'>('active')
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingPkg, setEditingPkg] = useState<PackageTemplate | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const supabase = createClient()
  const router = useRouter()

  const { success, error, showMsg, showError, setError } = useToast()


  const loadPackages = async () => {
    logActivity('page_view', 'PT Package Templates', 'Viewed pt package templates')

    const { data: active } = await supabase.from('package_templates')
      .select('*').eq('is_archived', false).order('effective_from', { ascending: false })
    const { data: arch } = await supabase.from('package_templates')
      .select('*').eq('is_archived', true).order('archived_at', { ascending: false })
    setPackages(active || [])
    setArchived(arch || [])
  }

  useEffect(() => { loadPackages() }, [])


  const pricePerSession = (sessions: string, price: string) => {
    const s = parseFloat(sessions)
    const p = parseFloat(price)
    if (!s || !p || s === 0) return null
    return p / s
  }

  const openCreate = () => {
    setEditingPkg(null)
    setForm({ ...emptyForm, effective_from: new Date().toISOString().split('T')[0] })
    setShowForm(true)
    setError('')
  }

  const openEdit = (pkg: PackageTemplate) => {
    setEditingPkg(pkg)
    setForm({
      name: pkg.name,
      total_sessions: pkg.total_sessions.toString(),
      default_price_sgd: pkg.default_price_sgd.toString(),
      validity_months: pkg.validity_months?.toString() || '3',
      effective_from: pkg.effective_from || '',
    })
    setShowForm(true)
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setError('')

    const payload = {
      name: form.name,
      total_sessions: parseInt(form.total_sessions),
      default_price_sgd: parseFloat(form.default_price_sgd),
      validity_months: parseInt((form as any).validity_months) || 3,
      effective_from: form.effective_from,
      is_active: true,
      is_archived: false,
    }

    if (editingPkg) {
      const { error: err } = await supabase.from('package_templates')
        .update(payload).eq('id', editingPkg.id)
      if (err) { setError(err.message); setSaving(false); return }
      logActivity('update', 'PT Package Templates', 'Updated PT package template')
    showMsg('Package updated')
    } else {
      const { error: err } = await supabase.from('package_templates').insert(payload)
      if (err) { setError(err.message); setSaving(false); return }
      logActivity('create', 'PT Package Templates', 'Created PT package template')
    showMsg('Package created')
    }

    await loadPackages()
    setShowForm(false)
    setEditingPkg(null)
    setForm({ ...emptyForm })
    setSaving(false)
  }

  const handleArchive = async (pkg: PackageTemplate) => {
    if (!confirm(`Archive "${pkg.name}"?\n\nExisting members with this package will not be affected — their sessions continue normally.`)) return
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('package_templates').update({
      is_archived: true,
      is_active: false,
      archived_at: new Date().toISOString(),
      archived_by: user?.id,
    }).eq('id', pkg.id)
    await loadPackages()
    logActivity('update', 'PT Package Templates', 'Archived PT package template')
    showMsg(`"${pkg.name}" archived — existing member packages unaffected`)
  }

  const handleUnarchive = async (pkg: PackageTemplate) => {
    await supabase.from('package_templates').update({
      is_archived: false, is_active: true,
      archived_at: null, archived_by: null,
    }).eq('id', pkg.id)
    await loadPackages()
    showMsg(`"${pkg.name}" restored`)
  }

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }))

  const pps = pricePerSession(form.total_sessions, form.default_price_sgd)
  const list = tab === 'active' ? packages : archived


  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">PT Packages</h1>
          <p className="text-sm text-gray-500">{packages.length} active · {archived.length} archived</p>
        </div>
        {tab === 'active' && (
          <button onClick={openCreate} className="btn-primary flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Add Package
          </button>
        )}
      </div>

      {/* Banners */}
      <StatusBanner success={success} error={error} onDismissError={() => setError('')} />

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        <button onClick={() => setTab('active')}
          className={cn('flex-1 py-1.5 rounded-md text-xs font-medium transition-colors',
            tab === 'active' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600')}>
          Active ({packages.length})
        </button>
        <button onClick={() => setTab('archived')}
          className={cn('flex-1 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-1.5',
            tab === 'archived' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600')}>
          <Archive className="w-3.5 h-3.5" /> Archived ({archived.length})
        </button>
      </div>

      {/* Info note */}
      {tab === 'archived' && archived.length > 0 && (
        <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          Archived packages are kept for historical reference only. Members already on these packages are unaffected.
        </div>
      )}

      {/* Create / Edit form */}
      {showForm && tab === 'active' && (
        <form onSubmit={handleSubmit} className="card p-4 space-y-4 border-red-200">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 text-sm">
              {editingPkg ? `Edit: ${editingPkg.name}` : 'New PT Package'}
            </h2>
            <button type="button" onClick={() => { setShowForm(false); setEditingPkg(null) }}>
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          <div>
            <label className="label">Package Name *</label>
            <input className="input" required value={form.name} onChange={set('name')}
              placeholder="e.g. Starter Pack — 10 Sessions" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5 text-gray-400" /> Number of Sessions *
              </label>
              <input className="input" required type="number" min="1" step="1"
                value={form.total_sessions} onChange={set('total_sessions')}
                placeholder="e.g. 10" />
            </div>
            <div>
              <label className="label">Validity Period (months) *</label>
              <input className="input" type="number" min="1" max="36" step="1" required
                value={(form as any).validity_months}
                onChange={e => setForm((f: any) => ({ ...f, validity_months: e.target.value }))}
                placeholder="e.g. 3" />
              <p className="text-xs text-gray-400 mt-1">Package expires this many months after the start date.</p>
            </div>
            <div>
              <label className="label flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-gray-400" /> Total Price (SGD) *
              </label>
              <input className="input" required type="number" min="0" step="0.01"
                value={form.default_price_sgd} onChange={set('default_price_sgd')}
                placeholder="e.g. 800" />
            </div>
          </div>

          {/* Auto price per session */}
          {pps !== null && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 flex items-center justify-between">
              <span className="text-xs text-red-700">Auto-calculated price per session</span>
              <span className="text-sm font-bold text-red-700">{formatSGD(pps)}</span>
            </div>
          )}

          <div>
            <label className="label flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-gray-400" /> Effective From *
            </label>
            <input className="input" required type="date" value={form.effective_from}
              onChange={set('effective_from')} />
            <p className="text-xs text-gray-400 mt-1">
              This package will be available to assign to members from this date onwards.
              Archiving this package will not affect existing member packages.
            </p>
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50">
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : editingPkg ? 'Save Changes' : 'Create Package'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setEditingPkg(null) }}
              className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      {/* Package list */}
      {list.length === 0 ? (
        <div className="card p-8 text-center">
          <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">
            {tab === 'active' ? 'No packages yet' : 'No archived packages'}
          </p>
          {tab === 'active' && (
            <button onClick={openCreate} className="btn-primary mt-3">Create first package</button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {list.map(pkg => {
            const pps = pkg.total_sessions > 0 ? pkg.default_price_sgd / pkg.total_sessions : 0
            return (
              <div key={pkg.id}
                className={cn('card p-4', tab === 'archived' && 'opacity-70')}>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Package className="w-5 h-5 text-red-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 text-sm">{pkg.name}</p>
                      {tab === 'archived' && (
                        <span className="badge-inactive">Archived</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Hash className="w-3 h-3" /> {pkg.total_sessions} sessions
                      </span>
                      <span className="flex items-center gap-1">
                        <DollarSign className="w-3 h-3" /> {formatSGD(pkg.default_price_sgd)} total
                      </span>
                      <span className="font-medium text-red-600">
                        {formatSGD(pps)}/session
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Effective from {formatDate(pkg.effective_from)}
                      {tab === 'archived' && pkg.archived_at && ` · Archived ${formatDate(pkg.archived_at)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {tab === 'active' ? (
                      <>
                        <button onClick={() => openEdit(pkg)}
                          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleArchive(pkg)}
                          className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          title="Archive">
                          <Archive className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <button onClick={() => handleUnarchive(pkg)}
                        className="btn-secondary text-xs py-1.5">Restore</button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
