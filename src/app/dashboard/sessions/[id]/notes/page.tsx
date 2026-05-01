'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { formatDateTime } from '@/lib/utils'
import { ArrowLeft, FileText, AlertCircle, CheckCircle, Clock } from 'lucide-react'
import Link from 'next/link'

export default function SessionNotesPage() {
  const { id } = useParams()
  const [session, setSession] = useState<any>(null)
  const [notes, setNotes] = useState('')
  const [notesTimestamp, setNotesTimestamp] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('sessions')
        .select('*, clients(full_name), packages(package_name)')
        .eq('id', id)
        .single()
      setSession(data)
      setNotes(data?.performance_notes || '')
      setNotesTimestamp(data?.notes_submitted_at || null)
    }
    load()
  }, [id])

  const handleClose = async () => {
    if (!notes.trim() || notes.trim().length < 10) {
      setError('Please enter at least 10 characters of session notes to close this session for payout.')
      return
    }
    setLoading(true)
    setError('')

    const now = new Date().toISOString()
    setNotesTimestamp(now)

    await supabase.from('sessions').update({
      performance_notes: notes,
      is_notes_complete: true,
      notes_submitted_at: now,
    }).eq('id', id)

    setSaved(true)
    setLoading(false)
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

    setNotesTimestamp(now)
    setLoading(false)
    setError('')
    alert('Draft saved. Session is not yet closed for payout.')
  }

  if (!session) return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600" />
    </div>
  )

  const isAlreadyClosed = session.is_notes_complete

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
      {isAlreadyClosed ? (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3">
          <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
          <div>
            <p className="text-sm text-green-700 font-medium">Session closed — qualifies for payout ✓</p>
            {notesTimestamp && (
              <p className="text-xs text-green-600 mt-0.5 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Notes submitted: {formatDateTime(notesTimestamp)}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-amber-700 font-medium">Session not yet closed</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Submit session notes and click "Close Session" for this session to qualify for payout.
            </p>
          </div>
        </div>
      )}

      <div className="card p-4 space-y-4">
        {/* Package info */}
        <div className="flex items-center gap-2 text-sm text-gray-600 bg-green-50 rounded-lg p-3">
          <FileText className="w-4 h-4 text-green-600 flex-shrink-0" />
          <span>Package: {session.packages?.package_name}</span>
        </div>

        {/* Timestamp display */}
        {notesTimestamp && (
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            <Clock className="w-3.5 h-3.5 text-gray-400" />
            <span>
              {isAlreadyClosed ? 'Notes closed' : 'Last saved'}: {formatDateTime(notesTimestamp)}
            </span>
          </div>
        )}

        {/* Notes textarea */}
        <div>
          <label className="label">
            Session Notes <span className="text-red-500">*</span>
          </label>
          <textarea
            value={notes}
            onChange={e => { setNotes(e.target.value); setError('') }}
            className={`input min-h-[220px] resize-none ${error ? 'border-red-300 focus:ring-red-500' : ''}`}
            placeholder="Describe the client's performance, exercises completed, weights/reps, progress observed, areas to improve, and goals for next session...

Minimum 10 characters required to close session for payout."
            disabled={isAlreadyClosed}
          />
          {error && (
            <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> {error}
            </p>
          )}
          <p className="text-xs text-gray-400 mt-1">{notes.length} characters</p>
        </div>

        {/* Actions */}
        {saved ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 text-center flex items-center justify-center gap-2">
            <CheckCircle className="w-4 h-4" /> Session closed! Redirecting...
          </div>
        ) : !isAlreadyClosed ? (
          <div className="space-y-2">
            <button
              onClick={handleClose}
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              {loading ? 'Closing...' : 'Close Session for Payout'}
            </button>
            <button
              onClick={handleSaveDraft}
              disabled={loading}
              className="btn-secondary w-full text-sm"
            >
              Save as Draft (not closed yet)
            </button>
            <p className="text-xs text-gray-400 text-center">
              Date and time will be automatically recorded when you close the session.
            </p>
          </div>
        ) : (
          <p className="text-xs text-gray-400 text-center">
            Notes are locked after closing. Contact your manager to make changes.
          </p>
        )}
      </div>
    </div>
  )
}
