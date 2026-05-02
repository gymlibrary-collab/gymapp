'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useViewMode } from '@/lib/view-mode-context'
import { formatDateTime } from '@/lib/utils'
import { ArrowLeft, FileText, AlertCircle, CheckCircle, Clock, Lock, Save } from 'lucide-react'
import Link from 'next/link'

const EDIT_WINDOW_MINUTES = 30

export default function SessionNotesPage() {
  const { id } = useParams()
  const [session, setSession] = useState<any>(null)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  // Use context — not currentUser.is_also_trainer
  const { isActingAsTrainer } = useViewMode()

  useEffect(() => {
    const load = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return
      const { data: userData } = await supabase.from('users').select('*').eq('id', authUser.id).single()
      setCurrentUser(userData)
      const { data } = await supabase
        .from('sessions').select('*, clients(full_name), packages(package_name)')
        .eq('id', id).single()
      setSession(data)
      setNotes(data?.performance_notes || '')
    }
    load()
  }, [id])

  // Trainer's 30-min edit window
  const isEditLocked = () => {
    if (!session || !currentUser) return false
    // Managers (in manager view) can always edit
    if (!isActingAsTrainer && currentUser.role === 'manager') return false
    if (currentUser.role === 'admin') return false
    // Trainer (or manager in trainer view): locked after 30 mins
    if (session.notes_submitted_at) {
      const elapsed = (Date.now() - new Date(session.notes_submitted_at).getTime()) / 1000 / 60
      return elapsed > EDIT_WINDOW_MINUTES
    }
    return false
  }

  const handleClose = async () => {
    if (!notes.trim() || notes.trim().length < 10) {
      setError('Please enter at least 10 characters to close session for payout.')
      return
    }
    setLoading(true); setError('')
    await supabase.from('sessions').update({
      performance_notes: notes,
      is_notes_complete: true,
      notes_submitted_at: new Date().toISOString(),
    }).eq('id', id)
    setSaved(true); setLoading(false)
    setTimeout(() => router.push('/dashboard/sessions'), 1500)
  }

  const handleSaveDraft = async () => {
    setLoading(true)
    await supabase.from('sessions').update({
      performance_notes: notes,
      is_notes_complete: false,
      notes_submitted_at: new Date().toISOString(),
    }).eq('id', id)
    setLoading(false)
  }

  const handleManagerSave = async () => {
    setLoading(true); setError('')
    await supabase.from('sessions').update({ performance_notes: notes }).eq('id', id)
    setLoading(false); setSaved(true)
    setTimeout(() => router.push('/dashboard/sessions'), 1500)
  }

  if (!session || !currentUser) return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600" />
    </div>
  )

  const locked = isEditLocked()
  // Manager (in manager view) = can always edit notes
  const isManagerAccess = currentUser.role === 'manager' && !isActingAsTrainer
  const isAlreadyClosed = session.is_notes_complete
  const minutesRemaining = session.notes_submitted_at
    ? Math.max(0, EDIT_WINDOW_MINUTES - (Date.now() - new Date(session.notes_submitted_at).getTime()) / 1000 / 60)
    : EDIT_WINDOW_MINUTES

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/sessions" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Session Notes</h1>
          <p className="text-sm text-gray-500">{session.clients?.full_name} · {formatDateTime(session.scheduled_at)}</p>
        </div>
      </div>

      {isAlreadyClosed && !locked && isActingAsTrainer && (
        <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-lg p-3">
          <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-green-700 font-medium">Session closed ✓</p>
            <p className="text-xs text-green-600 mt-0.5">
              You can edit for {Math.ceil(minutesRemaining)} more minute{Math.ceil(minutesRemaining) !== 1 ? 's' : ''}.
            </p>
          </div>
        </div>
      )}

      {locked && isActingAsTrainer && (
        <div className="flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-lg p-3">
          <Lock className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-gray-700 font-medium">Notes locked</p>
            <p className="text-xs text-gray-500 mt-0.5">The {EDIT_WINDOW_MINUTES}-minute edit window has passed. Contact your manager to make changes.</p>
          </div>
        </div>
      )}

      {isManagerAccess && isAlreadyClosed && (
        <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
          <CheckCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-700 font-medium">Manager access — you can modify these notes.</p>
        </div>
      )}

      {!isAlreadyClosed && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700">Submit notes and close the session to qualify for payout. You have {EDIT_WINDOW_MINUTES} minutes after closing to make edits.</p>
        </div>
      )}

      <div className="card p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm text-gray-600 bg-red-50 rounded-lg p-3">
          <FileText className="w-4 h-4 text-red-600 flex-shrink-0" />
          <span>Package: {session.packages?.package_name}</span>
        </div>

        {session.notes_submitted_at && (
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            <Clock className="w-3.5 h-3.5 text-gray-400" />
            <span>{isAlreadyClosed ? 'Closed' : 'Last saved'}: {formatDateTime(session.notes_submitted_at)}</span>
          </div>
        )}

        <div>
          <label className="label">Session Notes <span className="text-red-500">*</span></label>
          <textarea
            value={notes}
            onChange={e => { setNotes(e.target.value); setError('') }}
            className={`input min-h-[220px] resize-none ${locked && isActingAsTrainer ? 'bg-gray-50 cursor-not-allowed' : ''}`}
            placeholder="Describe the member's performance, exercises, weights/reps, progress and goals for next session..."
            disabled={locked && isActingAsTrainer}
          />
          {error && <p className="text-xs text-red-600 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {error}</p>}
          <p className="text-xs text-gray-400 mt-1">{notes.length} characters</p>
        </div>

        {saved ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 text-center flex items-center justify-center gap-2">
            <CheckCircle className="w-4 h-4" /> Saved! Redirecting...
          </div>
        ) : (
          <div className="space-y-2">
            {/* Trainer actions (trainer view only) */}
            {isActingAsTrainer && !locked && (
              <>
                {!isAlreadyClosed ? (
                  <>
                    <button onClick={handleClose} disabled={loading}
                      className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
                      <CheckCircle className="w-4 h-4" />
                      {loading ? 'Closing...' : 'Close Session for Payout'}
                    </button>
                    <button onClick={handleSaveDraft} disabled={loading} className="btn-secondary w-full text-sm">
                      Save as Draft (not closed yet)
                    </button>
                  </>
                ) : (
                  <button onClick={handleClose} disabled={loading}
                    className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
                    <Save className="w-4 h-4" />
                    {loading ? 'Saving...' : `Save Notes (${Math.ceil(minutesRemaining)} min remaining)`}
                  </button>
                )}
              </>
            )}

            {/* Manager actions (manager view only) */}
            {isManagerAccess && (
              <button onClick={handleManagerSave} disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
                <Save className="w-4 h-4" />
                {loading ? 'Saving...' : 'Save Notes (Manager)'}
              </button>
            )}

            {/* Locked for trainer */}
            {locked && isActingAsTrainer && (
              <p className="text-xs text-gray-400 text-center py-2">
                Notes are locked. Contact your manager to make changes.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
