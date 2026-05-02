'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useViewMode } from '@/lib/view-mode-context'
import { Session, User } from '@/types'
import { formatDateTime, formatSGD } from '@/lib/utils'
import { Calendar, Clock, CheckCircle, XCircle, AlertCircle, Plus } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

const statusIcons = {
  scheduled: Clock, completed: CheckCircle, cancelled: XCircle, no_show: AlertCircle,
}
const statusColors = {
  scheduled: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-600',
  no_show: 'bg-red-100 text-red-700',
}

export default function SessionsPage() {
  const [user, setUser] = useState<User | null>(null)
  const [sessions, setSessions] = useState<any[]>([])
  const [filter, setFilter] = useState('upcoming')
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  // ── KEY FIX: read isActingAsTrainer from context, not from user.is_also_trainer ──
  const { isActingAsTrainer } = useViewMode()

  const loadSessions = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return
    const { data: userData } = await supabase.from('users').select('*').eq('id', authUser.id).single()
    setUser(userData)

    let query = supabase
      .from('sessions')
      .select('*, clients(full_name, phone), gyms(name), packages(package_name)')
      .order('scheduled_at', { ascending: filter === 'upcoming' })

    // Scope data based on effective role from context
    if (isActingAsTrainer) {
      // Trainer view: only own sessions
      query = query.eq('trainer_id', authUser.id)
    } else if (userData?.role === 'manager' && userData?.manager_gym_id) {
      // Manager view: all sessions in their gym
      query = query.eq('gym_id', userData.manager_gym_id)
    } else if (userData?.role === 'trainer') {
      // Pure trainer: own sessions
      query = query.eq('trainer_id', authUser.id)
    }

    const now = new Date().toISOString()
    if (filter === 'upcoming') query = query.gte('scheduled_at', now).eq('status', 'scheduled')
    else if (filter === 'completed') query = query.eq('status', 'completed')

    const { data } = await query.limit(50)
    setSessions(data || [])
    setLoading(false)
  }

  useEffect(() => { loadSessions() }, [filter, isActingAsTrainer])

  const handleMarkComplete = async (sessionId: string) => {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return
    const session = sessions.find(s => s.id === sessionId)
    const { data: pkg } = await supabase
      .from('packages').select('session_commission_pct, price_per_session_sgd').eq('id', session?.package_id).single()
    const commissionSgd = pkg ? pkg.price_per_session_sgd * pkg.session_commission_pct / 100 : 0

    await supabase.from('sessions').update({
      status: 'completed',
      session_commission_pct: pkg?.session_commission_pct,
      session_commission_sgd: commissionSgd,
      marked_complete_by: authUser.id,
      marked_complete_at: new Date().toISOString(),
    }).eq('id', sessionId)

    if (session?.package_id) {
      const { data: pkgData } = await supabase.from('packages').select('sessions_used').eq('id', session.package_id).single()
      if (pkgData) await supabase.from('packages').update({ sessions_used: pkgData.sessions_used + 1 }).eq('id', session.package_id)
    }
    loadSessions()
  }

  // Manager role (in manager view) can mark complete; trainer cannot
  const isManagerView = user?.role === 'manager' && !isActingAsTrainer
  const isBusinessOps = user?.role === 'business_ops'

  if (loading) return <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {isActingAsTrainer ? 'My Sessions' : 'Sessions'}
          </h1>
          <p className="text-sm text-gray-500">{sessions.length} session{sessions.length !== 1 ? 's' : ''}</p>
        </div>
        {/* Schedule button ONLY in trainer view */}
        {isActingAsTrainer && (
          <Link href="/dashboard/sessions/new" className="btn-primary flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Schedule
          </Link>
        )}
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {[{ key: 'upcoming', label: 'Upcoming' }, { key: 'completed', label: 'Completed' }, { key: 'all', label: 'All' }].map(({ key, label }) => (
          <button key={key} onClick={() => setFilter(key)}
            className={cn('flex-1 py-1.5 rounded-md text-xs font-medium transition-colors',
              filter === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600')}>
            {label}
          </button>
        ))}
      </div>

      {sessions.length === 0 ? (
        <div className="card p-8 text-center">
          <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No sessions found</p>
          {isActingAsTrainer && (
            <Link href="/dashboard/sessions/new" className="btn-primary inline-block mt-3">
              Schedule a session
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map(session => {
            const Icon = statusIcons[session.status as keyof typeof statusIcons] || Clock
            return (
              <div key={session.id} className="card p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Icon className={cn('w-4 h-4 flex-shrink-0',
                      session.status === 'completed' ? 'text-green-600' :
                      session.status === 'scheduled' ? 'text-blue-600' : 'text-gray-400')} />
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{session.clients?.full_name}</p>
                      <p className="text-xs text-gray-500">{formatDateTime(session.scheduled_at)}</p>
                    </div>
                  </div>
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium capitalize flex-shrink-0',
                    statusColors[session.status as keyof typeof statusColors])}>
                    {session.status}
                  </span>
                </div>

                {session.packages?.package_name && (
                  <p className="text-xs text-gray-500 pl-6">
                    {session.packages.package_name} · {session.gyms?.name}
                  </p>
                )}

                {session.performance_notes && (
                  <p className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2 ml-6">
                    {session.performance_notes}
                  </p>
                )}

                {session.status === 'completed' && session.session_commission_sgd > 0 && (
                  <p className="text-xs text-green-600 font-medium pl-6">
                    Commission: {formatSGD(session.session_commission_sgd)}
                  </p>
                )}

                <div className="flex gap-2 pl-6 pt-1">
                  {/* Mark complete: manager view or business ops only */}
                  {(isManagerView || isBusinessOps) && session.status === 'scheduled' && (
                    <button onClick={() => handleMarkComplete(session.id)} className="btn-primary text-xs py-1.5">
                      Mark Complete
                    </button>
                  )}
                  {/* Session notes: trainer view only */}
                  {isActingAsTrainer && session.status === 'completed' && (
                    <Link href={`/dashboard/sessions/${session.id}/notes`} className="btn-secondary text-xs py-1.5">
                      {session.performance_notes ? 'Edit Notes' : 'Add Notes'}
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
