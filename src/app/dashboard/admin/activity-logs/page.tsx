'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { formatDate, formatDateTime } from '@/lib/utils'
import { Activity, Download, RefreshCw, Search, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react'
import { useToast } from '@/hooks/useToast'
import { StatusBanner } from '@/components/StatusBanner'
import { cn } from '@/lib/utils'
import { PageSpinner } from '@/components/PageSpinner'

const ACTION_TYPES = ['all', 'login', 'logout', 'page_view', 'create', 'update', 'delete', 'confirm', 'reject', 'approve', 'export', 'other']

const ACTION_BADGE: Record<string, string> = {
  login: 'bg-green-100 text-green-700',
  logout: 'bg-gray-100 text-gray-600',
  page_view: 'bg-blue-100 text-blue-700',
  create: 'bg-purple-100 text-purple-700',
  update: 'bg-amber-100 text-amber-700',
  delete: 'bg-red-100 text-red-700',
  confirm: 'bg-green-100 text-green-700',
  reject: 'bg-red-100 text-red-700',
  approve: 'bg-teal-100 text-teal-700',
  export: 'bg-blue-100 text-blue-700',
  other: 'bg-gray-100 text-gray-600',
}

const PRESETS = [
  { label: 'Today', from: 0, to: 0 },
  { label: 'Yesterday', from: 1, to: 1 },
  { label: 'Last 3 days', from: 2, to: 0 },
  { label: 'Last 7 days', from: 6, to: 0 },
  { label: 'Last 14 days', from: 13, to: 0 },
]

function toDateStr(d: Date) {
  // Use local date methods to avoid UTC offset issues
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function offsetDate(daysAgo: number) {
  // Use SGT for correct date calculation
  const sgNow = new Date(Date.now() + 8 * 60 * 60 * 1000)
  const [y, m, d] = [sgNow.getUTCFullYear(), sgNow.getUTCMonth(), sgNow.getUTCDate() - daysAgo]
  const date = new Date(Date.UTC(y, m, d))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}-${String(date.getUTCDate()).padStart(2,'0')}`
}

function MiniCalendar({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  const sgNow = new Date(Date.now() + 8 * 60 * 60 * 1000)
  const today = new Date(sgNow.getUTCFullYear(), sgNow.getUTCMonth(), sgNow.getUTCDate())
  const minDate = new Date(today); minDate.setDate(minDate.getDate() - 13)
  const [calMonth, setCalMonth] = useState({ year: today.getFullYear(), month: today.getMonth() })
  const [selecting, setSelecting] = useState<'from' | 'to'>('from')
  const [hovered, setHovered] = useState<string | null>(null)

  const firstDay = new Date(calMonth.year, calMonth.month, 1)
  const lastDay = new Date(calMonth.year, calMonth.month + 1, 0)
  const startDow = (firstDay.getDay() + 6) % 7
  const totalCells = startDow + lastDay.getDate()
  const rows = Math.ceil(totalCells / 7)

  const isValid = (s: string) => s >= toDateStr(minDate) && s <= toDateStr(today)

  const isInRange = (s: string) => {
    const end = selecting === 'to' && hovered ? hovered : to
    const lo = from < end ? from : end
    const hi = from < end ? end : from
    return s > lo && s < hi
  }

  const handleClick = (s: string) => {
    if (!isValid(s)) return
    if (selecting === 'from') { onChange(s, s); setSelecting('to') }
    else {
      const f = s < from ? s : from
      const t = s < from ? from : s
      onChange(f, t); setSelecting('from')
    }
  }

  const canPrev = calMonth.month > minDate.getMonth() || calMonth.year > minDate.getFullYear()
  const canNext = calMonth.month < today.getMonth() || calMonth.year < today.getFullYear()

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => { if (!canPrev) return; const d = new Date(calMonth.year, calMonth.month - 1, 1); setCalMonth({ year: d.getFullYear(), month: d.getMonth() }) }}
          disabled={!canPrev} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30">
          <ChevronLeft className="w-3.5 h-3.5 text-gray-500" />
        </button>
        <span className="text-xs font-medium text-gray-700">
          {firstDay.toLocaleDateString('en-SG', { month: 'long', year: 'numeric' })}
        </span>
        <button onClick={() => { if (!canNext) return; const d = new Date(calMonth.year, calMonth.month + 1, 1); setCalMonth({ year: d.getFullYear(), month: d.getMonth() }) }}
          disabled={!canNext} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30">
          <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
        </button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {['Mo','Tu','We','Th','Fr','Sa','Su'].map(d => (
          <div key={d} className="text-center text-xs text-gray-400 font-medium py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {Array.from({ length: rows * 7 }).map((_, i) => {
          const dayNum = i - startDow + 1
          if (dayNum < 1 || dayNum > lastDay.getDate()) return <div key={i} />
          const date = new Date(calMonth.year, calMonth.month, dayNum)
          const s = toDateStr(date)
          const valid = isValid(s)
          const isFrom = s === from
          const isTo = s === to
          const inRange = isInRange(s)
          const isToday = s === toDateStr(today)
          return (
            <button key={i} onClick={() => handleClick(s)}
              onMouseEnter={() => valid && setHovered(s)}
              onMouseLeave={() => setHovered(null)}
              disabled={!valid}
              className={cn('h-7 w-full text-xs rounded-md transition-colors',
                !valid && 'text-gray-200 cursor-not-allowed',
                valid && !isFrom && !isTo && !inRange && 'text-gray-700 hover:bg-gray-100',
                valid && inRange && 'bg-red-50 text-red-800',
                (isFrom || isTo) && 'bg-red-600 text-white font-medium',
                isToday && !isFrom && !isTo && 'font-semibold',
              )}>
              {dayNum}
            </button>
          )
        })}
      </div>
      <p className="text-xs text-gray-400 mt-2 text-center">
        {selecting === 'from' ? 'Click to set start date' : 'Click to set end date'}
      </p>
    </div>
  )
}

export default function ActivityLogsPage() {
  const { user } = useCurrentUser({ allowedRoles: ['admin'] })
  const supabase = createClient()
  const router = useRouter()
  const { logActivity } = useActivityLog()
  const hasLoggedPageView = useRef(false)

  const [logs, setLogs] = useState<any[]>([])
  const [staffList, setStaffList] = useState<string[]>([])
  const [allStaffList, setAllStaffList] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const { error, showError, setError } = useToast()
  const [filterDateFrom, setFilterDateFrom] = useState(() => offsetDate(0))
  const [filterDateTo, setFilterDateTo] = useState(() => offsetDate(0))
  const [activePreset, setActivePreset] = useState('Today')
  const [showCalendar, setShowCalendar] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStaff, setFilterStaff] = useState('all')
  const [filterAction, setFilterAction] = useState('all')

  const applyPreset = (p: typeof PRESETS[0]) => {
    setFilterDateFrom(offsetDate(p.from))
    setFilterDateTo(offsetDate(p.to))
    setActivePreset(p.label)
    setShowCalendar(false)
  }

  const loadLogs = useCallback(async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) { router.replace('/dashboard'); return }
    if (!hasLoggedPageView.current) {
      hasLoggedPageView.current = true
      logActivity('page_view', 'Activity Logs', 'Viewed activity logs')
    }
    const { data: me } = await supabase.from('users_safe').select('role').eq('id', authUser.id).maybeSingle()
    if (!me || me.role !== 'admin') { router.replace('/dashboard'); return }

    let q = supabase.from('activity_logs')
      .select('*')
      .gte('created_at', filterDateFrom + 'T00:00:00+08:00')
      .lte('created_at', filterDateTo + 'T23:59:59+08:00')
      .order('created_at', { ascending: false })
      .limit(5000)  // high limit — date filter is the primary constraint; 5000 covers months of activity
    if (filterStaff !== 'all') q = q.eq('user_name', filterStaff)
    if (filterAction !== 'all') q = q.eq('action_type', filterAction)

    const { data, error: queryErr } = await q
    if (queryErr) { showError('Failed to load logs: ' + queryErr.message); setLoading(false); return }
    setLogs(data || [])

    // Current period staff for display
    const names = Array.from(new Set((data || []).map((l: any) => l.user_name))).sort()
    setStaffList(names as string[])

    setLoading(false)
    setLastRefresh(new Date())
  }, [filterDateFrom, filterDateTo, filterStaff, filterAction])

  // Load full 14-day staff list once on mount — independent of date filter
  // so dropdown always shows all staff regardless of selected period
  useEffect(() => {
    const loadAllStaff = async () => {
      const since14 = new Date(Date.now() + 8 * 60 * 60 * 1000); since14.setUTCDate(since14.getUTCDate() - 13)
      const { data } = await supabase.from('activity_logs')
        .select('user_name').gte('created_at', since14.toISOString())
      const names = Array.from(new Set((data || []).map((l: any) => l.user_name))).sort()
      setAllStaffList(names as string[])
    }
    loadAllStaff()
  }, [])

  useEffect(() => { loadLogs() }, [loadLogs])
  useEffect(() => { const t = setInterval(loadLogs, 30000); return () => clearInterval(t) }, [loadLogs])

  const filtered = logs.filter(l => {
    if (!search) return true
    const q = search.toLowerCase()
    return l.user_name?.toLowerCase().includes(q) || l.page?.toLowerCase().includes(q) ||
      l.description?.toLowerCase().includes(q) || l.ip_address?.includes(q) ||
      l.browser?.toLowerCase().includes(q) || l.os?.toLowerCase().includes(q)
  })

  const exportCSV = () => {
    const headers = ['DateTime','Staff Name','Role','Action','Page','Description','Browser','OS','Device','IP Address']
    const rows = filtered.map(l => [formatDateTime(l.created_at), l.user_name, l.role, l.action_type, l.page, l.description, l.browser||'', l.os||'', l.device||'', l.ip_address||''])
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `activity_logs_${filterDateFrom}_to_${filterDateTo}.csv`
    a.click(); URL.revokeObjectURL(url)
    logActivity('export', 'Activity Logs', `Exported activity logs ${filterDateFrom} to ${filterDateTo}`)
  }

  const dayCount = Math.round((new Date(filterDateTo).getTime() - new Date(filterDateFrom).getTime()) / 86400000) + 1

  if (loading) return <PageSpinner />

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Activity className="w-5 h-5 text-red-600" /> Activity Logs
          </h1>
          <p className="text-sm text-gray-500">Rolling 14-day window · Last refreshed {formatDateTime(lastRefresh.toISOString())} · Auto-refreshes every 30s</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCSV} className="btn-secondary flex items-center gap-1.5 text-xs">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          <button onClick={loadLogs} className="btn-secondary flex items-center gap-1.5 text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      <StatusBanner error={error} onDismissError={() => setError('')} />

      <div className="card p-4 space-y-3">
        {/* Quick date presets */}
        <div>
          <p className="text-xs text-gray-500 mb-2">Date range</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => applyPreset(p)}
                className={cn('text-xs px-3 py-1.5 rounded-full border transition-colors',
                  activePreset === p.label ? 'bg-red-600 text-white border-red-600' : 'text-gray-600 border-gray-200 hover:border-gray-300')}>
                {p.label}
              </button>
            ))}
            <button onClick={() => { setShowCalendar(v => !v); setActivePreset('custom') }}
              className={cn('text-xs px-3 py-1.5 rounded-full border transition-colors',
                activePreset === 'custom' ? 'bg-red-600 text-white border-red-600' : 'text-gray-600 border-gray-200 hover:border-gray-300')}>
              Custom
            </button>
          </div>

          {/* Range summary */}
          <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
            <span className="font-medium text-gray-900">{formatDate(filterDateFrom)}</span>
            <span>→</span>
            <span className="font-medium text-gray-900">{formatDate(filterDateTo)}</span>
            <span className="text-gray-400">({dayCount} day{dayCount !== 1 ? 's' : ''})</span>
          </div>

          {/* Mini calendar */}
          {showCalendar && (
            <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-200 max-w-xs">
              <MiniCalendar from={filterDateFrom} to={filterDateTo}
                onChange={(from, to) => { setFilterDateFrom(from); setFilterDateTo(to) }} />
            </div>
          )}
        </div>

        {/* Staff + Action filters */}
        <div className="flex flex-wrap gap-3">
          <select className="input text-xs py-1.5 min-w-40" value={filterStaff} onChange={e => setFilterStaff(e.target.value)}>
            <option value="all">All staff</option>
            {(allStaffList.length > 0 ? allStaffList : staffList).map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <select className="input text-xs py-1.5" value={filterAction} onChange={e => setFilterAction(e.target.value)}>
            {ACTION_TYPES.map(a => <option key={a} value={a}>{a === 'all' ? 'All actions' : a}</option>)}
          </select>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input className="input pl-8 text-xs py-1.5" placeholder="Search name, page, description, IP, browser..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="stat-card"><p className="text-xs text-gray-500">Total Entries</p><p className="text-xl font-bold">{filtered.length}</p></div>
        <div className="stat-card"><p className="text-xs text-gray-500">Unique Staff</p><p className="text-xl font-bold">{new Set(filtered.map(l => l.user_name)).size}</p></div>
        <div className="stat-card"><p className="text-xs text-gray-500">Logins</p><p className="text-xl font-bold">{filtered.filter(l => l.action_type === 'login').length}</p></div>
        <div className="stat-card"><p className="text-xs text-gray-500">Actions</p><p className="text-xl font-bold">{filtered.filter(l => !['login','logout','page_view'].includes(l.action_type)).length}</p></div>
      </div>

      {/* Log table — scrollable area */}
      <div className="flex-1 min-h-0 flex flex-col">
      {filtered.length === 0 ? (
        <div className="card p-8 text-center flex-1">
          <Activity className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No activity logs found for the selected filters</p>
        </div>
      ) : (
        <div className="card overflow-hidden flex-1 min-h-0 flex flex-col">
          <div className="overflow-auto flex-1 min-h-0">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
                <tr>
                  {['Date & Time','Staff','Role','Action','Page','Description','Browser','OS','Device','IP'].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-gray-500 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(l => (
                  <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{formatDateTime(l.created_at)}</td>
                    <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{l.user_name}</td>
                    <td className="px-3 py-2 text-gray-500 capitalize whitespace-nowrap">{l.role?.replace('_',' ')}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={cn('px-1.5 py-0.5 rounded-full text-xs font-medium', ACTION_BADGE[l.action_type] || 'bg-gray-100 text-gray-600')}>
                        {l.action_type}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{l.page}</td>
                    <td className="px-3 py-2 text-gray-600 max-w-xs truncate">{l.description}</td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.browser||'—'}</td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.os||'—'}</td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.device||'—'}</td>
                    <td className="px-3 py-2 text-gray-400 whitespace-nowrap font-mono">{l.ip_address||'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
