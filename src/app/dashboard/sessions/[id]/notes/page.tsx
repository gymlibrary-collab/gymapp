'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { formatDateTime } from '@/lib/utils'
import { ArrowLeft, FileText, AlertCircle, CheckCircle, Clock, Lock } from 'lucide-react'
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

  // Check if trainer's edit window has expired
  const isEditLocked = () => {
    if (!session || !currentUser) return false
    const isManager = currentUser.role === 'manager'
    const isAdmin = currentUser.role === 'admin'
    // Managers and admins can always edit
    if (isManager || isAdmin) return false
    // Trainers: locked after 30 mins from submission
    if (session.notes_submitted_at) {
      const submittedAt = new Date(session.notes_submitted_at)
      const minutesElapsed = (Date.now() - submittedAt.getTime()) / 1000 / 60
      return minutesElapsed > EDIT_WINDOW_MINUTES
    }
    return false
  }

  const handleClose = async () => {
    if (!notes.trim() || notes.trim().length < 10) {
      setError('Please enter at least 10 characters of session notes to close this session for payout.')
      return
    }
    setLoading(true); setError('')
    const now = new Date().toISOString()
    await supabase.from('sessions').update({
      performance_notes: notes,
      is_notes_complete: true,
      notes_submitted_at: now,
    }).eq('id', id)
    setSaved(true); setLoading(false)
    setTimeout(() => router.push('/dashboard/sessions'), 1500)
  }

  const handleSaveDraft = async () => {
    setLoading(true)
    const now = new Date().toISOString()
    await supabase.from('sessions').update({
      performance_notes: notes,
      is_notes_complete: false,
      notes_submitted_at: now,
    }).eq('id', id)
    setLoading(false); setError('')
    alert('Draft saved. Session is not yet closed for payout.')
  }

  const handleManagerEdit = async () => {
    setLoading(true); setError('')
    await supabase.from('sessions').update({
      performance_notes: notes,
    }).eq('id', id)
    setLoading(false)
    setSaved(true)
    setTimeout(() => router.push('/dashboard/sessions'), 1500)
  }

  if (!session || !currentUser) return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600" />
    </div>
  )

  const isAlreadyClosed = session.is_notes_complete
  const locked = isEditLocked()
  const isManager = currentUser.role === 'manager' || currentUser.role === 'admin'
  const isTrainer = currentUser.role === 'trainer' ||
    (currentUser.role === 'manager' && currentUser.is_also_trainer)

  // Minutes remaining in edit window
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
          <p className="text-sm text-gray-500">
            {session.clients?.full_name} · {formatDateTime(session.scheduled_at)}
          </p>
        </div>
      </div>

      {/* Status banner */}
      {isAlreadyClosed && !locked && !isManager && (
        <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-lg p-3">
          <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-green-700 font-medium">Session closed for payout ✓</p>
            <p className="text-xs text-green-600 mt-0.5">
              You can edit notes for {Math.ceil(minutesRemaining)} more minute{Math.ceil(minutesRemaining) !== 1 ? 's' : ''}.
              After that, only the manager can edit.
            </p>
          </div>
        </div>
      )}

      {locked && !isManager && (
        <div className="flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-lg p-3">
          <Lock className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-gray-700 font-medium">Notes locked</p>
            <p className="text-xs text-gray-500 mt-0.5">
              The {EDIT_WINDOW_MINUTES}-minute edit window has passed. Contact your manager to make changes.
            </p>
          </div>
        </div>
      )}

      {isManager && isAlreadyClosed && (
        <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
          <CheckCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-700 font-medium">Manager edit access — you can modify these notes.</p>
        </div>
      )}

      {!isAlreadyClosed && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-amber-700 font-medium">Session not yet closed</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Submit notes and click "Close Session" to qualify for payout.
              You have {EDIT_WINDOW_MINUTES} minutes after closing to make edits.
            </p>
          </div>
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
            <span>{isAlreadyClosed ? 'Notes closed' : 'Last saved'}: {formatDateTime(session.notes_submitted_at)}</span>
          </div>
        )}

        <div>
          <label className="label">
            Session Notes <span className="text-red-500">*</span>
          </label>
          <textarea
            value={notes}
            onChange={e => { setNotes(e.target.value); setError('') }}
            className={`input min-h-[220px] resize-none ${(locked && !isManager) ? 'bg-gray-50 cursor-not-allowed' : ''} ${error ? 'border-red-300' : ''}`}
            placeholder="Describe the client's performance, exercises, weights/reps, progress, areas to improve and goals for next session...&#10;&#10;Minimum 10 characters required to close session for payout."
            disabled={locked && !isManager}
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
            {/* Trainer actions */}
            {!isManager && !locked && (
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
                <p className="text-xs text-gray-400 text-center">
                  You have {EDIT_WINDOW_MINUTES} minutes after closing to edit notes.
                </p>
              </>
            )}

            {/* Manager actions */}
            {isManager && (
              <button onClick={handleManagerEdit} disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
                <Save className="w-4 h-4" />
                {loading ? 'Saving...' : 'Save Notes (Manager)'}
              </button>
            )}

            {/* Locked for trainer */}
            {locked && !isManager && (
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

// Need Save import
function Save({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
    </svg>
  )
}
