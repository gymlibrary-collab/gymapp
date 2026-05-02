'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { User, Gym } from '@/types'
import {
  Plus, UserCheck, Shield, Users, Briefcase, Dumbbell,
  Edit2, Trash2, X, Save, CheckCircle, AlertCircle, Archive, Building2
} from 'lucide-react'
import { formatDate, formatDateTime } from '@/lib/utils'
import { cn } from '@/lib/utils'

const ALL_ROLES = [
  { value: 'admin', label: 'Admin', icon: Shield, description: 'App settings only' },
  { value: 'business_ops', label: 'Business Ops', icon: Briefcase, description: 'Staff, gyms, payroll, reports' },
  { value: 'manager', label: 'Manager', icon: Users, description: 'Manage one gym club' },
  { value: 'trainer', label: 'Trainer', icon: Dumbbell, description: 'Manage own members and sessions' },
]

const roleBadge: Record<string, string> = {
  admin: 'bg-red-100 text-red-700',
  trainer: 'bg-green-100 text-green-700',
  manager: 'bg-yellow-100 text-yellow-800',
  business_ops: 'bg-purple-100 text-purple-700',
}

interface StaffMember extends User {
  trainer_gyms?: { gym_id: string; gyms: { name: string } }[]
  manager_gym?: { name: string }
  manager_gym_id?: string
  is_also_trainer?: boolean
  date_of_birth?: string
  date_of_joining?: string
  date_of_departure?: string
  departure_reason?: string
}

const emptyCreate = {
  full_name: '', email: '', phone: '', role: 'trainer',
  commission_signup_pct: '10', commission_session_pct: '15',
  gym_ids: [] as string[], manager_gym_id: '', is_also_trainer: false,
  date_of_birth: '', date_of_joining: '', date_of_departure: '', departure_reason: '',
}

const emptyEdit = { ...emptyCreate, is_active: true, role: '' }

export default function TrainersPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [archived, setArchived] = useState<StaffMember[]>([])
  const [gyms, setGyms] = useState<Gym[]>([])
  const [tab, setTab] = useState<'active' | 'archived'>('active')
  const [filterRole, setFilterRole] = useState('all')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingUser, setEditingUser] = useState<StaffMember | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [createForm, setCreateForm] = useState({ ...emptyCreate })
  const [editForm, setEditForm] = useState({ ...emptyEdit })
  const supabase = createClient()

  const loadData = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return
    const { data: userData } = await supabase.from('users').select('*').eq('id', authUser.id).single()
    setCurrentUser(userData)

    const { data: activeStaff } = await supabase
      .from('users')
      .select('*, trainer_gyms(gym_id, gyms(name)), manager_gym:gyms!users_manager_gym_id_fkey(name)')
      .eq('is_archived', false).order('role').order('full_name')
    setStaff(activeStaff || [])

    const { data: archivedStaff } = await supabase
      .from('users')
      .select('*, trainer_gyms(gym_id, gyms(name)), manager_gym:gyms!users_manager_gym_id_fkey(name)')
      .eq('is_archived', true).order('archived_at', { ascending: false })
    setArchived(archivedStaff || [])

    const { data: gymData } = await supabase.from('gyms').select('*').eq('is_active', true)
    setGyms(gymData || [])
  }

  useEffect(() => { loadData() }, [])

  const showMsg = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000) }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('')
    const res = await fetch('/api/trainers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createForm),
    })
    const result = await res.json()
    if (!res.ok) { setError(result.error || 'Failed'); setSaving(false); return }
    await loadData(); setShowCreateForm(false); setCreateForm({ ...emptyCreate })
    setSaving(false); showMsg('Account created successfully')
  }

  const openEdit = (member: StaffMember) => {
    setEditingUser(member)
    setEditForm({
      full_name: member.full_name, email: member.email, phone: member.phone || '',
      role: member.role, is_active: member.is_active,
      commission_signup_pct: member.commission_signup_pct?.toString() || '10',
      commission_session_pct: member.commission_session_pct?.toString() || '15',
      gym_ids: member.trainer_gyms?.map(tg => tg.gym_id) || [],
      manager_gym_id: member.manager_gym_id || '',
      is_also_trainer: member.is_also_trainer || false,
      date_of_birth: member.date_of_birth || '',
      date_of_joining: member.date_of_joining || '',
      date_of_departure: member.date_of_departure || '',
      departure_reason: member.departure_reason || '',
    })
    setShowCreateForm(false); setError('')
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!editingUser) return
    setSaving(true); setError('')
    const res = await fetch('/api/trainers', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: editingUser.id, ...editForm }),
    })
    const result = await res.json()
    if (!res.ok) { setError(result.error || 'Failed'); setSaving(false); return }
    await loadData(); setEditingUser(null); setSaving(false); showMsg('Profile updated')
  }

  const handleResetLogin = async () => {
    if (!editingUser) return
    const res = await fetch('/api/trainers', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: editingUser.id, reset_login: true }),
    })
    if (res.ok) showMsg(`Login reset sent to ${editingUser.email}`)
    else setError('Failed to send reset link')
  }

  const handleArchive = async (member: StaffMember) => {
    if (!confirm(`Archive ${member.full_name}?`)) return
    setSaving(true)
    const res = await fetch('/api/trainers', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: member.id }),
    })
    const result = await res.json()
    if (!res.ok) { setError(result.error || 'Failed'); setSaving(false); return }
    await loadData(); setSaving(false); showMsg(`${member.full_name} archived`)
  }

  const toggleGym = (gymId: string, type: 'create' | 'edit') => {
    if (type === 'create') setCreateForm(f => ({ ...f, gym_ids: f.gym_ids.includes(gymId) ? f.gym_ids.filter(g => g !== gymId) : [...f.gym_ids, gymId] }))
    else setEditForm(f => ({ ...f, gym_ids: f.gym_ids.includes(gymId) ? f.gym_ids.filter(g => g !== gymId) : [...f.gym_ids, gymId] }))
  }

  const getGymLabel = (m: StaffMember) => {
    if (m.role === 'trainer') return m.trainer_gyms?.map(tg => (tg.gyms as any)?.name).filter(Boolean).join(', ') || 'Unassigned'
    if (m.role === 'manager') return (m.manager_gym as any)?.name || 'Unassigned'
    if (m.role === 'admin') return 'Gym Library (All)'
    if (m.role === 'business_ops') return 'All Gyms'
    return '—'
  }

  const filteredStaff = filterRole === 'all' ? staff : staff.filter(s => s.role === filterRole)
  const isSelf = (m: StaffMember) => m.id === currentUser?.id

  const RoleBadge = ({ m }: { m: StaffMember }) => {
    const info = ALL_ROLES.find(r => r.value === m.role)
    return <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', roleBadge[m.role] || 'bg-gray-100 text-gray-600')}>
      {info?.label || m.role}{m.role === 'manager' && m.is_also_trainer && ' / Trainer'}
    </span>
  }

  const AlsoTrainerToggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
    <div className={cn('flex items-start gap-3 p-3 rounded-lg border cursor-pointer', value ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-gray-300')}
      onClick={() => onChange(!value)}>
      <div className={cn('w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5', value ? 'border-red-500 bg-red-500' : 'border-gray-300')}>
        {value && <CheckCircle className="w-3.5 h-3.5 text-white" />}
      </div>
      <div>
        <p className="text-sm font-medium text-gray-900">Also acts as a Trainer</p>
        <p className="text-xs text-gray-500 mt-0.5">Can manage own members, schedule sessions and earn trainer commissions.</p>
      </div>
    </div>
  )

  // Shared fields for create and edit
  const ContactFields = ({ form, setF }: { form: any; setF: (f: any) => void }) => (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Full Name *</label><input className="input" required value={form.full_name} onChange={e => setF((f: any) => ({ ...f, full_name: e.target.value }))} /></div>
        <div><label className="label">Email *</label><input className="input" required type="email" value={form.email} onChange={e => setF((f: any) => ({ ...f, email: e.target.value }))} /></div>
      </div>
      <div><label className="label">Phone *</label><input className="input" required type="tel" value={form.phone} onChange={e => setF((f: any) => ({ ...f, phone: e.target.value }))} placeholder="+65 9123 4567" /></div>
      <div className="grid grid-cols-3 gap-3">
        <div><label className="label">Date of Birth</label><input className="input" type="date" value={form.date_of_birth} onChange={e => setF((f: any) => ({ ...f, date_of_birth: e.target.value }))} /></div>
        <div><label className="label">Date of Joining</label><input className="input" type="date" value={form.date_of_joining} onChange={e => setF((f: any) => ({ ...f, date_of_joining: e.target.value }))} /></div>
        <div><label className="label">Date of Departure</label><input className="input" type="date" value={form.date_of_departure} onChange={e => setF((f: any) => ({ ...f, date_of_departure: e.target.value }))} /></div>
      </div>
      {form.date_of_departure && (
        <div><label className="label">Departure Reason</label><input className="input" value={form.departure_reason} onChange={e => setF((f: any) => ({ ...f, departure_reason: e.target.value }))} placeholder="e.g. Resigned, Contract ended, Relocated..." /></div>
      )}
    </>
  )

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900">Staff Management</h1><p className="text-sm text-gray-500">All roles across Gym Library</p></div>
        {tab === 'active' && <button onClick={() => { setShowCreateForm(!showCreateForm); setEditingUser(null) }} className="btn-primary flex items-center gap-1.5"><Plus className="w-4 h-4" /> Add Staff</button>}
      </div>

      {success && <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700"><CheckCircle className="w-4 h-4 flex-shrink-0" /> {success}</div>}
      {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600"><AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}<button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button></div>}

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        <button onClick={() => setTab('active')} className={cn('flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', tab === 'active' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600')}>Active ({staff.length})</button>
        <button onClick={() => setTab('archived')} className={cn('flex-1 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-1.5', tab === 'archived' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600')}><Archive className="w-3.5 h-3.5" /> Archived ({archived.length})</button>
      </div>

      {tab === 'active' && (
        <>
          {showCreateForm && (
            <form onSubmit={handleCreate} className="card p-4 space-y-4 border-red-200">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-900 text-sm">Add New Staff Member</h2>
                <button type="button" onClick={() => { setShowCreateForm(false); setCreateForm({ ...emptyCreate }) }}><X className="w-4 h-4 text-gray-400" /></button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {ALL_ROLES.map(r => (
                  <label key={r.value} className={cn('flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors', createForm.role === r.value ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-gray-300')}>
                    <input type="radio" name="create_role" value={r.value} checked={createForm.role === r.value} onChange={e => setCreateForm(f => ({ ...f, role: e.target.value, is_also_trainer: false }))} className="mt-0.5 flex-shrink-0" />
                    <div><p className="text-xs font-medium text-gray-900">{r.label}</p><p className="text-xs text-gray-400">{r.description}</p></div>
                  </label>
                ))}
              </div>
              <ContactFields form={createForm} setF={setCreateForm} />
              {(createForm.role === 'trainer' || (createForm.role === 'manager' && createForm.is_also_trainer)) && (
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Sign-up Commission %</label><input className="input" type="number" min="0" max="100" step="0.5" value={createForm.commission_signup_pct} onChange={e => setCreateForm(f => ({ ...f, commission_signup_pct: e.target.value }))} /></div>
                  <div><label className="label">Session Commission %</label><input className="input" type="number" min="0" max="100" step="0.5" value={createForm.commission_session_pct} onChange={e => setCreateForm(f => ({ ...f, commission_session_pct: e.target.value }))} /></div>
                </div>
              )}
              {createForm.role === 'trainer' && (
                <div><label className="label">Assign to Gym(s) *</label><div className="space-y-1.5">{gyms.map(g => <label key={g.id} className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={createForm.gym_ids.includes(g.id)} onChange={() => toggleGym(g.id, 'create')} className="rounded border-gray-300 text-red-600" /><span className="text-sm text-gray-700">{g.name}</span></label>)}</div></div>
              )}
              {createForm.role === 'manager' && (
                <><div><label className="label">Assigned Gym *</label><select className="input" required value={createForm.manager_gym_id} onChange={e => setCreateForm(f => ({ ...f, manager_gym_id: e.target.value }))}><option value="">Select gym...</option>{gyms.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div><AlsoTrainerToggle value={createForm.is_also_trainer} onChange={v => setCreateForm(f => ({ ...f, is_also_trainer: v }))} /></>
              )}
              <div className="flex gap-2">
                <button type="submit" disabled={saving} className="btn-primary flex-1 disabled:opacity-50">{saving ? 'Creating...' : 'Create Account'}</button>
                <button type="button" onClick={() => { setShowCreateForm(false); setCreateForm({ ...emptyCreate }) }} className="btn-secondary">Cancel</button>
              </div>
            </form>
          )}

          {editingUser && (
            <form onSubmit={handleEdit} className="card p-4 space-y-4 border-blue-200">
              <div className="flex items-center justify-between">
                <div><h2 className="font-semibold text-gray-900 text-sm">Edit: {editingUser.full_name}</h2>{isSelf(editingUser) && <p className="text-xs text-red-600 mt-0.5">Your own account</p>}</div>
                <button type="button" onClick={() => setEditingUser(null)}><X className="w-4 h-4 text-gray-400" /></button>
              </div>
              <ContactFields form={editForm} setF={setEditForm} />
              {!isSelf(editingUser) && (
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Role</label><select className="input" value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}>{ALL_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
                  <div><label className="label">Status</label><select className="input" value={editForm.is_active ? 'active' : 'inactive'} onChange={e => setEditForm(f => ({ ...f, is_active: e.target.value === 'active' }))}><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
                </div>
              )}
              {(editForm.role === 'trainer' || editForm.role === 'manager') && (
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Sign-up Commission %</label><input className="input" type="number" min="0" max="100" step="0.5" value={editForm.commission_signup_pct} onChange={e => setEditForm(f => ({ ...f, commission_signup_pct: e.target.value }))} /></div>
                  <div><label className="label">Session Commission %</label><input className="input" type="number" min="0" max="100" step="0.5" value={editForm.commission_session_pct} onChange={e => setEditForm(f => ({ ...f, commission_session_pct: e.target.value }))} /></div>
                </div>
              )}
              {editForm.role === 'trainer' && !isSelf(editingUser) && (
                <div><label className="label">Gym Assignments</label><div className="space-y-1.5">{gyms.map(g => <label key={g.id} className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={editForm.gym_ids.includes(g.id)} onChange={() => toggleGym(g.id, 'edit')} className="rounded border-gray-300 text-red-600" /><span className="text-sm text-gray-700">{g.name}</span></label>)}</div></div>
              )}
              {editForm.role === 'manager' && !isSelf(editingUser) && (
                <><div><label className="label">Assigned Gym</label><select className="input" value={editForm.manager_gym_id} onChange={e => setEditForm(f => ({ ...f, manager_gym_id: e.target.value }))}><option value="">— No gym assigned —</option>{gyms.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div><AlsoTrainerToggle value={editForm.is_also_trainer} onChange={v => setEditForm(f => ({ ...f, is_also_trainer: v }))} /></>
              )}
              {!isSelf(editingUser) && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center justify-between">
                  <div><p className="text-xs font-medium text-amber-800">Reset Login</p><p className="text-xs text-amber-600 mt-0.5">{editingUser.email}</p></div>
                  <button type="button" onClick={handleResetLogin} className="btn-secondary text-xs py-1.5">Send Reset</button>
                </div>
              )}
              <div className="flex gap-2">
                <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"><Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Changes'}</button>
                <button type="button" onClick={() => setEditingUser(null)} className="btn-secondary">Cancel</button>
              </div>
            </form>
          )}

          <div className="flex gap-1 flex-wrap">
            {[{ key: 'all', label: `All (${staff.length})` }, { key: 'admin', label: `Admin (${staff.filter(s => s.role === 'admin').length})` }, { key: 'business_ops', label: `Biz Ops (${staff.filter(s => s.role === 'business_ops').length})` }, { key: 'manager', label: `Manager (${staff.filter(s => s.role === 'manager').length})` }, { key: 'trainer', label: `Trainer (${staff.filter(s => s.role === 'trainer').length})` }].map(({ key, label }) => (
              <button key={key} onClick={() => setFilterRole(key)} className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', filterRole === key ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>{label}</button>
            ))}
          </div>

          {filteredStaff.length === 0 ? (
            <div className="card p-8 text-center"><UserCheck className="w-10 h-10 text-gray-300 mx-auto mb-3" /><p className="text-gray-500 text-sm">No staff found</p></div>
          ) : (
            <div className="space-y-2">
              {filteredStaff.map(member => (
                <div key={member.id} className={cn('card p-4', !member.is_active && 'opacity-70', isSelf(member) && 'border-red-200 bg-red-50/20')}>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-red-700 font-semibold text-sm">{member.full_name.charAt(0)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900 text-sm">{member.full_name}</p>
                        {isSelf(member) && <span className="text-xs text-red-600 font-medium">(You)</span>}
                        <RoleBadge m={member} />
                        <span className={member.is_active ? 'badge-active' : 'badge-inactive'}>{member.is_active ? 'Active' : 'Inactive'}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{member.email}</p>
                      {member.phone ? <p className="text-xs text-gray-400">{member.phone}</p> : <p className="text-xs text-amber-500">⚠ Phone not set</p>}
                      <div className="flex items-center gap-1 mt-1"><Building2 className="w-3 h-3 text-gray-300 flex-shrink-0" /><p className="text-xs text-gray-400">{getGymLabel(member)}</p></div>
                      {member.date_of_joining && <p className="text-xs text-gray-400 mt-0.5">Joined: {formatDate(member.date_of_joining)}</p>}
                      {member.date_of_departure && <p className="text-xs text-red-400 mt-0.5">Departed: {formatDate(member.date_of_departure)}{member.departure_reason && ` — ${member.departure_reason}`}</p>}
                      {(member.role === 'trainer' || (member.role === 'manager' && member.is_also_trainer)) && (
                        <p className="text-xs text-gray-400 mt-0.5">Commission: {member.commission_signup_pct}% sign-up · {member.commission_session_pct}% session</p>
                      )}
                      <p className="text-xs text-gray-300 mt-1">Created: {formatDateTime(member.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => openEdit(member)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                      {!isSelf(member) && <button onClick={() => handleArchive(member)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'archived' && (
        <div className="space-y-2">
          {archived.length === 0 ? (
            <div className="card p-8 text-center"><Archive className="w-10 h-10 text-gray-300 mx-auto mb-3" /><p className="text-gray-500 text-sm">No archived staff</p></div>
          ) : archived.map(member => (
            <div key={member.id} className="card p-4 opacity-75 border-l-4 border-l-red-200">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-gray-500 font-semibold text-sm">{member.full_name.charAt(0)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-700 text-sm">{member.full_name}</p>
                    <RoleBadge m={member} />
                    <span className="badge-danger">Archived</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{member.email}</p>
                  {member.phone && <p className="text-xs text-gray-400">{member.phone}</p>}
                  <div className="flex items-center gap-1 mt-1"><Building2 className="w-3 h-3 text-gray-300 flex-shrink-0" /><p className="text-xs text-gray-400">{getGymLabel(member)}</p></div>
                  {member.date_of_joining && <p className="text-xs text-gray-400 mt-0.5">Joined: {formatDate(member.date_of_joining)}</p>}
                  {member.date_of_departure && <p className="text-xs text-gray-400 mt-0.5">Departed: {formatDate(member.date_of_departure)}{member.departure_reason && ` — ${member.departure_reason}`}</p>}
                  <div className="mt-2 pt-2 border-t border-gray-100 space-y-0.5">
                    <p className="text-xs text-gray-400"><span className="font-medium text-gray-500">Created:</span> {formatDateTime(member.created_at)}</p>
                    {member.archived_at && <p className="text-xs text-red-400"><span className="font-medium text-red-500">Archived:</span> {formatDateTime(member.archived_at)}</p>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
