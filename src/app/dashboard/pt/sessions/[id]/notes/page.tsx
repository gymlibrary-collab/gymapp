'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { useViewMode } from '@/lib/view-mode-context'
import { formatDateTime, todaySGT} from '@/lib/utils'
import { ArrowLeft, FileText, Lock, CheckCircle, AlertCircle, Save, Clock, RefreshCw, XCircle } from 'lucide-react'
import { queueWhatsApp } from '@/lib/whatsapp'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { StatusBanner } from '@/components/StatusBanner'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { PageSpinner } from '@/components/PageSpinner'

const EDIT_WINDOW_MINUTES = 30

const NON_RENEWAL_REASONS = [
  'Price — too expensive',
  'Schedule conflict — timing does not work',
  'Moving to another gym',
  'Health reasons — unable to continue',
  'Satisfied with progress — pausing for now',
  'Trainer mismatch — looking for different trainer',
  'Financial constraints',
  'Relocating',
  'Other',
]

export default function PtSessionNotesPage() {
  const { user, loading } = useCurrentUser({ allowedRoles: ['trainer', 'manager'] })


  const { id } = useParams()
  const { logActivity } = useActivityLog()
  const [session, setSession] = useState<any>(null)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [notes, setNotes] = useState('')
  const [renewalStatus, setRenewalStatus] = useState<'renewed' | 'not_renewing' | 'undecided' | ''>('')
  const [nonRenewalReason, setNonRenewalReason] = useState('')
  const [nonRenewalCustom, setNonRenewalCustom] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()
  const { isActingAsTrainer } = useViewMode()


  useEffect(() => {
    const load = async () => {
    logActivity('page_view', 'Session Notes', 'Viewed session notes')
      const { data } = await supabase.from('sessions')
        .select('*, member:members!sessions_member_id_fkey(full_name, phone), attending_member:members!sessions_attending_member_id_fkey(full_name), package:packages(package_name, status, end_date_calculated, sessions_used, total_sessions, is_shared, secondary_member_id), trainer:users!sessions_trainer_id_fkey(full_name, phone), gym:gyms(name)')
        .eq('id', id).maybeSingle()
      setSession(data)
      setNotes(data?.performance_notes || '')
      if (data?.renewal_status) setRenewalStatus(data.renewal_status)
      if (data?.non_renewal_reason) {
        const known = NON_RENEWAL_REASONS.slice(0, -1) // exclude 'Other'
        if (known.includes(data.non_renewal_reason)) {
          setNonRenewalReason(data.non_renewal_reason)
        } else {
          setNonRenewalReason('Other')
          setNonRenewalCustom(data.non_renewal_reason)
        }
      }
    }
    load()
  }, [id])

  if (loading) return <PageSpinner />
  if (!user) return null

  // ── Is this the last session? ─────────────────────────────
  // Read directly from the session row — is_last_session is written by
  // handleMarkComplete at completion time (before sessions_used is incremented
  // on the package), so it is always accurate with no timing ambiguity.
  const isLastSession = () => !!session?.is_last_session

  // ── Package / lock state ─────────────────────────────────
  const packageIsClosed = () => {
    const pkg = session?.package
    if (!pkg) return false
    if (pkg.status === 'expired' || pkg.status === 'completed' || pkg.status === 'cancelled') return true
    if (pkg.end_date_calculated && pkg.end_date_calculated < todaySGT()) return true
    return false
  }

  const isLocked = () => {
    if (!session || !user) return false
    if (user!.role === 'manager' && !isActingAsTrainer) return false
    if (user!.role === 'business_ops') return false
    if (packageIsClosed()) return true
    if (session.notes_submitted_at) {
      const elapsed = (Date.now() - new Date(session.notes_submitted_at).getTime()) / 1000 / 60
      return elapsed > EDIT_WINDOW_MINUTES
    }
    return false
  }

  // ── Final reason string ───────────────────────────────────
  const finalReason = () => {
    if (renewalStatus !== 'not_renewing') return null
    if (nonRenewalReason === 'Other') return nonRenewalCustom.trim()
    return nonRenewalReason
  }

  // ── Submit (trainer) ─────────────────────────────────────
  const handleTrainerSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!notes.trim() || notes.trim().length < 10) {
      setError('Please enter at least 10 characters'); return
    }
    if (isLastSession() && !renewalStatus) {
      setError('Please indicate whether the member has renewed their package'); return
    }
    if (renewalStatus === 'not_renewing' && !finalReason()) {
      setError('Please provide a reason for non-renewal'); return
    }
    setError('')
    const { data: { user: authUser } } = await supabase.auth.getUser()

    await supabase.from('sessions').update({
      performance_notes: notes,
      is_last_session: isLastSession(),
      renewal_status: renewalStatus || null,
      non_renewal_reason: finalReason() || null,
      notes_submitted_at: new Date().toISOString(),
    }).eq('id', id)

    // Queue WhatsApp to manager
    const { data: gymManager } = await supabase.from('users')
      .select('phone, full_name').eq('manager_gym_id', session.gym_id).eq('role', 'manager').maybeSingle()
    const renewalNote = renewalStatus === 'not_renewing'
      ? ` Member has indicated they will NOT be renewing. Reason: ${finalReason()}`
      : renewalStatus === 'renewed' ? ' Member has renewed their package.' : ''
    await queueWhatsApp(supabase, {
      notificationType: 'manager_note_alert',
      phone: gymManager?.phone,
      name: gymManager?.full_name,
      placeholders: {
        manager_name: gymManager?.full_name || '',
        trainer_name: user!.full_name,
        member_name: session.member?.full_name || '',
        session_date: session.scheduled_at ? new Date(session.scheduled_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }) : '',
        gym_name: session.gym?.name || '',
      },
      fallbackMessage: `PT session notes submitted by ${user!.full_name} for ${session.member?.full_name}. Please review and confirm.${renewalNote}`,
      relatedId: id as string,
    })

    // Queue WhatsApp confirmation to member
    const sessionDate = session.scheduled_at ? new Date(session.scheduled_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
    const sessionTime = session.scheduled_at ? new Date(session.scheduled_at).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' }) : ''
    await queueWhatsApp(supabase, {
      notificationType: 'session_note_member_confirm',
      phone: session.member?.phone,
      name: session.member?.full_name,
      placeholders: {
        member_name: session.member?.full_name || '',
        trainer_name: user!.full_name,
        gym_name: session.gym?.name || '',
        session_date: sessionDate,
        session_time: sessionTime,
      },
      fallbackMessage: `Hi ${session.member?.full_name}, your PT session with ${user!.full_name} on ${sessionDate} at ${sessionTime} has been completed and recorded. See you next time!`,
      relatedId: id as string,
    })

    logActivity('update', 'Session Notes', 'Submitted session notes for manager confirmation')
    logActivity('approve', 'Session Notes', `Manager confirmed session notes for ${session?.member?.full_name || ''}`)
    setSaved(true)
    setTimeout(() => router.push('/dashboard/pt/sessions'), 1500)
  }

  // ── Save (manager) ────────────────────────────────────────
  const handleManagerSave = async (e: React.FormEvent) => {
    e.preventDefault()
    await supabase.from('sessions').update({
      performance_notes: notes,
      renewal_status: renewalStatus || null,
      non_renewal_reason: finalReason() || null,
    }).eq('id', id)
    setSaved(true)
    setTimeout(() => router.push('/dashboard/pt/sessions'), 1500)
  }

  if (!session || !user) return (
    <PageSpinner />
  )

  const locked = isLocked()
  const isManagerView = user!.role === 'manager' && !isActingAsTrainer
  const isOwnSession = session.trainer_id === user!.id
  const lastSession = isLastSession()
  // isLastSessionFlag is true even after the package is closed — used to
  // override the pkgClosed gate so the renewal widget always shows on the
  // last session regardless of package status.
  const isLastSessionFlag = !!session?.is_last_session
  const minutesRemaining = session.notes_submitted_at
    ? Math.max(0, EDIT_WINDOW_MINUTES - (Date.now() - new Date(session.notes_submitted_at).getTime()) / 1000 / 60)
    : EDIT_WINDOW_MINUTES
  const pkgClosed = packageIsClosed()

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/pt/sessions" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Session Notes</h1>
          <p className="text-sm text-gray-500">
            {session.is_secondary_member && session.attending_member
              ? session.attending_member.full_name
              : session.member?.full_name} · {formatDateTime(session.scheduled_at)}
          </p>
        </div>
      </div>

      {/* Shared package — show who actually attended */}
      {session.package?.is_shared && (
        <div className="flex items-start gap-2 bg-purple-50 border border-purple-100 rounded-lg p-3">
          <div className="flex-1 text-xs text-purple-700 space-y-0.5">
            <p className="font-medium">Shared package session</p>
            <p>Attending: <strong>{session.is_secondary_member && session.attending_member
              ? session.attending_member.full_name
              : session.member?.full_name}</strong>
              {session.is_secondary_member ? ' (sharing partner)' : ' (primary holder)'}
            </p>
            <p className="text-purple-500">Primary package holder: {session.member?.full_name}</p>
          </div>
        </div>
      )}

      {/* Last session badge */}
      {lastSession && (!pkgClosed || isLastSessionFlag) && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-700 font-medium">
            This is the last session in the current PT package
          </p>
        </div>
      )}

      {/* Status banners */}
      {locked && (
        <div className="flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-lg p-3">
          <Lock className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-gray-700">Notes locked</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {pkgClosed
                ? 'The PT package for this session has expired or been closed. Notes are read-only. Contact your manager if changes are needed.'
                : `The ${EDIT_WINDOW_MINUTES}-minute edit window has passed. Contact your manager to make changes.`}
            </p>
          </div>
        </div>
      )}

      {!locked && !!session.notes_submitted_at && isOwnSession && !isManagerView && (
        <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-lg p-3">
          <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-green-800">Notes submitted ✓</p>
            <p className="text-xs text-green-600 mt-0.5">
              {Math.ceil(minutesRemaining)} minute{Math.ceil(minutesRemaining) !== 1 ? 's' : ''} remaining to edit. Awaiting manager confirmation.
            </p>
          </div>
        </div>
      )}

      {!session.notes_submitted_at && isOwnSession && !isManagerView && !locked && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700">
            Submit notes to qualify for session commission. You have {EDIT_WINDOW_MINUTES} minutes after submitting to make edits.
          </p>
        </div>
      )}

      {isManagerView && (
        <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
          <FileText className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-700">Manager access — you can edit these notes at any time.</p>
        </div>
      )}

      {session.manager_confirmed && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3">
          <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
          <p className="text-sm text-green-700 font-medium">Session confirmed by manager ✓</p>
        </div>
      )}

      <form onSubmit={isManagerView ? handleManagerSave : handleTrainerSubmit} className="card p-4 space-y-4">
        {/* Package info */}
        <div className="flex items-center gap-2 text-sm text-gray-600 bg-red-50 rounded-lg p-3">
          <FileText className="w-4 h-4 text-red-600 flex-shrink-0" />
          <span>{session.package?.package_name} · {session.gym?.name}</span>
          {session.package && (
            <span className="ml-auto text-xs text-gray-400">
              Session {session.package.sessions_used}/{session.package.total_sessions}
            </span>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="label">
            Session Notes {!isManagerView && !locked && <span className="text-red-500">*</span>}
          </label>
          <textarea
            value={notes}
            onChange={e => { setNotes(e.target.value); setError('') }}
            className={cn('input min-h-[160px] resize-none', locked && !isManagerView && 'bg-gray-50 cursor-not-allowed')}
            placeholder={`Exercises performed, weights/reps, ${session.is_secondary_member && session.attending_member ? session.attending_member.full_name : session.member?.full_name}'s progress, goals for next session...`}
            disabled={locked && !isManagerView}
          />
          <p className="text-xs text-gray-400 mt-1">{notes.length} characters</p>
        </div>

        {/* ── Renewal decision — last session only ── */}
        {(lastSession || session.renewal_status) && (!pkgClosed || isLastSessionFlag) && (
          <div className="space-y-3 border border-gray-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-red-600" />
              Package Renewal Decision
            </p>

            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'renewed', label: 'Renewed', icon: CheckCircle, activeClass: 'border-green-500 bg-green-50' },
                { value: 'not_renewing', label: 'Not Renewing', icon: XCircle, activeClass: 'border-red-500 bg-red-50' },
                { value: 'undecided', label: 'Undecided', icon: Clock, activeClass: 'border-amber-500 bg-amber-50' },
              ].map(({ value, label, icon: Icon, activeClass }) => (
                <button key={value} type="button"
                  disabled={locked && !isManagerView}
                  onClick={() => { setRenewalStatus(value as any); setNonRenewalReason(''); setNonRenewalCustom(''); setError('') }}
                  className={cn(
                    'flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-colors text-xs font-medium',
                    renewalStatus === value ? activeClass : 'border-gray-200 hover:border-gray-300',
                    locked && !isManagerView && 'opacity-60 cursor-not-allowed'
                  )}>
                  <Icon className={cn('w-5 h-5',
                    value === 'renewed' ? 'text-green-600' :
                    value === 'not_renewing' ? 'text-red-500' : 'text-amber-500'
                  )} />
                  {label}
                </button>
              ))}
            </div>

            {/* Non-renewal reason */}
            {renewalStatus === 'not_renewing' && (
              <div className="space-y-2">
                <label className="label">Reason for not renewing *</label>
                <select className="input" value={nonRenewalReason}
                  disabled={locked && !isManagerView}
                  onChange={e => { setNonRenewalReason(e.target.value); setNonRenewalCustom(''); setError('') }}>
                  <option value="">Select reason...</option>
                  {NON_RENEWAL_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                {nonRenewalReason === 'Other' && (
                  <textarea className="input min-h-[70px] resize-none" value={nonRenewalCustom}
                    disabled={locked && !isManagerView}
                    onChange={e => setNonRenewalCustom(e.target.value)}
                    placeholder="Please describe the reason..." />
                )}
              </div>
            )}

            {renewalStatus === 'renewed' && (
              <p className="text-xs text-green-600 bg-green-50 rounded-lg p-2">
                Great! The new package should already be recorded on the member's profile.
              </p>
            )}
            {renewalStatus === 'undecided' && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2">
                Follow up with the member within the next few days.
              </p>
            )}
          </div>
        )}

        {error && (
          <p className="text-xs text-red-600 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
          </p>
        )}

        {saved ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 text-center flex items-center justify-center gap-2">
            <CheckCircle className="w-4 h-4" /> Saved! Redirecting...
          </div>
        ) : (
          <>
            {!isManagerView && !locked && (
              <button type="submit" disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
                <Save className="w-4 h-4" />
                {loading ? 'Submitting...' : !!session.notes_submitted_at
                  ? `Save Edits (${Math.ceil(minutesRemaining)} min left)`
                  : 'Submit Notes for Manager Confirmation'}
              </button>
            )}
            {isManagerView && (
              <button type="submit" disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
                <Save className="w-4 h-4" />
                {loading ? 'Saving...' : 'Save Notes'}
              </button>
            )}
            {locked && !isManagerView && (
              <p className="text-xs text-gray-400 text-center py-2">
                Notes are locked. Contact your manager to make changes.
              </p>
            )}
          </>
        )}
      </form>
    </div>
  )
}
