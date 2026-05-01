'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { Gym } from '@/types'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function NewClientPage() {
  const [gyms, setGyms] = useState<Gym[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    full_name: '', phone: '', email: '', date_of_birth: '',
    gender: '', health_notes: '', gym_id: '',
  })
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const loadGyms = async () => {
      const { data } = await supabase.from('gyms').select('*').eq('is_active', true)
      setGyms(data || [])
      if (data?.length === 1) setForm(f => ({ ...f, gym_id: data[0].id }))
    }
    loadGyms()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error: err } = await supabase.from('clients').insert({
      ...form,
      trainer_id: user.id,
      date_of_birth: form.date_of_birth || null,
      email: form.email || null,
      gender: form.gender || null,
      health_notes: form.health_notes || null,
    })

    if (err) {
      setError(err.message)
      setLoading(false)
    } else {
      router.push('/dashboard/clients')
    }
  }

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }))

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/clients" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Add New Client</h1>
          <p className="text-sm text-gray-500">Fill in the client's details</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card p-4 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <div>
          <label className="label">Full Name *</label>
          <input className="input" required value={form.full_name} onChange={set('full_name')} placeholder="e.g. Sarah Tan" />
        </div>

        <div>
          <label className="label">Phone Number *</label>
          <input className="input" required value={form.phone} onChange={set('phone')} placeholder="+65 9123 4567" type="tel" />
        </div>

        <div>
          <label className="label">Email</label>
          <input className="input" value={form.email} onChange={set('email')} placeholder="sarah@email.com" type="email" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Date of Birth</label>
            <input className="input" type="date" value={form.date_of_birth} onChange={set('date_of_birth')} />
          </div>
          <div>
            <label className="label">Gender</label>
            <select className="input" value={form.gender} onChange={set('gender')}>
              <option value="">Select...</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
              <option value="prefer_not_to_say">Prefer not to say</option>
            </select>
          </div>
        </div>

        <div>
          <label className="label">Gym Location *</label>
          <select className="input" required value={form.gym_id} onChange={set('gym_id')}>
            <option value="">Select gym...</option>
            {gyms.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>

        <div>
          <label className="label">Health Notes / Medical Conditions</label>
          <textarea
            className="input min-h-[80px] resize-none"
            value={form.health_notes}
            onChange={set('health_notes')}
            placeholder="Any injuries, medical conditions, or notes to be aware of..."
          />
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'Saving...' : 'Add Client'}
        </button>
      </form>
    </div>
  )
}
