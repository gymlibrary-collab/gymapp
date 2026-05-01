'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { Client, Package, User } from '@/types'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function NewSessionPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [packages, setPackages] = useState<Package[]>([])
  const [gyms, setGyms] = useState<any[]>([])
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    client_id: '', package_id: '', gym_id: '',
    scheduled_date: '', scheduled_time: '10:00',
    duration_minutes: '60', location: '',
  })
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return
      const { data: userData } = await supabase.from('users').select('*').eq('id', authUser.id).single()
      setCurrentUser(userData)

      const { data: clientData } = await supabase
        .from('clients').select('*').eq('trainer_id', authUser.id).eq('status', 'active').order('full_name')
      setClients(clientData || [])

      const { data: gymData } = await supabase.from('gyms').select('*').eq('is_active', true)
      setGyms(gymData || [])

      // Pre-fill from query params
      const clientId = searchParams.get('client')
      const packageId = searchParams.get('package')
      if (clientId) {
        setForm(f => ({ ...f, client_id: clientId }))
        const { data: pkgData } = await supabase
          .from('packages').select('*').eq('client_id', clientId).eq('status', 'active')
        setPackages(pkgData || [])
        if (packageId) setForm(f => ({ ...f, package_id: packageId }))
      }
    }
    load()
  }, [])

  const handleClientChange = async (clientId: string) => {
    setForm(f => ({ ...f, client_id: clientId, package_id: '' }))
    if (!clientId) { setPackages([]); return }

    const { data } = await supabase
      .from('packages').select('*').eq('client_id', clientId).eq('status', 'active')
    setPackages(data || [])

    // Auto-set gym from client
    const client = clients.find(c => c.id === clientId)
    if (client) setForm(f => ({ ...f, client_id: clientId, gym_id: client.gym_id }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUser) return
    setLoading(true)
    setError('')

    const scheduledAt = new Date(`${form.scheduled_date}T${form.scheduled_time}:00`).toISOString()

    const { error: err } = await supabase.from('sessions').insert({
      client_id: form.client_id,
      package_id: form.package_id,
      trainer_id: currentUser.id,
      gym_id: form.gym_id,
      scheduled_at: scheduledAt,
      duration_minutes: parseInt(form.duration_minutes),
      location: form.location || null,
    })

    if (err) { setError(err.message); setLoading(false) }
    else router.push('/dashboard/sessions')
  }

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }))

  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/sessions" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Schedule Session</h1>
          <p className="text-sm text-gray-500">Book a training session with your client</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card p-4 space-y-4">
        {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">{error}</div>}

        <div>
          <label className="label">Client *</label>
          <select className="input" required value={form.client_id} onChange={e => handleClientChange(e.target.value)}>
            <option value="">Select client...</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </select>
        </div>

        {packages.length > 0 && (
          <div>
            <label className="label">Package *</label>
            <select className="input" required value={form.package_id} onChange={set('package_id')}>
              <option value="">Select package...</option>
              {packages.map(p => (
                <option key={p.id} value={p.id}>
                  {p.package_name} ({p.sessions_used}/{p.total_sessions} used)
                </option>
              ))}
            </select>
          </div>
        )}

        {form.client_id && packages.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
            ⚠️ This client has no active packages. Please assign a package first.
          </div>
        )}

        <div>
          <label className="label">Gym Location *</label>
          <select className="input" required value={form.gym_id} onChange={set('gym_id')}>
            <option value="">Select gym...</option>
            {gyms.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Date *</label>
            <input className="input" type="date" required min={today} value={form.scheduled_date} onChange={set('scheduled_date')} />
          </div>
          <div>
            <label className="label">Time *</label>
            <input className="input" type="time" required value={form.scheduled_time} onChange={set('scheduled_time')} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Duration (minutes)</label>
            <select className="input" value={form.duration_minutes} onChange={set('duration_minutes')}>
              <option value="30">30 min</option>
              <option value="45">45 min</option>
              <option value="60">60 min</option>
              <option value="90">90 min</option>
            </select>
          </div>
          <div>
            <label className="label">Location / Room</label>
            <input className="input" value={form.location} onChange={set('location')} placeholder="e.g. Gym Floor B1" />
          </div>
        </div>

        <button type="submit" disabled={loading || !form.package_id} className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed">
          {loading ? 'Scheduling...' : 'Schedule Session'}
        </button>
      </form>
    </div>
  )
}
