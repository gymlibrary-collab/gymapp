'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useViewMode } from '@/lib/view-mode-context'
import { Client, Package, Session, User, PackageTemplate } from '@/types'
import { formatDate, formatDateTime, formatSGD, getSessionsRemaining } from '@/lib/utils'
import { ArrowLeft, Phone, Heart, Package as PkgIcon, Calendar, Plus, Edit2, Save, X } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export default function MemberDetailPage() {
  const { id } = useParams()
  const [member, setMember] = useState<Client | null>(null)
  const [packages, setPackages] = useState<Package[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [templates, setTemplates] = useState<PackageTemplate[]>([])
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [showPkgForm, setShowPkgForm] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [pkgForm, setPkgForm] = useState({ template_id: '', total_price_sgd: '', start_date: '' })
  const [editForm, setEditForm] = useState({ full_name: '', phone: '', date_of_birth: '', gender: '', health_notes: '' })
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  // ── KEY FIX: use context ──
  const { isActingAsTrainer } = useViewMode()

  useEffect(() => {
    const load = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return
      const { data: userData } = await supabase.from('users').select('*').eq('id', authUser.id).single()
      setCurrentUser(userData)

      const { data: m } = await supabase.from('clients').select('*, gyms(name), users(full_name)').eq('id', id).single()
      setMember(m)
      if (m) setEditForm({ full_name: m.full_name, phone: m.phone || '', date_of_birth: m.date_of_birth || '', gender: m.gender || '', health_notes: m.health_notes || '' })

      const { data: pkgs } = await supabase.from('packages').select('*').eq('client_id', id).order('created_at', { ascending: false })
      setPackages(pkgs || [])

      const { data: sess } = await supabase.from('sessions').select('*').eq('client_id', id).order('scheduled_at', { ascending: false })
      setSessions(sess || [])

      const { data: tpls } = await supabase.from('package_templates').select('*').eq('is_archived', false)
      setTemplates(tpls || [])
    }
    load()
  }, [id])

  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!member) return
    setSaving(true)
    await supabase.from('clients').update({
      full_name: editForm.full_name, phone: editForm.phone,
      date_of_birth: editForm.date_of_birth || null,
      gender: editForm.gender || null,
      health_notes: editForm.health_notes || null,
    }).eq('id', member.id)
    const { data: updated } = await supabase.from('clients').select('*, gyms(name), users(full_name)').eq('id', id).single()
    setMember(updated)
    setSaving(false); setShowEditForm(false)
  }

  const handleAssignPackage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!member || !currentUser) return
    setSaving(true)
    const tpl = templates.find(t => t.id === pkgForm.template_id)
    if (!tpl) return
    await supabase.from('packages').insert({
      template_id: pkgForm.template_id, client_id: member.id, trainer_id: currentUser.id,
      gym_id: member.gym_id, package_name: tpl.name, total_sessions: tpl.total_sessions,
      total_price_sgd: parseFloat(pkgForm.total_price_sgd), start_date: pkgForm.start_date,
      signup_commission_pct: currentUser.commission_signup_pct,
      session_commission_pct: currentUser.commission_session_pct,
    })
    const { data: pkgs } = await supabase.from('packages').select('*').eq('client_id', id).order('created_at', { ascending: false })
    setPackages(pkgs || [])
    setShowPkgForm(false); setPkgForm({ template_id: '', total_price_sgd: '', start_date: '' })
    setSaving(false)
  }

  if (!member) return <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600" /></div>

  const activePackage = packages.find(p => p.status === 'active')

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/clients" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{member.full_name}</h1>
          <p className="text-xs text-gray-500 capitalize">{member.status} member · {(member as any).gyms?.name}</p>
        </div>
        {/* Edit button ONLY in trainer view */}
        {isActingAsTrainer && (
          <button onClick={() => setShowEditForm(!showEditForm)} className="btn-secondary flex items-center gap-1.5">
            <Edit2 className="w-3.5 h-3.5" /> Edit
          </button>
        )}
      </div>

      {/* Edit form — trainer view only */}
      {showEditForm && isActingAsTrainer && (
        <form onSubmit={handleSaveMember} className="card p-4 space-y-3 border-red-200">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 text-sm">Edit Member Details</h2>
            <button type="button" onClick={() => setShowEditForm(false)}><X className="w-4 h-4 text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Full Name *</label><input className="input" required value={editForm.full_name} onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))} /></div>
            <div><label className="label">Phone *</label><input className="input" required type="tel" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Date of Birth</label><input className="input" type="date" value={editForm.date_of_birth} onChange={e => setEditForm(f => ({ ...f, date_of_birth: e.target.value }))} /></div>
            <div><label className="label">Gender</label><select className="input" value={editForm.gender} onChange={e => setEditForm(f => ({ ...f, gender: e.target.value }))}><option value="">Select...</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option><option value="prefer_not_to_say">Prefer not to say</option></select></div>
          </div>
          <div><label className="label">Health Notes</label><textarea className="input min-h-[80px] resize-none" value={editForm.health_notes} onChange={e => setEditForm(f => ({ ...f, health_notes: e.target.value }))} placeholder="Injuries, conditions, notes..." /></div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50">
              <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button type="button" onClick={() => setShowEditForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      {/* Contact & Health */}
      <div className="card p-4 space-y-3">
        <h2 className="font-semibold text-gray-900 text-sm">Contact & Health</h2>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-gray-600">
            <Phone className="w-4 h-4 text-gray-400" />
            <a href={`tel:${member.phone}`} className="text-sm hover:text-red-600">{member.phone}</a>
          </div>
          {member.date_of_birth && <p className="text-xs text-gray-500">DOB: {formatDate(member.date_of_birth)}</p>}
          {member.health_notes && (
            <div className="flex items-start gap-2 text-gray-600">
              <Heart className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs bg-red-50 text-red-700 rounded-lg px-3 py-2">{member.health_notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Packages */}
      <div className="card">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
            <PkgIcon className="w-4 h-4 text-red-600" /> Packages
          </h2>
          {/* Assign package — trainer view only */}
          {isActingAsTrainer && (
            <button onClick={() => setShowPkgForm(!showPkgForm)} className="btn-primary flex items-center gap-1 text-xs py-1.5">
              <Plus className="w-3.5 h-3.5" /> Assign Package
            </button>
          )}
        </div>

        {showPkgForm && isActingAsTrainer && (
          <form onSubmit={handleAssignPackage} className="p-4 border-b border-gray-100 bg-red-50 space-y-3">
            <select className="input" required value={pkgForm.template_id}
              onChange={e => { const t = templates.find(x => x.id === e.target.value); setPkgForm(f => ({ ...f, template_id: e.target.value, total_price_sgd: t?.default_price_sgd.toString() || '' })) }}>
              <option value="">Select package...</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.total_sessions} sessions)</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="label">Price (SGD)</label><input className="input" type="number" step="0.01" required value={pkgForm.total_price_sgd} onChange={e => setPkgForm(f => ({ ...f, total_price_sgd: e.target.value }))} /></div>
              <div><label className="label">Start Date</label><input className="input" type="date" required value={pkgForm.start_date} onChange={e => setPkgForm(f => ({ ...f, start_date: e.target.value }))} /></div>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : 'Assign Package'}</button>
              <button type="button" onClick={() => setShowPkgForm(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        )}

        {packages.length === 0 ? (
          <p className="p-4 text-sm text-gray-500 text-center">No packages assigned yet</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {packages.map(pkg => {
              const pct = Math.round((pkg.sessions_used / pkg.total_sessions) * 100)
              return (
                <div key={pkg.id} className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{pkg.package_name}</p>
                      <p className="text-xs text-gray-500">Started {formatDate(pkg.start_date)}</p>
                    </div>
                    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full',
                      pkg.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600')}>
                      {pkg.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 mb-2">
                    <span>{pkg.sessions_used}/{pkg.total_sessions} sessions</span>
                    <span>·</span>
                    <span>{formatSGD(pkg.price_per_session_sgd)}/session</span>
                    <span>·</span>
                    <span className="font-medium text-gray-700">{formatSGD(pkg.total_price_sgd)} total</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-red-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{getSessionsRemaining(pkg.total_sessions, pkg.sessions_used)} sessions remaining</p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Sessions */}
      <div className="card">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
            <Calendar className="w-4 h-4 text-red-600" /> Sessions
          </h2>
          {/* Schedule session — trainer view only */}
          {isActingAsTrainer && activePackage && (
            <Link href={`/dashboard/sessions/new?client=${member.id}&package=${activePackage.id}`}
              className="btn-primary flex items-center gap-1 text-xs py-1.5">
              <Plus className="w-3.5 h-3.5" /> Schedule
            </Link>
          )}
        </div>
        {sessions.length === 0 ? (
          <p className="p-4 text-sm text-gray-500 text-center">No sessions yet</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {sessions.slice(0, 10).map(session => (
              <div key={session.id} className="p-4 flex items-center gap-3">
                <div className={cn('w-2 h-2 rounded-full flex-shrink-0',
                  session.status === 'completed' ? 'bg-green-500' :
                  session.status === 'scheduled' ? 'bg-blue-500' :
                  session.status === 'cancelled' ? 'bg-gray-400' : 'bg-red-400')} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900">{formatDateTime(session.scheduled_at)}</p>
                  {session.performance_notes && <p className="text-xs text-gray-500 truncate">{session.performance_notes}</p>}
                </div>
                <span className={cn('text-xs px-2 py-0.5 rounded-full capitalize',
                  session.status === 'completed' ? 'bg-green-100 text-green-700' :
                  session.status === 'scheduled' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600')}>
                  {session.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
