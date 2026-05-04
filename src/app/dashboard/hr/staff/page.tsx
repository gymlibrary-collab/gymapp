'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { formatDate, formatDateTime, formatSGD } from '@/lib/utils'
import {
  Plus, UserCheck, Shield, Users, Briefcase, Dumbbell,
  Edit2, Trash2, X, Save, CheckCircle, AlertCircle, Archive,
  Building2, Clock
} from 'lucide-react'
import { cn } from '@/lib/utils'

const ALL_ROLES = [
  { value: 'admin', label: 'Admin', description: 'App settings only' },
  { value: 'business_ops', label: 'Business Ops', description: 'Staff, gyms, payroll, reports' },
  { value: 'manager', label: 'Manager', description: 'Manage one gym club' },
  { value: 'trainer', label: 'Trainer', description: 'Manage own members and sessions' },
  { value: 'staff', label: 'Operations Staff', description: 'Sales, member lookup, schedule view' },
]

const roleBadge: Record<string, string> = {
  admin: 'bg-red-100 text-red-700',
  trainer: 'bg-green-100 text-green-700',
  manager: 'bg-yellow-100 text-yellow-800',
  business_ops: 'bg-purple-100 text-purple-700',
  staff: 'bg-blue-100 text-blue-700',
}

const emptyForm = {
  full_name: '', email: '', phone: '', role: 'trainer',
  employment_type: 'full_time', hourly_rate: '',
  commission_signup_pct: '10', commission_session_pct: '15', membership_commission_pct: '5',
  // gym_id: single-gym dropdown for full-timers (all roles)
  // gym_ids: multi-select checkboxes for part-time ops staff (rostered at any gym)
  gym_id: '', gym_ids: [] as string[], manager_gym_id: '', is_also_trainer: false,
  date_of_birth: '', date_of_joining: '', date_of_departure: '', departure_reason: '',
  nric: '', nationality: 'Singaporean',
  leave_entitlement_days: '14',
}

export default function TrainersPage() {
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [staff, setStaff] = useState<any[]>([])
  const [archived, setArchived] = useState<any[]>([])
  const [gyms, setGyms] = useState<any[]>([])
  const [tab, setTab] = useState<'active' | 'archived'>('active')
  const [filterRole, setFilterRole] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingUser, setEditingUser] = useState<any | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [createForm, setCreateForm] = useState({ ...emptyForm })
  const [editForm, setEditForm] = useState({ ...emptyForm, is_active: true, role: '' })
  const router = useRouter()
  const supabase = createClient()

  const loadData = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) { router.push('/dashboard'); return }
    const { data: userData } = await supabase.from('users').select('*').eq('id', authUser.id).single()
    if (!userData || !['manager', 'business_ops', 'admin'].includes(userData.role)) {
      router.push('/dashboard'); return
    }
    setCurrentUser(userData)

    // Biz Ops: sees all staff across all gyms (scoped by RLS).
    // Manager: scoped to staff in their gym only — trainers via trainer_gyms,
    //   full-time ops staff via manager_gym_id. Excludes admin and biz ops roles.
    const isManager = userData.role === 'manager'
    const gymId = userData.manager_gym_id

    let activeQ = supabase.from('users')
      .select('*, trainer_gyms(gym_id, gyms(name)), manager_gym:gyms!users_manager_gym_id_fkey(name)')
      .eq('is_archived', false)

    let archQ = supabase.from('users')
      .select('*, trainer_gyms(gym_id, gyms(name)), manager_gym:gyms!users_manager_gym_id_fkey(name)')
      .eq('is_archived', true)

    if (isManager && gymId) {
      // Trainers assigned to this gym via trainer_gyms
      const { data: tgRows } = await supabase.from('trainer_gyms').select('trainer_id').eq('gym_id', gymId)
      const trainerIds = tgRows?.map((r: any) => r.trainer_id) || []

      // Only roles a manager should see: trainer and staff (not admin/biz ops/other managers)
      activeQ = activeQ.in('role', ['trainer', 'staff'])
      archQ   = archQ.in('role', ['trainer', 'staff'])

      if (trainerIds.length > 0) {
        // Match trainers in this gym OR full-time ops staff assigned to this gym
        activeQ = activeQ.or(`id.in.(${trainerIds.join(',')}),manager_gym_id.eq.${gymId}`)
        archQ   = archQ.or(`id.in.(${trainerIds.join(',')}),manager_gym_id.eq.${gymId}`)
      } else {
        // No trainers in gym — show only full-time ops staff assigned here
        activeQ = activeQ.eq('manager_gym_id', gymId)
        archQ   = archQ.eq('manager_gym_id', gymId)
      }
    }

    const { data: active } = await activeQ.order('employment_type').order('role').order('full_name')
    setStaff(active || [])

    const { data: arch } = await archQ.order('archived_at', { ascending: false })
    setArchived(arch || [])

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
    await loadData(); setShowCreateForm(false); setCreateForm({ ...emptyForm })
    setSaving(false); showMsg('Account created')
  }

  const openEdit = (member: any) => {
    setEditingUser(member)
    setEditForm({
      full_name: member.full_name, email: member.email, phone: member.phone || '',
      role: member.role, is_active: member.is_active,
      employment_type: member.employment_type || 'full_time',
      hourly_rate: member.hourly_rate?.toString() || '',
      commission_signup_pct: member.commission_signup_pct?.toString() || '10',
      commission_session_pct: member.commission_session_pct?.toString() || '15',
      membership_commission_pct: member.membership_commission_pct?.toString() || '5',
      // Full-timers (all roles): single assigned gym; part-time ops staff: multi-gym
      gym_id: member.employment_type !== 'part_time'
        ? (member.trainer_gyms?.[0]?.gym_id || member.manager_gym_id || '')
        : '',
      gym_ids: member.trainer_gyms?.map((tg: any) => tg.gym_id) || [],
      manager_gym_id: member.manager_gym_id || '',
      is_also_trainer: member.is_also_trainer || false,
      date_of_birth: member.date_of_birth || '',
      date_of_joining: member.date_of_joining || '',
      date_of_departure: member.date_of_departure || '',
      departure_reason: member.departure_reason || '',
      nric: member.nric || '',
      leave_entitlement_days: member.leave_entitlement_days?.toString() || '14',
      nationality: member.nationality || 'Singaporean',
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

  const handleArchive = async (member: any) => {
    if (!confirm(`Archive ${member.full_name}?`)) return
    setSaving(true)
    const res = await fetch('/api/trainers', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: member.id }),
    })
    if (!res.ok) { const r = await res.json(); setError(r.error || 'Failed') }
    else showMsg(`${member.full_name} archived`)
    await loadData(); setSaving(false)
  }

  const toggleGym = (gymId: string, type: 'create' | 'edit') => {
    if (type === 'create') setCreateForm(f => ({ ...f, gym_ids: f.gym_ids.includes(gymId) ? f.gym_ids.filter(g => g !== gymId) : [...f.gym_ids, gymId] }))
    else setEditForm((f: any) => ({ ...f, gym_ids: f.gym_ids.includes(gymId) ? f.gym_ids.filter((g: string) => g !== gymId) : [...f.gym_ids, gymId] }))
  }

  const getGymLabel = (m: any) => {
    if (m.role === 'trainer') return m.trainer_gyms?.map((tg: any) => tg.gyms?.name).filter(Boolean).join(', ') || 'Unassigned'
    if (m.role === 'manager' || m.role === 'staff') return m.manager_gym?.name || 'Unassigned'
    if (m.role === 'admin') return 'Gym Library'
    return 'All Gyms'
  }

  const isSelf = (m: any) => m.id === currentUser?.id
  const isBizOps = currentUser?.role === 'business_ops'

  // Filter
  let filteredStaff = tab === 'active' ? staff : archived
  if (filterRole !== 'all') filteredStaff = filteredStaff.filter(s => s.role === filterRole)
  if (filterType !== 'all') filteredStaff = filteredStaff.filter(s => (s.employment_type || 'full_time') === filterType)

  const AlsoTrainerToggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
    <div className={cn('flex items-start gap-3 p-3 rounded-lg border cursor-pointer', value ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:border-gray-300')}
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

  // Shared fields for create/edit
  const PersonalFields = ({ form, setF }: { form: any; setF: any }) => (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Full Name *</label><input className="input" required value={form.full_name} onChange={e => setF((f: any) => ({ ...f, full_name: e.target.value }))} /></div>
        <div><label className="label">Email *</label><input className="input" required type="email" value={form.email} onChange={e => setF((f: any) => ({ ...f, email: e.target.value }))} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Phone *</label><input className="input" required type="tel" value={form.phone} onChange={e => setF((f: any) => ({ ...f, phone: e.target.value }))} placeholder="+65 9123 4567" /></div>
        {isBizOps && <div><label className="label">NRIC / FIN</label><input className="input" value={form.nric} onChange={e => setF((f: any) => ({ ...f, nric: e.target.value }))} placeholder="e.g. S1234567A" /></div>}
      </div>
      {isBizOps && (
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Nationality</label><input className="input" value={form.nationality} onChange={e => setF((f: any) => ({ ...f, nationality: e.target.value }))} placeholder="e.g. Singaporean" /></div>
          <div><label className="label">Date of Birth</label><input className="input" type="date" value={form.date_of_birth} onChange={e => setF((f: any) => ({ ...f, date_of_birth: e.target.value }))} /></div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Date of Joining</label><input className="input" type="date" value={form.date_of_joining} onChange={e => setF((f: any) => ({ ...f, date_of_joining: e.target.value }))} /></div>
        <div><label className="label">Date of Departure</label><input className="input" type="date" value={form.date_of_departure} onChange={e => setF((f: any) => ({ ...f, date_of_departure: e.target.value }))} /></div>
      </div>
      {isBizOps && (
        <div>
          <label className="label">Annual Leave Entitlement (days) *</label>
          <input className="input" type="number" required min="0" max="365"
            value={form.leave_entitlement_days}
            onChange={e => setF((f: any) => ({ ...f, leave_entitlement_days: e.target.value }))}
            placeholder="e.g. 14" />
          <p className="text-xs text-gray-400 mt-1">Number of paid leave days per calendar year. Applies to full-time staff only.</p>
        </div>
      )}
      {form.date_of_departure && (
        <div><label className="label">Departure Reason</label><input className="input" value={form.departure_reason} onChange={e => setF((f: any) => ({ ...f, departure_reason: e.target.value }))} placeholder="e.g. Resigned, Contract ended" /></div>
      )}
    </>
  )

  const EmploymentFields = ({ form, setF }: { form: any; setF: any }) => (
    <>
      <div>
        <label className="label">Employment Type *</label>
        <div className="flex gap-2">
          {['full_time', 'part_time'].map(et => (
            <label key={et} className={cn('flex-1 flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors',
              form.employment_type === et ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-gray-300')}>
              <input type="radio" checked={form.employment_type === et} onChange={() => setF((f: any) => ({ ...f, employment_type: et }))} />
              <div>
                <p className="text-sm font-medium text-gray-900">{et === 'full_time' ? 'Full Time' : 'Part Time'}</p>
                <p className="text-xs text-gray-400">{et === 'full_time' ? 'Fixed monthly salary' : 'Hourly rate per shift'}</p>
              </div>
            </label>
          ))}
        </div>
      </div>
      {form.employment_type === 'part_time' && (
        <div><label className="label">Hourly Rate (SGD)</label><input className="input" type="number" min="0" step="0.50" value={form.hourly_rate} onChange={e => setF((f: any) => ({ ...f, hourly_rate: e.target.value }))} placeholder="e.g. 12.00" /></div>
      )}
    </>
  )

  const CommissionFields = ({ form, setF }: { form: any; setF: any }) => (
    <div className="space-y-3">
      <p className="text-xs font-medium text-gray-700">Commission Rates</p>
      <div className="grid grid-cols-3 gap-2">
        {(form.role === 'trainer' || (form.role === 'manager' && form.is_also_trainer)) && (
          <>
            <div><label className="label text-xs">PT Sign-up %</label><input className="input" type="number" min="0" max="100" step="0.5" value={form.commission_signup_pct} onChange={e => setF((f: any) => ({ ...f, commission_signup_pct: e.target.value }))} /></div>
            <div><label className="label text-xs">PT Session %</label><input className="input" type="number" min="0" max="100" step="0.5" value={form.commission_session_pct} onChange={e => setF((f: any) => ({ ...f, commission_session_pct: e.target.value }))} /></div>
          </>
        )}
        <div><label className="label text-xs">Membership %</label><input className="input" type="number" min="0" max="100" step="0.5" value={form.membership_commission_pct} onChange={e => setF((f: any) => ({ ...f, membership_commission_pct: e.target.value }))} /></div>
      </div>
    </div>
  )

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900">Staff Management</h1><p className="text-sm text-gray-500">All staff across Gym Library · {staff.filter(s => (s.employment_type || 'full_time') === 'full_time').length} full-time · {staff.filter(s => s.employment_type === 'part_time').length} part-time</p></div>
        {tab === 'active' && <button onClick={() => { setShowCreateForm(!showCreateForm); setEditingUser(null) }} className="btn-primary flex items-center gap-1.5"><Plus className="w-4 h-4" /> Add Staff</button>}
      </div>

      {success && <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700"><CheckCircle className="w-4 h-4 flex-shrink-0" />{success}</div>}
      {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600"><AlertCircle className="w-4 h-4 flex-shrink-0" />{error}<button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button></div>}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        <button onClick={() => setTab('active')} className={cn('flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', tab === 'active' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600')}>Active ({staff.length})</button>
        <button onClick={() => setTab('archived')} className={cn('flex-1 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-1.5', tab === 'archived' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600')}><Archive className="w-3.5 h-3.5" /> Archived ({archived.length})</button>
      </div>

      {tab === 'active' && (
        <>
          {/* Create form */}
          {showCreateForm && (
            <form onSubmit={handleCreate} className="card p-4 space-y-4 border-red-200">
              <div className="flex items-center justify-between"><h2 className="font-semibold text-gray-900 text-sm">Add New Staff Member</h2><button type="button" onClick={() => { setShowCreateForm(false); setCreateForm({ ...emptyForm }) }}><X className="w-4 h-4 text-gray-400" /></button></div>

              {/* Role */}
              <div className="grid grid-cols-2 gap-2">
                {ALL_ROLES.map(r => (
                  <label key={r.value} className={cn('flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors', createForm.role === r.value ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-gray-300')}>
                    <input type="radio" name="create_role" value={r.value} checked={createForm.role === r.value} onChange={e => setCreateForm(f => ({ ...f, role: e.target.value }))} className="mt-0.5 flex-shrink-0" />
                    <div><p className="text-xs font-medium text-gray-900">{r.label}</p><p className="text-xs text-gray-400">{r.description}</p></div>
                  </label>
                ))}
              </div>

              <PersonalFields form={createForm} setF={setCreateForm} />
              <EmploymentFields form={createForm} setF={setCreateForm} />

              {/* Gym assignment */}
              {/* Full-timers: single gym dropdown. Part-time trainers: multi-gym checkboxes. */}
              {createForm.employment_type === 'part_time' && (
                <div>
                  <label className="label">Assign to Gym(s)</label>
                  <p className="text-xs text-gray-400 mb-1.5">Part-time ops staff can be rostered at multiple gyms and paid from each.</p>
                  <div className="space-y-1.5">{gyms.map(g => <label key={g.id} className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={createForm.gym_ids.includes(g.id)} onChange={() => toggleGym(g.id, 'create')} className="rounded border-gray-300 text-red-600" /><span className="text-sm text-gray-700">{g.name}</span></label>)}</div>
                </div>
              )}
              {(createForm.role !== 'admin' && createForm.role !== 'business_ops') && createForm.employment_type === 'full_time' && (
                <>
                  <div><label className="label">Assigned Gym *</label><select className="input" required value={createForm.gym_id} onChange={e => setCreateForm(f => ({ ...f, gym_id: e.target.value, manager_gym_id: e.target.value }))}><option value="">Select gym...</option>{gyms.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
                  {(createForm.role === 'manager' || createForm.role === 'staff') && <AlsoTrainerToggle value={createForm.is_also_trainer} onChange={v => setCreateForm(f => ({ ...f, is_also_trainer: v }))} />}
                </>
              )}

              <CommissionFields form={createForm} setF={setCreateForm} />

              <div className="flex gap-2">
                <button type="submit" disabled={saving} className="btn-primary flex-1 disabled:opacity-50">{saving ? 'Creating...' : 'Create Account'}</button>
                <button type="button" onClick={() => { setShowCreateForm(false); setCreateForm({ ...emptyForm }) }} className="btn-secondary">Cancel</button>
              </div>
            </form>
          )}

          {/* Edit form */}
          {editingUser && (
            <form onSubmit={handleEdit} className="card p-4 space-y-4 border-blue-200">
              <div className="flex items-center justify-between">
                <div><h2 className="font-semibold text-gray-900 text-sm">Edit: {editingUser.full_name}</h2>{isSelf(editingUser) && <p className="text-xs text-red-600 mt-0.5">Your own account</p>}</div>
                <button type="button" onClick={() => setEditingUser(null)}><X className="w-4 h-4 text-gray-400" /></button>
              </div>

              <PersonalFields form={editForm} setF={setEditForm} />
              <EmploymentFields form={editForm} setF={setEditForm} />

              {!isSelf(editingUser) && (
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Role</label><select className="input" value={editForm.role} onChange={e => setEditForm((f: any) => ({ ...f, role: e.target.value }))}>{ALL_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
                  <div><label className="label">Status</label><select className="input" value={(editForm as any).is_active ? 'active' : 'inactive'} onChange={e => setEditForm((f: any) => ({ ...f, is_active: e.target.value === 'active' }))}><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
                </div>
              )}

              {/* Full-timers: single gym dropdown. Part-time trainers: multi-gym checkboxes. */}
              {(editForm as any).employment_type === 'part_time' && !isSelf(editingUser) && (
                <div>
                  <label className="label">Gym Assignments</label>
                  <p className="text-xs text-gray-400 mb-1.5">Part-time ops staff can be rostered at multiple gyms and paid from each.</p>
                  <div className="space-y-1.5">{gyms.map(g => <label key={g.id} className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={(editForm as any).gym_ids.includes(g.id)} onChange={() => toggleGym(g.id, 'edit')} className="rounded border-gray-300 text-red-600" /><span className="text-sm text-gray-700">{g.name}</span></label>)}</div>
                </div>
              )}
              {(editForm.role !== 'admin' && editForm.role !== 'business_ops') && (editForm as any).employment_type === 'full_time' && !isSelf(editingUser) && (
                <>
                  <div><label className="label">Assigned Gym</label><select className="input" value={(editForm as any).gym_id} onChange={e => setEditForm((f: any) => ({ ...f, gym_id: e.target.value, manager_gym_id: e.target.value }))}><option value="">— No gym assigned —</option>{gyms.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
                  {(editForm.role === 'manager' || editForm.role === 'staff') && <AlsoTrainerToggle value={(editForm as any).is_also_trainer} onChange={v => setEditForm((f: any) => ({ ...f, is_also_trainer: v }))} />}
                </>
              )}

              <CommissionFields form={editForm} setF={setEditForm} />

              <div className="flex gap-2">
                <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"><Save className="w-4 h-4" />{saving ? 'Saving...' : 'Save Changes'}</button>
                <button type="button" onClick={() => setEditingUser(null)} className="btn-secondary">Cancel</button>
              </div>
            </form>
          )}

          {/* Filters */}
          <div className="flex gap-1 flex-wrap">
            {[{ key: 'all', label: `All (${staff.length})` }, { key: 'admin', label: `Admin (${staff.filter(s => s.role === 'admin').length})` }, { key: 'business_ops', label: `Biz Ops (${staff.filter(s => s.role === 'business_ops').length})` }, { key: 'manager', label: `Manager (${staff.filter(s => s.role === 'manager').length})` }, { key: 'trainer', label: `Trainer (${staff.filter(s => s.role === 'trainer').length})` },
              { key: 'staff', label: `Ops Staff (${staff.filter(s => s.role === 'staff').length})` }].map(({ key, label }) => (
              <button key={key} onClick={() => setFilterRole(key)} className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', filterRole === key ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>{label}</button>
            ))}
            <div className="w-px bg-gray-200 mx-1" />
            {[{ key: 'all', label: 'All types' }, { key: 'full_time', label: 'Full-time' }, { key: 'part_time', label: 'Part-time' }].map(({ key, label }) => (
              <button key={key} onClick={() => setFilterType(key)} className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', filterType === key ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>{label}</button>
            ))}
          </div>

          {/* Staff list */}
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
                        <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', roleBadge[member.role] || 'bg-gray-100 text-gray-600')}>
                          {member.role.replace('_', ' ')}{member.role === 'manager' && member.is_also_trainer && ' / Trainer'}
                        </span>
                        <span className={member.employment_type === 'part_time' ? 'bg-blue-100 text-blue-700 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium' : 'bg-gray-100 text-gray-600 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium'}>
                          {member.employment_type === 'part_time' ? 'Part-time' : 'Full-time'}
                        </span>
                        <span className={member.is_active ? 'badge-active' : 'badge-inactive'}>{member.is_active ? 'Active' : 'Inactive'}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{member.email}</p>
                      {member.phone ? <p className="text-xs text-gray-400">{member.phone}</p> : <p className="text-xs text-amber-500">⚠ Phone not set</p>}
                      <div className="flex items-center gap-1 mt-1"><Building2 className="w-3 h-3 text-gray-300 flex-shrink-0" /><p className="text-xs text-gray-400">{getGymLabel(member)}</p></div>
                      {member.employment_type === 'part_time' && member.hourly_rate && (
                        <p className="text-xs text-blue-600 mt-0.5 flex items-center gap-1"><Clock className="w-3 h-3" />{formatSGD(member.hourly_rate)}/hr</p>
                      )}
                      {member.date_of_joining && <p className="text-xs text-gray-400 mt-0.5">Joined: {formatDate(member.date_of_joining)}</p>}
                      {member.date_of_departure && <p className="text-xs text-red-400 mt-0.5">Departed: {formatDate(member.date_of_departure)}{member.departure_reason && ` — ${member.departure_reason}`}</p>}
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
          ) : filteredStaff.map(member => (
            <div key={member.id} className="card p-4 opacity-75 border-l-4 border-l-red-200">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0"><span className="text-gray-500 font-semibold text-sm">{member.full_name.charAt(0)}</span></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-700 text-sm">{member.full_name}</p>
                    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', roleBadge[member.role] || 'bg-gray-100 text-gray-600')}>{member.role}</span>
                    <span className="badge-danger">Archived</span>
                  </div>
                  <p className="text-xs text-gray-500">{member.email}</p>
                  {member.date_of_joining && <p className="text-xs text-gray-400 mt-0.5">Joined: {formatDate(member.date_of_joining)}</p>}
                  {member.date_of_departure && <p className="text-xs text-gray-400">Departed: {formatDate(member.date_of_departure)}</p>}
                  {member.archived_at && <p className="text-xs text-red-400 mt-1">Archived: {formatDateTime(member.archived_at)}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
