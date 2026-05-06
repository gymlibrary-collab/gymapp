'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { formatDate, formatDateTime } from '@/lib/utils'
import { Activity, Download, RefreshCw, Search, Filter } from 'lucide-react'
import { cn } from '@/lib/utils'

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

export default function ActivityLogsPage() {
  const supabase = createClient()
  const router = useRouter()

  const [logs, setLogs] = useState<any[]>([])
  const [staffList, setStaffList] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState(new Date())

  // Filters
  const [search, setSearch] = useState('')
  const [filterStaff, setFilterStaff] = useState('all')
  const [filterAction, setFilterAction] = useState('all')
  const [filterDateFrom, setFilterDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]
  })
  const [filterDateTo, setFilterDateTo] = useState(new Date().toISOString().split('T')[0])

  // Export date range (separate from filter)
  const [exportFrom, setExportFrom] = useState(filterDateFrom)
  const [exportTo, setExportTo] = useState(filterDateTo)

  const loadLogs = useCallback(async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) { router.replace('/dashboard'); return }
    const { data: me } = await supabase.from('users').select('role').eq('id', authUser.id).single()
    if (!me || me.role !== 'admin') { router.replace('/dashboard'); return }

    let q = supabase.from('activity_logs')
      .select('*')
      .gte('created_at', filterDateFrom + 'T00:00:00')
      .lte('created_at', filterDateTo + 'T23:59:59')
      .order('created_at', { ascending: false })
      .limit(500)

    if (filterStaff !== 'all') q = q.eq('user_name', filterStaff)
    if (filterAction !== 'all') q = q.eq('action_type', filterAction)

    const { data } = await q
    setLogs(data || [])

    // Build staff list for filter dropdown
    const names = Array.from(new Set((data || []).map((l: any) => l.user_name))).sort()
    setStaffList(names as string[])

    setLoading(false)
    setLastRefresh(new Date())
  }, [filterDateFrom, filterDateTo, filterStaff, filterAction])

  // Initial load
  useEffect(() => { loadLogs() }, [loadLogs])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => { loadLogs() }, 30000)
    return () => clearInterval(interval)
  }, [loadLogs])

  const filtered = logs.filter(l => {
    if (!search) return true
    const q = search.toLowerCase()
    return l.user_name?.toLowerCase().includes(q) ||
      l.page?.toLowerCase().includes(q) ||
      l.description?.toLowerCase().includes(q) ||
      l.ip_address?.includes(q) ||
      l.browser?.toLowerCase().includes(q) ||
      l.os?.toLowerCase().includes(q)
  })

  const exportCSV = () => {
    const inRange = logs.filter(l => {
      const d = l.created_at?.split('T')[0]
      return d >= exportFrom && d <= exportTo
    })
    const headers = ['DateTime', 'Staff Name', 'Role', 'Action', 'Page', 'Description', 'Browser', 'OS', 'Device', 'IP Address']
    const rows = inRange.map(l => [
      formatDateTime(l.created_at),
      l.user_name,
      l.role,
      l.action_type,
      l.page,
      l.description,
      l.browser || '',
      l.os || '',
      l.device || '',
      l.ip_address || '',
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `activity_logs_${exportFrom}_to_${exportTo}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600" />
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Activity className="w-5 h-5 text-red-600" /> Activity Logs
          </h1>
          <p className="text-sm text-gray-500">Rolling 14-day window · Last refreshed {formatDateTime(lastRefresh.toISOString())} · Auto-refreshes every 30s</p>
        </div>
        <button onClick={loadLogs} className="btn-secondary flex items-center gap-1.5 text-xs">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap gap-3">
          {/* Date range */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 whitespace-nowrap">From</label>
            <input type="date" className="input text-xs py-1.5" value={filterDateFrom}
              onChange={e => setFilterDateFrom(e.target.value)} />
            <label className="text-xs text-gray-500">To</label>
            <input type="date" className="input text-xs py-1.5" value={filterDateTo}
              onChange={e => setFilterDateTo(e.target.value)} />
          </div>
          {/* Staff filter */}
          <select className="input text-xs py-1.5 min-w-40" value={filterStaff}
            onChange={e => setFilterStaff(e.target.value)}>
            <option value="all">All staff</option>
            {staffList.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          {/* Action filter */}
          <select className="input text-xs py-1.5" value={filterAction}
            onChange={e => setFilterAction(e.target.value)}>
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

      {/* Export */}
      <div className="card p-3 flex items-center gap-3">
        <Download className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <span className="text-xs text-gray-600">Export CSV:</span>
        <input type="date" className="input text-xs py-1" value={exportFrom}
          onChange={e => setExportFrom(e.target.value)} />
        <span className="text-xs text-gray-400">to</span>
        <input type="date" className="input text-xs py-1" value={exportTo}
          onChange={e => setExportTo(e.target.value)} />
        <button onClick={exportCSV} className="btn-primary text-xs py-1.5 flex items-center gap-1.5 flex-shrink-0">
          <Download className="w-3.5 h-3.5" /> Download CSV
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="stat-card"><p className="text-xs text-gray-500">Total Entries</p><p className="text-xl font-bold">{filtered.length}</p></div>
        <div className="stat-card"><p className="text-xs text-gray-500">Unique Staff</p><p className="text-xl font-bold">{new Set(filtered.map(l => l.user_name)).size}</p></div>
        <div className="stat-card"><p className="text-xs text-gray-500">Logins</p><p className="text-xl font-bold">{filtered.filter(l => l.action_type === 'login').length}</p></div>
        <div className="stat-card"><p className="text-xs text-gray-500">Actions</p><p className="text-xl font-bold">{filtered.filter(l => !['login', 'logout', 'page_view'].includes(l.action_type)).length}</p></div>
      </div>

      {/* Log table */}
      {filtered.length === 0 ? (
        <div className="card p-8 text-center">
          <Activity className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No activity logs found for the selected filters</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Date & Time', 'Staff', 'Role', 'Action', 'Page', 'Description', 'Browser', 'OS', 'Device', 'IP'].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-gray-500 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(l => (
                  <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{formatDateTime(l.created_at)}</td>
                    <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{l.user_name}</td>
                    <td className="px-3 py-2 text-gray-500 capitalize whitespace-nowrap">{l.role?.replace('_', ' ')}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={cn('px-1.5 py-0.5 rounded-full text-xs font-medium', ACTION_BADGE[l.action_type] || 'bg-gray-100 text-gray-600')}>
                        {l.action_type}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{l.page}</td>
                    <td className="px-3 py-2 text-gray-600 max-w-xs truncate">{l.description}</td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.browser || '—'}</td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.os || '—'}</td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.device || '—'}</td>
                    <td className="px-3 py-2 text-gray-400 whitespace-nowrap font-mono">{l.ip_address || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
