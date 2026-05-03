'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { formatDate } from '@/lib/utils'
import { ArrowLeft, Calendar, AlertCircle, CheckCircle } from 'lucide-react'
import Link from 'next/link'

export default function NewPtSessionPage() {
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [members, setMembers] = useState<any[]>([])
  const [packages, setPackages] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()

  const [form, setForm] = useState({
    member_id: searchParams.get('member') || '',
    package_id: searchParams.get('package') || '',
    scheduled_at_date: '',
    scheduled_at_time: '09:00',
    duration_minutes: '60',
    location: '',
    notes: '',
  })

  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return
      const { data: userData } = await supabase.from('users').select('*').eq('id', authUser.id).single()
      setCurrentUser(userData)

      // Load members with active PT packages for this trainer
      const { data: pkgData } = await supabase
        .from('packages')
        .select('*, member:members(full_name, phone)')
        .eq('trainer_id', authUser.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
      setPackages(pkgData || [])

      // Unique members from packages
      const memberMap = new Map()
      pkgData?.forEach((p: any) => {
        if (p.member) memberMap.set(p.member_id, { id: p.member_id, ...p.member })
      })
      setMembers(Array.from(memberMap.values()))

      // Auto-select package if pre-filled
      if (form.member_id && !form.package_id) {
        const memberPkgs = pkgData?.filter((p: any) => p.member_id === form.member_id)
        if (memberPkgs?.length === 1) setForm(f => ({ ...f, package_id: memberPkgs[0].id }))
      }
    }
    load()
  }, [])

  // When member changes, filter packages to that member
  const memberPackages = packages.filter(p => p.member_id === form.member_id)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.member_id || !form.package_id || !form.scheduled_at_date) {
      setError('Please fill in all required fields'); return
    }
    setSaving(true); setError('')

    const scheduledAt = new Date(`${form.scheduled_at_date}T${form.scheduled_at_time}:00`)
    const pkg = packages.find(p => p.id === form.package_id)

    // Check sessions remaining
    if (pkg && pkg.sessions_used >= pkg.total_sessions) {
      setError('This package has no sessions remaining'); setSaving(false); return
    }
    // Check expiry
    if (pkg?.end_date_calculated && new Date(pkg.end_date_calculated) < new Date()) {
      setError('This package has expired'); setSaving(false); return
    }

    const { error: err } = await supabase.from('sessions').insert({
      package_id: form.package_id,
      member_id: form.member_id,
      client_id: form.member_id, // legacy
      trainer_id: currentUser.id,
      gym_id: pkg?.gym_id,
      scheduled_at: scheduledAt.toISOString(),
      duration_minutes: parseInt(form.duration_minutes),
      location: form.location || null,
      status: 'scheduled',
      session_commission_pct: currentUser.commission_session_pct || 15,
    })

    if (err) { setError(err.message); setSaving(false); return }

    // Queue WhatsApp reminder 24h before
    const reminderAt = new Date(scheduledAt.getTime() - 24 * 60 * 60 * 1000)
    if (reminderAt > new Date()) {
      const member = members.find(m => m.id === form.member_id)
      if (currentUser.phone) {
        await supabase.from('whatsapp_queue').insert({
          notification_type: 'pt_reminder_24h',
          recipient_phone: currentUser.phone,
          recipient_name: currentUser.full_name,
          message: `Reminder: PT session tomorrow at ${scheduledAt.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })} with ${member?.full_name}`,
          scheduled_for: reminderAt.toISOString(),
          status: 'pending',
        })
      }
    }

    router.push('/dashboard/pt/sessions')
  }

  const selectedPkg = packages.find(p => p.id === form.package_id)

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/pt/sessions" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Schedule PT Session</h1>
          <p className="text-sm text-gray-500">Book a session for one of your active packages</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card p-4 space-y-4">
        <div>
          <label className="label">Member *</label>
          <select className="input" required value={form.member_id}
            onChange={e => setForm(f => ({ ...f, member_id: e.target.value, package_id: '' }))}>
            <option value="">Select member...</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
          {members.length === 0 && (
            <p className="text-xs text-amber-600 mt-1">No members with active PT packages found.</p>
          )}
        </div>

        {form.member_id && (
          <div>
            <label className="label">PT Package *</label>
            <select className="input" required value={form.package_id}
              onChange={e => setForm(f => ({ ...f, package_id: e.target.value }))}>
              <option value="">Select package...</option>
              {memberPackages.map(p => (
                <option key={p.id} value={p.id}>
                  {p.package_name} ({p.total_sessions - p.sessions_used} sessions left)
                  {p.end_date_calculated ? ` · expires ${formatDate(p.end_date_calculated)}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {selectedPkg && (
          <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-xs text-red-700">
            {selectedPkg.sessions_used}/{selectedPkg.total_sessions} sessions used
            {selectedPkg.end_date_calculated && ` · Valid until ${formatDate(selectedPkg.end_date_calculated)}`}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Date *</label>
            <input className="input" type="date" required value={form.scheduled_at_date}
              min={new Date().toISOString().split('T')[0]}
              onChange={e => setForm(f => ({ ...f, scheduled_at_date: e.target.value }))} />
          </div>
          <div>
            <label className="label">Time *</label>
            <input className="input" type="time" required value={form.scheduled_at_time}
              onChange={e => setForm(f => ({ ...f, scheduled_at_time: e.target.value }))} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Duration (minutes)</label>
            <select className="input" value={form.duration_minutes}
              onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))}>
              <option value="30">30 min</option>
              <option value="45">45 min</option>
              <option value="60">60 min</option>
              <option value="90">90 min</option>
              <option value="120">120 min</option>
            </select>
          </div>
          <div>
            <label className="label">Location</label>
            <input className="input" value={form.location}
              onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
              placeholder="e.g. Zone A, Weights" />
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 flex items-start gap-2">
          <Calendar className="w-4 h-4 flex-shrink-0 mt-0.5" />
          A WhatsApp reminder will be sent to you 24 hours before the session.
        </div>

        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="btn-primary flex-1 disabled:opacity-50">
            {saving ? 'Scheduling...' : 'Schedule Session'}
          </button>
          <Link href="/dashboard/pt/sessions" className="btn-secondary">Cancel</Link>
        </div>
      </form>
    </div>
  )
}
