'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { useViewMode } from '@/lib/view-mode-context'
import { formatDateTime, formatSGD } from '@/lib/utils'
import {
  Calendar, Clock, CheckCircle, XCircle, AlertCircle,
  Plus, X, Save, RotateCcw, ChevronDown, ChevronUp
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useCurrentUser } from '@/hooks/useCurrentUser'

export default function PtSessionsPage() {
  const { user, loading } = useCurrentUser({ allowedRoles: ['trainer', 'manager', 'business_ops'] })

  const { logActivity } = useActivityLog()
  const [sessions, setSessions] = useState<any[]>([])
  const [filter, setFilter] = useState('upcoming')
  const [actionSession, setActionSession] = useState<any>(null)
  const [actionType, setActionType] = useState<'cancel' | 'reschedule' | 'complete' | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleTime, setRescheduleTime] = useState('')
  const [saving, setSaving] = useState(false)
  const supabase = createClient()
  const router = useRouter()
  const { isActingAsTrainer } = useViewMode()


  const loadSessions = async () => {    // detail is reviewed in person with each gym manager.
    // Block roles that should not access session list
    

    let q = supabase.from('sessions')
      .select('*, member:members(full_name, phone), trainer:users!sessions_trainer_id_fkey(full_name), gym:gyms(name), package:packages(package_name, total_sessions, sessions_used)')
      .order('scheduled_at', { ascending: filter === 'upcoming' })

    const isTrainer = user.role === 'trainer' || isActingAsTrainer
    const isStaff = user.role === 'staff'
    const gymId = user.manager_gym_id

    if (gymId && !isStaff) q = q.eq('gym_id', gymId)
    else if (isStaff && user.manager_gym_id) {
      // Staff sees upcoming scheduled sessions at their gym only (for operational support)
      q = q.eq('gym_id', user.manager_gym_id).eq('status', 'scheduled')
    }
    else if (user.role === 'trainer') {
      // My Sessions: own sessions only, all statuses, all assigned gyms
      q = q.eq('trainer_id', user.id)
    }

    // isActingAsTrainer (manager in trainer view): always own sessions
    if (isActingAsTrainer) q = q.eq('trainer_id', user.id)

    const now = new Date().toISOString()
    if (filter === 'upcoming') q = q.gte('scheduled_at', now).eq('status', 'scheduled')
    else if (filter === 'pending_confirm') {
      q = q.eq('status', 'completed').eq('is_notes_complete', true).eq('manager_confirmed', false)
      const isBizOpsRole = user?.role === 'business_ops'
      q = q.eq('escalated_to_biz_ops', isBizOpsRole)
      if (!isBizOpsRole && user?.manager_gym_id) q = q.eq('gym_id', user.manager_gym_id)
    }
    else if (filter === 'completed') q = q.eq('status', 'completed').eq('manager_confirmed', true)
    else if (filter === 'cancelled') q = q.in('status', ['cancelled', 'no_show'])

    const { data } = await q.limit(60)
    setSessions(data || [])
  }

  useEffect(() => { loadSessions() }, [filter, isActingAsTrainer])

  if (loading || !user) return null

  const isManager = user?.role === 'manager' && !isActingAsTrainer
  const isTrainer = user?.role === 'trainer' || isActingAsTrainer
  const isStaff = user?.role === 'staff'

  const handleManagerConfirm = async (sessionId: string) => {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    await supabase.from('sessions').update({
      manager_confirmed: true, manager_confirmed_by: authUser!.id,
      manager_confirmed_at: new Date().toISOString(),
    }).eq('id', sessionId)
    loadSessions()
  }

  const openAction = (session: any, type: 'cancel' | 'reschedule' | 'complete') => {
    setActionSession(session); setActionType(type)
    setCancelReason(''); setRescheduleDate(''); setRescheduleTime('')
  }

  const handleMarkComplete = async (session: any, status: 'completed' | 'no_show') => {
    setSaving(true)
    const { data: { user: authUser } } = await supabase.auth.getUser()
    const pkg = session.package
    const commissionSgd = pkg
      ? (session.session_commission_pct || 0) * (pkg.total_price_sgd / pkg.total_sessions || 0) / 100
      : 0

    // Calculate new sessions_used before writing so we can store is_last_session
    // on the session row at the same time — avoids a timing ambiguity where the
    // notes page recomputes last-session from an already-incremented sessions_used.
    const newSessionsUsed = (pkg?.sessions_used || 0) + 1
    const isLastSession = pkg ? newSessionsUsed >= pkg.total_sessions : false

    await supabase.from('sessions').update({
      status, marked_complete_by: authUser!.id,
      marked_complete_at: new Date().toISOString(),
      session_commission_sgd: status === 'completed' ? commissionSgd : 0,
      // Store the last-session flag now so the notes page reads it directly
      // from the DB rather than recomputing from an already-incremented count.
      is_last_session: status === 'completed' ? isLastSession : false,
    }).eq('id', session.id)

    if (status === 'completed' && pkg) {
      // Close the package immediately when all sessions are consumed so the
      // DB reflects reality without waiting for a member-profile visit.
      const pkgUpdate: any = { sessions_used: newSessionsUsed }
      if (isLastSession) pkgUpdate.status = 'completed'
      await supabase.from('packages').update(pkgUpdate).eq('id', session.package_id)
    }
    const rMemberName = actionSession?.member?.full_name || actionSession?.members?.full_name || ''
    const newDateStr = new Date(`${rescheduleDate}T${rescheduleTime}`).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })
    logActivity('update', 'PT Sessions', `Rescheduled session with ${rMemberName} to ${newDateStr}`)
    setActionSession(null); setActionType(null); setSaving(false); loadSessions()
    logActivity('update', 'PT Sessions', 'Marked PT session as completed')
  }

  const handleCancel = async () => {
    if (!cancelReason.trim()) return
    setSaving(true)
    const { data: { user: authUser } } = await supabase.auth.getUser()
    await supabase.from('sessions').update({
      status: 'cancelled', cancellation_reason: cancelReason,
      cancelled_by: authUser!.id, cancelled_at: new Date().toISOString(),
    }).eq('id', actionSession.id)
    const memberName = actionSession?.member?.full_name || actionSession?.members?.full_name || ''
    const sessionDate = actionSession?.scheduled_at ? new Date(actionSession.scheduled_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' }) : ''
    logActivity('update', 'PT Sessions', `Cancelled session with ${memberName} on ${sessionDate}`)
    setActionSession(null); setActionType(null); setCancelReason(''); setSaving(false); loadSessions()
  }

  const handleReschedule = async () => {
    if (!rescheduleDate || !rescheduleTime) return
    setSaving(true)
    const { data: { user: authUser } } = await supabase.auth.getUser()
    const newTime = new Date(`${rescheduleDate}T${rescheduleTime}:00`).toISOString()
    await supabase.from('sessions').update({
      rescheduled_from: actionSession.scheduled_at,
      scheduled_at: newTime,
      rescheduled_at: new Date().toISOString(),
      rescheduled_by: authUser!.id,
    }).eq('id', actionSession.id)

    // Update WhatsApp queue if exists
    await supabase.from('whatsapp_queue')
      .update({ scheduled_for: new Date(new Date(newTime).getTime() - 24*60*60*1000).toISOString() })
      .eq('related_id', actionSession.id).eq('status', 'pending')

    setActionSession(null); setActionType(null); setSaving(false); loadSessions()
  }

  const statusColors: Record<string, string> = {
    scheduled: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-gray-100 text-gray-600',
    no_show: 'bg-red-100 text-red-700',
  }


  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-xl font-bold text-gray-900">{isTrainer ? 'My Sessions' : 'PT Sessions'}</h1><p className="text-sm text-gray-500">{sessions.length} sessions</p></div>
        {isTrainer && user?.role !== 'staff' && <Link href="/dashboard/pt/sessions/new" className="btn-primary flex items-center gap-1.5"><Plus className="w-4 h-4" /> Schedule</Link>}
      </div>



      {/* Status filter tabs — hidden for staff (they see upcoming only) */}
      {!isStaff && (
        <div className="flex gap-1 flex-wrap">
          {[{ k: 'upcoming', l: 'Upcoming' }, { k: 'pending_confirm', l: 'Pending Confirm' }, { k: 'completed', l: 'Completed' }, { k: 'cancelled', l: 'Cancelled' }].map(({ k, l }) => (
            <button key={k} onClick={() => setFilter(k)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors',
                filter === k ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>{l}</button>
          ))}
        </div>
      )}

      {/* Action modals */}
      {actionSession && actionType === 'cancel' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4">
            <h3 className="font-bold text-gray-900">Cancel Session</h3>
            <p className="text-sm text-gray-500">{actionSession.member?.full_name} · {formatDateTime(actionSession.scheduled_at)}</p>
            <div><label className="label">Reason *</label><textarea className="input min-h-[80px]" value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="e.g. Member requested cancellation" /></div>
            <div className="flex gap-2">
              <button onClick={handleCancel} disabled={!cancelReason.trim() || saving} className="btn-danger flex-1">{saving ? 'Cancelling...' : 'Cancel Session'}</button>
              <button onClick={() => setActionSession(null)} className="btn-secondary">Back</button>
            </div>
          </div>
        </div>
      )}

      {actionSession && actionType === 'reschedule' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4">
            <h3 className="font-bold text-gray-900">Reschedule Session</h3>
            <p className="text-sm text-gray-500">Currently: {formatDateTime(actionSession.scheduled_at)}</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">New Date *</label><input className="input" type="date" value={rescheduleDate} min={new Date().toISOString().split('T')[0]} onChange={e => setRescheduleDate(e.target.value)} /></div>
              <div><label className="label">New Time *</label><input className="input" type="time" value={rescheduleTime} onChange={e => setRescheduleTime(e.target.value)} /></div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleReschedule} disabled={!rescheduleDate || !rescheduleTime || saving} className="btn-primary flex-1">{saving ? 'Saving...' : 'Reschedule'}</button>
              <button onClick={() => setActionSession(null)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {actionSession && actionType === 'complete' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4">
            <h3 className="font-bold text-gray-900">Mark Session Outcome</h3>
            <p className="text-sm text-gray-500">{actionSession.member?.full_name} · {formatDateTime(actionSession.scheduled_at)}</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => handleMarkComplete(actionSession, 'completed')} disabled={saving}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-green-400 bg-green-50 hover:bg-green-100 transition-colors">
                <CheckCircle className="w-8 h-8 text-green-600" />
                <span className="text-sm font-semibold text-green-700">Completed</span>
              </button>
              <button onClick={() => handleMarkComplete(actionSession, 'no_show')} disabled={saving}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-red-300 bg-red-50 hover:bg-red-100 transition-colors">
                <XCircle className="w-8 h-8 text-red-500" />
                <span className="text-sm font-semibold text-red-700">No-show</span>
              </button>
            </div>
            <button onClick={() => setActionSession(null)} className="btn-secondary w-full">Back</button>
          </div>
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="card p-8 text-center">
          <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No sessions found</p>
          {isTrainer && <Link href="/dashboard/pt/sessions/new" className="btn-primary inline-block mt-3">Schedule first session</Link>}
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map(session => {
            const isOwnSession = session.trainer_id === user?.id
            const isScheduled = session.status === 'scheduled'
            const needsNotes = session.status === 'completed' && !session.is_notes_complete && isOwnSession
            const needsManagerConfirm = session.status === 'completed' && session.is_notes_complete && !session.manager_confirmed

            return (
              <div key={session.id} className={cn('card p-4 space-y-2', needsManagerConfirm && 'border-amber-200', needsNotes && 'border-blue-200')}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{session.member?.full_name}</p>
                    <p className="text-xs text-gray-500">{formatDateTime(session.scheduled_at)}</p>
                    {(!isTrainer) && session.trainer?.full_name && (
                      <p className="text-xs text-blue-600 mt-0.5">Trainer: {session.trainer?.full_name}</p>
                    )}
                    {session.rescheduled_from && <p className="text-xs text-amber-600 mt-0.5">↺ Rescheduled from {formatDateTime(session.rescheduled_from)}</p>}
                    {session.cancellation_reason && <p className="text-xs text-gray-400 mt-0.5">Cancelled: {session.cancellation_reason}</p>}
                    {session.package?.package_name && <p className="text-xs text-gray-400 mt-0.5">{session.package.package_name}</p>}
                  </div>
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium capitalize flex-shrink-0', statusColors[session.status] || 'bg-gray-100 text-gray-600')}>
                    {session.status === 'no_show' ? 'No-show' : session.status}
                  </span>
                </div>

                {/* Performance notes: only show for own sessions */}
                {isOwnSession && session.performance_notes && (
                  <p className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">{session.performance_notes}</p>
                )}

                {/* Commission: only show for own sessions */}
                {isOwnSession && session.status === 'completed' && session.session_commission_sgd > 0 && (
                  <p className="text-xs text-green-600 font-medium">Commission: {formatSGD(session.session_commission_sgd)}</p>
                )}

                {/* Action buttons */}
                <div className="flex gap-2 flex-wrap pt-1">
                  {/* Trainer: mark outcome when session date has passed */}
                  {isOwnSession && isScheduled && new Date(session.scheduled_at) <= new Date() && (
                    <button onClick={() => openAction(session, 'complete')} className="btn-primary text-xs py-1.5">Mark Outcome</button>
                  )}
                  {/* Trainer: notes */}
                  {isOwnSession && session.status === 'completed' && !session.manager_confirmed && (() => {
                    const pkg = session.package
                    const pkgClosed = pkg && (pkg.status === 'expired' || pkg.status === 'completed' || pkg.status === 'cancelled')
                    return (
                      <Link href={`/dashboard/pt/sessions/${session.id}/notes`}
                        className={cn('text-xs py-1.5 px-3 rounded-lg font-medium', session.is_notes_complete || pkgClosed ? 'btn-secondary' : 'btn-primary')}>
                        {pkgClosed ? 'View Notes (package closed)' : session.is_notes_complete ? 'Edit Notes' : '⚠ Submit Notes'}
                      </Link>
                    )
                  })()}
                  {/* Trainer: cancel/reschedule upcoming */}
                  {isOwnSession && isScheduled && (
                    <>
                      <button onClick={() => openAction(session, 'reschedule')} className="btn-secondary text-xs py-1.5 flex items-center gap-1"><RotateCcw className="w-3.5 h-3.5" /> Reschedule</button>
                      <button onClick={() => openAction(session, 'cancel')} className="text-xs py-1.5 px-3 rounded-lg font-medium text-red-600 hover:bg-red-50 transition-colors flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> Cancel</button>
                    </>
                  )}
                  {/* Manager: confirm */}
                  {isManager && needsManagerConfirm && (
                    <button onClick={() => handleManagerConfirm(session.id)} className="btn-primary text-xs py-1.5 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" /> Confirm Session
                    </button>
                  )}
                  {/* Manager: confirm badge */}
                  {session.manager_confirmed && <span className="text-xs text-green-600 font-medium py-1.5">✓ Manager confirmed</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
