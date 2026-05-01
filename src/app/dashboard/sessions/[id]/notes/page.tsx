'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { formatDateTime } from '@/lib/utils'
import { ArrowLeft, FileText } from 'lucide-react'
import Link from 'next/link'

export default function SessionNotesPage() {
  const { id } = useParams()
  const [session, setSession] = useState<any>(null)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('sessions')
        .select('*, clients(full_name), packages(package_name)')
        .eq('id', id).single()
      setSession(data)
      setNotes(data?.performance_notes || '')
    }
    load()
  }, [id])

  const handleSave = async () => {
    setLoading(true)
    await supabase.from('sessions').update({ performance_notes: notes }).eq('id', id)
    setSaved(true)
    setLoading(false)
    setTimeout(() => router.push('/dashboard/sessions'), 1000)
  }

  if (!session) return <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600" /></div>

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/sessions" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Performance Notes</h1>
          <p className="text-sm text-gray-500">
            {session.clients?.full_name} · {formatDateTime(session.scheduled_at)}
          </p>
        </div>
      </div>

      <div className="card p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm text-gray-600 bg-green-50 rounded-lg p-3">
          <FileText className="w-4 h-4 text-green-600" />
          <span>Package: {session.packages?.package_name}</span>
        </div>

        <div>
          <label className="label">Session Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="input min-h-[200px] resize-none"
            placeholder="Describe the client's performance, exercises completed, progress, areas to improve, goals for next session..."
          />
        </div>

        {saved ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 text-center">
            ✓ Notes saved! Redirecting...
          </div>
        ) : (
          <button onClick={handleSave} disabled={loading} className="btn-primary w-full">
            {loading ? 'Saving...' : 'Save Notes'}
          </button>
        )}
      </div>
    </div>
  )
}
