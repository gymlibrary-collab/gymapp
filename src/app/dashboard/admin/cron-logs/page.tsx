'use client'

// ============================================================
// src/app/dashboard/admin/cron-logs/page.tsx
//
// PURPOSE:
//   Admin-only view of daily cron job execution logs.
//   Shows start time, duration, status and outcome of each
//   job run by the daily orchestrator.
//
// ACCESS: admin only
// DATA SOURCE: cron_logs table (7-day rolling window)
// ============================================================

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

function formatDuration(ms: number | null): string {
  if (!ms) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatDateTime(ts: string): string {
  return new Date(ts).toLocaleString('en-SG', {
    timeZone: 'Asia/Singapore',
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

const JOB_ORDER = [
  'expire-memberships',
  'expire-pt-packages',
  'escalate-leave',
  'escalate-expiring-memberships',
  'escalate-membership-sales',
  'escalate-pt-package-sales',
  'escalate-pt-session-notes',
  'check-staff-birthdays',
  'check-member-birthdays',
]

export default function CronLogsPage() {
  const { user, loading } = useCurrentUser({ allowedRoles: ['admin'] })
  const { logActivity } = useActivityLog()
  const [logs, setLogs] = useState<any[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [dates, setDates] = useState<string[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [sourceFilter, setSourceFilter] = useState<'all' | 'daily' | 'reminder'>('all')
  const supabase = createClient()

  const load = async () => {
    setDataLoading(true)
    logActivity('page_view', 'Cron Logs', 'Viewed cron job logs')
    const { data } = await supabase
      .from('cron_logs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(200)

    const allLogs = data || []
    setLogs(allLogs)

    // Extract unique dates (SGT)
    const uniqueDates = Array.from(new Set(
      allLogs.map((l: any) => new Date(l.started_at)
        .toLocaleDateString('en-SG', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }))
    ))
    setDates(uniqueDates)
    if (!selectedDate && uniqueDates.length > 0) setSelectedDate(uniqueDates[0])
    setDataLoading(false)
  }

  useEffect(() => {
    if (!user) return
    load()
  }, [user])

  if (loading || !user) return null

  // Filter logs for selected date
  const filteredLogs = logs.filter((l: any) => {
    const dateMatch = new Date(l.started_at).toLocaleDateString('en-SG', {
      timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit'
    }) === selectedDate
    const sourceMatch = sourceFilter === 'all' || (l.source || 'daily') === sourceFilter
    return dateMatch && sourceMatch
  })

  // Sort by job order for the selected date
  const sortedLogs = [...filteredLogs].sort((a, b) => {
    const ai = JOB_ORDER.indexOf(a.cron_name)
    const bi = JOB_ORDER.indexOf(b.cron_name)
    if (ai === -1 && bi === -1) return 0
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })

  const successCount = filteredLogs.filter((l: any) => l.status === 'success').length
  const errorCount = filteredLogs.filter((l: any) => l.status === 'error').length
  const totalDuration = filteredLogs.reduce((s: number, l: any) => s + (l.duration_ms || 0), 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Cron Job Logs</h1>
          <p className="text-sm text-gray-500">Daily job execution history (7-day rolling window)</p>
        </div>
        <button onClick={load} className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Source filter tabs */}
      <div className="flex gap-2">
        {(['all', 'daily', 'reminder'] as const).map(s => (
          <button key={s} onClick={() => setSourceFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              sourceFilter === s
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {s === 'all' ? 'All' : s === 'daily' ? 'Daily' : 'Reminders'}
          </button>
        ))}
      </div>

      {/* Date tabs */}
      {dates.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {dates.map(date => (
            <button
              key={date}
              onClick={() => setSelectedDate(date)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                selectedDate === date
                  ? 'bg-red-600 text-white border-red-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              )}
            >
              {date}
            </button>
          ))}
        </div>
      )}

      {dataLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600" />
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-gray-400 text-sm">No logs for this date</p>
        </div>
      ) : (
        <>
          {/* Summary row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="stat-card">
              <p className="text-xs text-gray-500">Jobs Run</p>
              <p className="text-2xl font-bold">{filteredLogs.length}</p>
            </div>
            <div className="stat-card">
              <p className="text-xs text-gray-500">Outcome</p>
              <p className="text-2xl font-bold">
                <span className="text-green-600">{successCount}✓</span>
                {errorCount > 0 && <span className="text-red-600 ml-2">{errorCount}✗</span>}
              </p>
            </div>
            <div className="stat-card">
              <p className="text-xs text-gray-500">Total Duration</p>
              <p className="text-2xl font-bold">{formatDuration(totalDuration)}</p>
            </div>
          </div>

          {/* Job log table */}
          <div className="card overflow-hidden">
            <div className="divide-y divide-gray-100">
              {sortedLogs.map((log: any) => (
                <div key={log.id}>
                  <div
                    className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                  >
                    {/* Status icon */}
                    <div className="flex-shrink-0">
                      {log.status === 'success' && <CheckCircle className="w-5 h-5 text-green-500" />}
                      {log.status === 'error' && <XCircle className="w-5 h-5 text-red-500" />}
                      {log.status === 'running' && <Clock className="w-5 h-5 text-amber-500 animate-pulse" />}
                    </div>

                    {/* Job name */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{log.cron_name}</p>
                      <p className="text-xs text-gray-400">
                        {formatDateTime(log.started_at)}
                        {log.run_by === 'manual' && (
                          <span className="ml-2 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">manual</span>
                        )}
                      </p>
                    </div>

                    {/* Duration */}
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-medium text-gray-700">{formatDuration(log.duration_ms)}</p>
                      <p className={cn('text-xs font-medium',
                        log.status === 'success' ? 'text-green-600' :
                        log.status === 'error' ? 'text-red-600' : 'text-amber-600'
                      )}>
                        {log.status}
                      </p>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {expandedId === log.id && (
                    <div className="px-4 pb-4 bg-gray-50 border-t border-gray-100">
                      {log.error && (
                        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                          <p className="text-xs font-medium text-red-700 mb-1">Error</p>
                          <p className="text-xs text-red-600 font-mono">{log.error}</p>
                        </div>
                      )}
                      {log.result && (
                        <div className="mt-3 p-3 bg-white border border-gray-200 rounded-lg">
                          <p className="text-xs font-medium text-gray-600 mb-1">Result</p>
                          <pre className="text-xs text-gray-700 font-mono overflow-x-auto whitespace-pre-wrap">
                            {JSON.stringify(log.result, null, 2)}
                          </pre>
                        </div>
                      )}
                      {log.ended_at && (
                        <p className="text-xs text-gray-400 mt-2">
                          Ended: {formatDateTime(log.ended_at)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
