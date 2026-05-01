'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { User, Gym } from '@/types'
import { Plus, UserCheck, ToggleLeft, ToggleRight } from 'lucide-react'

const ROLES = [
  { value: 'trainer', label: 'Personal Trainer' },
  { value: 'manager', label: 'Manager' },
  { value: 'business_ops', label: 'Business Operations' },
]

const roleBadgeClass: Record<string, string> = {
  trainer: 'badge-active',
  manager: 'badge-pending',
  business_ops: 'bg-purple-100 text-purple-700 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
  admin: 'badge-inactive',
}

export default function TrainersPage() {
  const [staff, setStaff] = useState<any[]>([])
  const [gyms, setGyms] = useState<Gym[]>([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    full_name: '', email: '', phone: '', role: 'trainer',
    commission_signup_pct: '10', commission_session_pct: '15',
    gym_ids: [] as string[],
    manager_gym_id: '',
  })
  const supabase = createClient()

  const loadData = async () => {
    const { data: staffData } = await supabase
      .from('users')
      .select('*, trainer_gyms(gym_id, gyms(name)), gyms!users_manager_gym_id_fkey(name)')
      .in('role', ['trainer', 'manager', 'business_ops'])
      .order('full_name')
    setStaff(staffData || [])

    const { data: gymData } = await supabase.from('gyms').select('*').eq('is_active', true)
    setGyms(gymData || [])
  }

  useEffect(() => { loadData() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/trainers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const result = await res.json()

    if (!res.ok) {
      setError(result.error || 'Failed to create account')
      setLoading(false)
      return
    }

    await loadData()
    setShowForm(false)
    setForm({
      full_name: '', email: '', phone: '', role: 'trainer',
      commission_signup_pct: '10', commission_session_pct: '15',
      gym_ids: [], manager_gym_id: '',
    })
    setLoading(false)
  }

  const toggleActive = async (u: User) => {
    await supabase.from('users').update({ is_active: !u.is_active }).eq('id', u.id)
    loadData()
  }

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }))

  const toggleGym = (gymId: string) => {
    setForm(f => ({
      ...f,
      gym_ids: f.gym_ids.includes(gymId)
        ? f.gym_ids.filter(g => g !== gymId)
        : [...f.gym_ids, gymId]
    }))
  }

  const isTrainer = form.role === 'trainer'
  const isManager = form.role === 'manager'

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Staff Management</h1>
          <p className="text-sm text-gray-500">Trainers, Managers and Business Operations</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Add Staff
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card p-4 space-y-3 border-green-200">
          <h2 className="font-semibold text-gray-900 text-sm">Add New Staff Member</h2>
          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">{error}</div>}

          <div>
            <label className="label">Role</label>
            <select className="input" value={form.role} onChange={set('role')}>
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Full Name *</label>
            <input className="input" required value={form.full_name} onChange={set('full_name')} placeholder="e.g. John Lim" />
          </div>

          <div>
            <label className="label">Email Address *</label>
            <input className="input" required type="email" value={form.email} onChange={set('email')} placeholder="john@gym.com" />
            <p className="text-xs text-gray-400 mt-1">They will sign in using this Google account</p>
          </div>

          <div>
            <label className="label">Phone</label>
            <input className="input" value={form.phone} onChange={set('phone')} placeholder="+65 9123 4567" />
          </div>

          {isTrainer && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Sign-up Commission %</label>
                <input className="input" type="number" min="0" max="100" step="0.5" value={form.commission_signup_pct} onChange={set('commission_signup_pct')} />
              </div>
              <div>
                <label className="label">Per-Session Commission %</label>
                <input className="input" type="number" min="0" max="100" step="0.5" value={form.commission_session_pct} onChange={set('commission_session_pct')} />
              </div>
            </div>
          )}

          {isManager && (
            <div>
              <label className="label">Assigned Gym (Manager sees this gym only) *</label>
              <select className="input" required value={form.manager_gym_id} onChange={set('manager_gym_id')}>
                <option value="">Select gym...</option>
                {gyms.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          )}

          {isTrainer && (
            <div>
              <label className="label">Assign to Gym(s) *</label>
              <div className="space-y-2 mt-1">
                {gyms.map(g => (
                  <label key={g.id} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.gym_ids.includes(g.id)}
                      onChange={() => toggleGym(g.id)}
                      className="rounded border-gray-300 text-green-600" />
                    <span className="text-sm text-gray-700">{g.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button type="submit" disabled={loading} className="btn-primary flex-1 disabled:opacity-50">
              {loading ? 'Creating...' : 'Create Account'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      {staff.length === 0 ? (
        <div className="card p-8 text-center">
          <UserCheck className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No staff added yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {staff.map((member: any) => (
            <div key={member.id} className={`card p-4 ${!member.is_active ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-green-700 font-semibold text-sm">{member.full_name.charAt(0)}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 text-sm">{member.full_name}</p>
                      <span className={member.is_active ? 'badge-active' : 'badge-inactive'}>
                        {member.is_active ? 'Active' : 'Inactive'}
                      </span>
                      <span className={roleBadgeClass[member.role] || 'badge-inactive'}>
                        {ROLES.find(r => r.value === member.role)?.label || member.role}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">{member.email}</p>
                    {member.role === 'trainer' && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        Commission: {member.commission_signup_pct}% sign-up · {member.commission_session_pct}% per session
                      </p>
                    )}
                    {member.role === 'manager' && member.gyms?.name && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        Gym: {member.gyms.name}
                      </p>
                    )}
                    {member.role === 'trainer' && member.trainer_gyms?.length > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {member.trainer_gyms.map((tg: any) => tg.gyms?.name).filter(Boolean).join(', ')}
                      </p>
                    )}
                    {member.role === 'business_ops' && (
                      <p className="text-xs text-gray-400 mt-0.5">View access to all gyms</p>
                    )}
                  </div>
                </div>
                <button onClick={() => toggleActive(member)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
                  {member.is_active
                    ? <ToggleRight className="w-4 h-4 text-green-600" />
                    : <ToggleLeft className="w-4 h-4" />
                  }
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
