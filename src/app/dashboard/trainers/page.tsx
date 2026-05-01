'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { User, Gym } from '@/types'
import { formatSGD } from '@/lib/utils'
import { Plus, UserCheck, ToggleLeft, ToggleRight } from 'lucide-react'

export default function TrainersPage() {
  const [trainers, setTrainers] = useState<User[]>([])
  const [gyms, setGyms] = useState<Gym[]>([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    full_name: '', email: '', phone: '',
    commission_signup_pct: '10', commission_session_pct: '15',
    gym_ids: [] as string[], role: 'trainer',
  })
  const supabase = createClient()

  const loadData = async () => {
    const { data: trainerData } = await supabase
      .from('users')
      .select('*, trainer_gyms(gym_id, is_primary, gyms(name))')
      .in('role', ['trainer', 'manager'])
      .order('full_name')
    setTrainers(trainerData || [])

    const { data: gymData } = await supabase.from('gyms').select('*').eq('is_active', true)
    setGyms(gymData || [])
  }

  useEffect(() => { loadData() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    // Create user via admin API route (needs service role)
    const res = await fetch('/api/trainers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const result = await res.json()

    if (!res.ok) { setError(result.error || 'Failed to create trainer'); setLoading(false); return }

    await loadData()
    setShowForm(false)
    setForm({ full_name: '', email: '', phone: '', commission_signup_pct: '10', commission_session_pct: '15', gym_ids: [], role: 'trainer' })
    setLoading(false)
  }

  const toggleActive = async (trainer: User) => {
    await supabase.from('users').update({ is_active: !trainer.is_active }).eq('id', trainer.id)
    loadData()
  }

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }))

  const toggleGym = (gymId: string) => {
    setForm(f => ({
      ...f,
      gym_ids: f.gym_ids.includes(gymId) ? f.gym_ids.filter(g => g !== gymId) : [...f.gym_ids, gymId]
    }))
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Trainers & Managers</h1>
          <p className="text-sm text-gray-500">Manage staff accounts and commission rates</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Add Staff
        </button>
      </div>

      {/* Commission rates info */}
      <div className="card p-3 bg-green-50 border-green-200">
        <p className="text-xs text-green-700 font-medium">Global Commission Rates</p>
        <p className="text-xs text-green-600 mt-1">
          All trainers use the same base rates unless overridden individually. Current default: 10% on sign-up · 15% per session completed.
        </p>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card p-4 space-y-3 border-green-200">
          <h2 className="font-semibold text-gray-900 text-sm">Add New Staff Member</h2>
          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">{error}</div>}

          <div>
            <label className="label">Role</label>
            <select className="input" value={form.role} onChange={set('role')}>
              <option value="trainer">Personal Trainer</option>
              <option value="manager">Manager</option>
            </select>
          </div>

          <div>
            <label className="label">Full Name *</label>
            <input className="input" required value={form.full_name} onChange={set('full_name')} placeholder="e.g. John Lim" />
          </div>

          <div>
            <label className="label">Email Address *</label>
            <input className="input" required type="email" value={form.email} onChange={set('email')} placeholder="john@gymapp.com" />
            <p className="text-xs text-gray-400 mt-1">They will receive a Google sign-in invitation to this email</p>
          </div>

          <div>
            <label className="label">Phone</label>
            <input className="input" value={form.phone} onChange={set('phone')} placeholder="+65 9123 4567" />
          </div>

          {form.role === 'trainer' && (
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

          <div>
            <label className="label">Assign to Gym(s) *</label>
            <div className="space-y-2 mt-1">
              {gyms.map(g => (
                <label key={g.id} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.gym_ids.includes(g.id)} onChange={() => toggleGym(g.id)}
                    className="rounded border-gray-300 text-green-600" />
                  <span className="text-sm text-gray-700">{g.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={loading || form.gym_ids.length === 0} className="btn-primary flex-1 disabled:opacity-50">
              {loading ? 'Creating...' : 'Create Account'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      {trainers.length === 0 ? (
        <div className="card p-8 text-center">
          <UserCheck className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No staff added yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {trainers.map((trainer: any) => (
            <div key={trainer.id} className={`card p-4 ${!trainer.is_active ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <span className="text-green-700 font-semibold text-sm">{trainer.full_name.charAt(0)}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900 text-sm">{trainer.full_name}</p>
                      <span className={trainer.is_active ? 'badge-active' : 'badge-inactive'}>
                        {trainer.is_active ? 'Active' : 'Inactive'}
                      </span>
                      <span className="badge-inactive capitalize">{trainer.role}</span>
                    </div>
                    <p className="text-xs text-gray-500">{trainer.email}</p>
                    {trainer.role === 'trainer' && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        Commission: {trainer.commission_signup_pct}% sign-up · {trainer.commission_session_pct}% per session
                      </p>
                    )}
                    {trainer.trainer_gyms?.length > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {trainer.trainer_gyms.map((tg: any) => tg.gyms?.name).filter(Boolean).join(', ')}
                      </p>
                    )}
                  </div>
                </div>
                <button onClick={() => toggleActive(trainer)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
                  {trainer.is_active ? <ToggleRight className="w-4 h-4 text-green-600" /> : <ToggleLeft className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
