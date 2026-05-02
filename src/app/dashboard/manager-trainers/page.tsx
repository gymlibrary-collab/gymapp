'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { User } from '@/types'
import { Plus, UserMinus, UserPlus, Search, Dumbbell, AlertCircle, Edit2, X, Save, CheckCircle } from 'lucide-react'

export default function ManagerTrainersPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [gymId, setGymId] = useState<string | null>(null)
  const [gymName, setGymName] = useState('')
  const [myTrainers, setMyTrainers] = useState<User[]>([])
  const [unassignedTrainers, setUnassignedTrainers] = useState<User[]>([])
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showCreateNew, setShowCreateNew] = useState(false)
  const [editingTrainer, setEditingTrainer] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)

  const [newForm, setNewForm] = useState({
    full_name: '', email: '', phone: '',
    commission_signup_pct: '10', commission_session_pct: '15',
  })

  const [editForm, setEditForm] = useState({
    full_name: '', email: '', phone: '',
    commission_signup_pct: '10', commission_session_pct: '15',
  })

  const supabase = createClient()

  const showMsg = (msg: string) => {
    setSuccess(msg); setTimeout(() => setSuccess(''), 3000)
  }

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return
    const { data: userData } = await supabase.from('users').select('*').eq('id', authUser.id).single()
    setCurrentUser(userData)

    if (!userData?.manager_gym_id) { setLoading(false); return }
    setGymId(userData.manager_gym_id)

    const { data: gym } = await supabase.from('gyms').select('name').eq('id', userData.manager_gym_id).single()
    setGymName(gym?.name || '')

    // Trainers currently in this gym
    const { data: gymTrainers } = await supabase
      .from('trainer_gyms')
      .select('trainer_id, users(*)')
      .eq('gym_id', userData.manager_gym_id)
    const myList = gymTrainers?.map((t: any) => t.users).filter(Boolean) || []
    setMyTrainers(myList)

    // All active trainers NOT in any gym at all
    // Step 1: get all assigned trainer_ids
    const { data: allAssignments } = await supabase
      .from('trainer_gyms')
      .select('trainer_id')

    const assignedSet = new Set((allAssignments || []).map((a: any) => a.trainer_id))

    // Step 2: get all active trainers
    const { data: allTrainers } = await supabase
      .from('users')
      .select('*')
      .eq('role', 'trainer')
      .eq('is_active', true)
      .eq('is_archived', false)

    // Step 3: filter out assigned ones
    const unassigned = (allTrainers || []).filter(t => !assignedSet.has(t.id))
    setUnassignedTrainers(unassigned)

    setLoading(false)
  }

  const handleAddExisting = async (trainerId: string) => {
    if (!gymId) return
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('trainer_gyms').insert({
      trainer_id: trainerId,
      gym_id: gymId,
      is_primary: true,
    })
    if (err) {
      setError(err.message)
    } else {
      showMsg('Trainer added to your gym')
      setShowAdd(false)
    }
    await loadData()
    setSaving(false)
  }

  const handleRemove = async (trainerId: string, trainerName: string) => {
    if (!confirm(`Remove ${trainerName} from ${gymName}? Their account will remain active.`)) return
    await supabase.from('trainer_gyms').delete()
      .eq('trainer_id', trainerId).eq('gym_id', gymId!)
    showMsg(`${trainerName} removed from ${gymName}`)
    await loadData()
  }

  const handleCreateNew = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!gymId) return
    setSaving(true); setError('')

    const res = await fetch('/api/trainers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newForm, role: 'trainer', gym_ids: [gymId] }),
    })
    const result = await res.json()
    if (!res.ok) { setError(result.error || 'Failed'); setSaving(false); return }

    setShowCreateNew(false)
    setNewForm({ full_name: '', email: '', phone: '', commission_signup_pct: '10', commission_session_pct: '15' })
    showMsg('New trainer created and added to your gym')
    setSaving(false)
    await loadData()
  }

  const openEditTrainer = (trainer: User) => {
    setEditingTrainer(trainer)
    setEditForm({
      full_name: trainer.full_name,
      email: trainer.email,
      phone: trainer.phone || '',
      commission_signup_pct: trainer.commission_signup_pct?.toString() || '10',
      commission_session_pct: trainer.commission_session_pct?.toString() || '15',
    })
    setShowAdd(false)
    setShowCreateNew(false)
    setError('')
  }

  const handleEditTrainer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingTrainer) return
    setSaving(true); setError('')

    const res = await fetch('/api/trainers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: editingTrainer.id, ...editForm }),
    })
    const result = await res.json()
    if (!res.ok) { setError(result.error || 'Failed'); setSaving(false); return }

    setEditingTrainer(null)
    showMsg('Trainer profile updated')
    setSaving(false)
    await loadData()
  }

  const filteredMine = myTrainers.filter(t =>
    t.full_name.toLowerCase().includes(search.toLowerCase()) ||
    t.email.toLowerCase().includes(search.toLowerCase()) ||
    (t.phone || '').includes(search)
  )

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600" />
    </div>
  )

  if (!gymId) return (
    <div className="card p-8 text-center">
      <AlertCircle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
      <p className="text-gray-700 font-medium">No gym assigned</p>
      <p className="text-sm text-gray-500 mt-1">Ask your admin to assign you to a gym club.</p>
    </div>
  )

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">My Trainers</h1>
          <p className="text-sm text-gray-500">{gymName} · {myTrainers.length} trainer{myTrainers.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setShowAdd(!showAdd); setShowCreateNew(false); setEditingTrainer(null) }}
            className="btn-secondary flex items-center gap-1.5 text-xs">
            <UserPlus className="w-3.5 h-3.5" /> Add Existing
          </button>
          <button onClick={() => { setShowCreateNew(!showCreateNew); setShowAdd(false); setEditingTrainer(null) }}
            className="btn-primary flex items-center gap-1.5 text-xs">
            <Plus className="w-3.5 h-3.5" /> Create New
          </button>
        </div>
      </div>

      {/* Banners */}
      {success && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
          <CheckCircle className="w-4 h-4 flex-shrink-0" /> {success}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          <button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Add existing panel */}
      {showAdd && (
        <div className="card p-4 space-y-3 border-blue-200 bg-blue-50">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-900">Add Existing Trainer to {gymName}</p>
            <button onClick={() => setShowAdd(false)}><X className="w-4 h-4 text-gray-400" /></button>
          </div>
          <p className="text-xs text-gray-500">Only trainers not currently assigned to any gym are shown below.</p>
          {unassignedTrainers.length === 0 ? (
            <div className="bg-white rounded-lg p-4 text-center border border-gray-200">
              <p className="text-sm text-gray-500">No unassigned trainers available</p>
              <p className="text-xs text-gray-400 mt-1">All active trainers are already assigned to a gym. Use "Create New" to add a new trainer.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {unassignedTrainers.map(t => (
                <div key={t.id} className="flex items-center justify-between bg-white rounded-lg p-3 border border-gray-200">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{t.full_name}</p>
                    <p className="text-xs text-gray-500">{t.email}</p>
                  </div>
                  <button onClick={() => handleAddExisting(t.id)} disabled={saving}
                    className="btn-primary text-xs py-1.5 flex items-center gap-1 disabled:opacity-50">
                    <UserPlus className="w-3.5 h-3.5" /> Add
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create new form */}
      {showCreateNew && (
        <form onSubmit={handleCreateNew} className="card p-4 space-y-3 border-green-200">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-900">Create New Trainer for {gymName}</p>
            <button type="button" onClick={() => setShowCreateNew(false)}><X className="w-4 h-4 text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Full Name *</label>
              <input className="input" required value={newForm.full_name}
                onChange={e => setNewForm(f => ({ ...f, full_name: e.target.value }))} placeholder="e.g. Sarah Tan" />
            </div>
            <div>
              <label className="label">Email *</label>
              <input className="input" required type="email" value={newForm.email}
                onChange={e => setNewForm(f => ({ ...f, email: e.target.value }))} placeholder="sarah@gym.com" />
            </div>
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" value={newForm.phone}
              onChange={e => setNewForm(f => ({ ...f, phone: e.target.value }))} placeholder="+65 9123 4567" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Sign-up Commission %</label>
              <input className="input" type="number" min="0" max="100" step="0.5"
                value={newForm.commission_signup_pct}
                onChange={e => setNewForm(f => ({ ...f, commission_signup_pct: e.target.value }))} />
            </div>
            <div>
              <label className="label">Session Commission %</label>
              <input className="input" type="number" min="0" max="100" step="0.5"
                value={newForm.commission_session_pct}
                onChange={e => setNewForm(f => ({ ...f, commission_session_pct: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary flex-1 disabled:opacity-50">
              {saving ? 'Creating...' : 'Create Trainer'}
            </button>
            <button type="button" onClick={() => setShowCreateNew(false)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      {/* Edit trainer form */}
      {editingTrainer && (
        <form onSubmit={handleEditTrainer} className="card p-4 space-y-3 border-blue-200">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-900">Edit: {editingTrainer.full_name}</p>
            <button type="button" onClick={() => setEditingTrainer(null)}><X className="w-4 h-4 text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Full Name *</label>
              <input className="input" required value={editForm.full_name}
                onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div>
              <label className="label">Email Address *</label>
              <input className="input" required type="email" value={editForm.email}
                onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" value={editForm.phone}
              onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Sign-up Commission %</label>
              <input className="input" type="number" min="0" max="100" step="0.5"
                value={editForm.commission_signup_pct}
                onChange={e => setEditForm(f => ({ ...f, commission_signup_pct: e.target.value }))} />
            </div>
            <div>
              <label className="label">Session Commission %</label>
              <input className="input" type="number" min="0" max="100" step="0.5"
                value={editForm.commission_session_pct}
                onChange={e => setEditForm(f => ({ ...f, commission_session_pct: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50">
              <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button type="button" onClick={() => setEditingTrainer(null)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      {/* Search */}
      {myTrainers.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="input pl-9" placeholder="Search trainers..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      )}

      {/* Trainer list */}
      {filteredMine.length === 0 ? (
        <div className="card p-8 text-center">
          <Dumbbell className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">
            {myTrainers.length === 0 ? 'No trainers in this gym yet' : 'No trainers match your search'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredMine.map(trainer => (
            <div key={trainer.id} className="card p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-green-700 font-semibold text-sm">{trainer.full_name.charAt(0)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-900 text-sm truncate">{trainer.full_name}</p>
                  <span className={trainer.is_active ? 'badge-active' : 'badge-inactive'}>
                    {trainer.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 truncate">{trainer.email}</p>
                {trainer.phone && <p className="text-xs text-gray-400">{trainer.phone}</p>}
                <p className="text-xs text-gray-400 mt-0.5">
                  Commission: {trainer.commission_signup_pct}% sign-up · {trainer.commission_session_pct}% session
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => openEditTrainer(trainer)}
                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Edit trainer">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button onClick={() => handleRemove(trainer.id, trainer.full_name)}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="Remove from gym">
                  <UserMinus className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
