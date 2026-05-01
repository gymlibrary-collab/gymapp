'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { User, Gym } from '@/types'
import { formatSGD, formatDate, formatDateTime } from '@/lib/utils'
import { Download, Search, ChevronDown, ChevronUp, FileText } from 'lucide-react'

interface TrainerReport {
  trainer_id: string
  trainer_name: string
  packages_sold: number
  package_revenue: number
  sessions: SessionRow[]
  sessions_count: number
  qualified_sessions: number
}

interface SessionRow {
  id: string
  scheduled_at: string
  client_name: string
  status: string
  is_notes_complete: boolean
  notes_submitted_at: string | null
}

export default function ReportsPage() {
  const [user, setUser] = useState<User | null>(null)
  const [gyms, setGyms] = useState<Gym[]>([])
  const [trainers, setTrainers] = useState<User[]>([])
  const [selectedGym, setSelectedGym] = useState<string>('all')
  const [selectedTrainer, setSelectedTrainer] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0])
  const [report, setReport] = useState<TrainerReport[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedTrainers, setExpandedTrainers] = useState<Set<string>>(new Set())
  const supabase = createClient()

  useEffect(() => { init() }, [])

  const init = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return
    const { data: userData } = await supabase.from('users').select('*').eq('id', authUser.id).single()
    setUser(userData)

    if (userData?.role === 'business_ops' || userData?.role === 'admin') {
      const { data: gymData } = await supabase.from('gyms').select('*').eq('is_active', true).order('name')
      setGyms(gymData || [])
      const { data: trainerData } = await supabase.from('users').select('*').eq('role', 'trainer').eq('is_active', true).order('full_name')
      setTrainers(trainerData || [])
    } else if (userData?.role === 'manager' && userData?.manager_gym_id) {
      setSelectedGym(userData.manager_gym_id)
      // Load trainers for this gym only
      const { data: gymTrainers } = await supabase
        .from('trainer_gyms').select('trainer_id, users(id, full_name)')
        .eq('gym_id', userData.manager_gym_id)
      setTrainers(gymTrainers?.map((t: any) => t.users).filter(Boolean) || [])
    } else if (userData?.role === 'trainer') {
      // Trainer sees only themselves
      setSelectedTrainer(authUser.id)
    }
  }

  const generateReport = useCallback(async () => {
    if (!user) return
    setLoading(true)

    const fromDate = new Date(dateFrom + 'T00:00:00').toISOString()
    const toDate = new Date(dateTo + 'T23:59:59').toISOString()

    // Determine which trainers to show
    let trainerList: { id: string; full_name: string }[] = []

    if (user.role === 'trainer') {
      trainerList = [{ id: user.id, full_name: user.full_name }]
    } else if (selectedTrainer !== 'all') {
      const found = trainers.find(t => t.id === selectedTrainer)
      if (found) trainerList = [{ id: found.id, full_name: found.full_name }]
    } else if (selectedGym !== 'all') {
      const { data: gymTrainers } = await supabase
        .from('trainer_gyms').select('trainer_id, users(id, full_name)')
        .eq('gym_id', selectedGym)
      trainerList = gymTrainers?.map((t: any) => t.users).filter(Boolean) || []
    } else {
      trainerList = trainers.map(t => ({ id: t.id, full_name: t.full_name }))
    }

    const results: TrainerReport[] = []

    for (const trainer of trainerList) {
      // Packages sold in date range
      let pkgQuery = supabase.from('packages')
        .select('id, total_price_sgd, gym_id')
        .eq('trainer_id', trainer.id)
        .gte('created_at', fromDate)
        .lte('created_at', toDate)
      if (selectedGym !== 'all') pkgQuery = pkgQuery.eq('gym_id', selectedGym)
      const { data: pkgs } = await pkgQuery

      // Sessions conducted in date range
      let sessQuery = supabase.from('sessions')
        .select('id, scheduled_at, status, is_notes_complete, notes_submitted_at, clients(full_name), gym_id')
        .eq('trainer_id', trainer.id)
        .eq('status', 'completed')
        .gte('scheduled_at', fromDate)
        .lte('scheduled_at', toDate)
        .order('scheduled_at', { ascending: true })
      if (selectedGym !== 'all') sessQuery = sessQuery.eq('gym_id', selectedGym)
      const { data: sessions } = await sessQuery

      const sessionRows: SessionRow[] = (sessions || []).map((s: any) => ({
        id: s.id,
        scheduled_at: s.scheduled_at,
        client_name: s.clients?.full_name || '—',
        status: s.status,
        is_notes_complete: s.is_notes_complete,
        notes_submitted_at: s.notes_submitted_at,
      }))

      results.push({
        trainer_id: trainer.id,
        trainer_name: trainer.full_name,
        packages_sold: pkgs?.length || 0,
        package_revenue: pkgs?.reduce((s, p) => s + (p.total_price_sgd || 0), 0) || 0,
        sessions: sessionRows,
        sessions_count: sessionRows.length,
        qualified_sessions: sessionRows.filter(s => s.is_notes_complete).length,
      })
    }

    setReport(results)
    setExpandedTrainers(new Set(results.map(r => r.trainer_id)))
    setLoading(false)
  }, [user, dateFrom, dateTo, selectedGym, selectedTrainer, trainers])

  const toggleTrainer = (id: string) => {
    setExpandedTrainers(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const exportCSV = () => {
    const rows: string[][] = []
    rows.push(['Trainer', 'Packages Sold', 'Revenue (SGD)', 'Sessions Conducted', 'Qualified Sessions (with notes)'])
    report.forEach(r => {
      rows.push([r.trainer_name, String(r.packages_sold), r.package_revenue.toFixed(2), String(r.sessions_count), String(r.qualified_sessions)])
    })
    rows.push([])
    rows.push(['--- Session Detail ---'])
    rows.push(['Trainer', 'Date', 'Time', 'Client', 'Notes Submitted'])
    report.forEach(r => {
      r.sessions.forEach(s => {
        const d = new Date(s.scheduled_at)
        rows.push([
          r.trainer_name,
          formatDate(s.scheduled_at),
          d.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' }),
          s.client_name,
          s.is_notes_complete ? formatDateTime(s.notes_submitted_at!) : 'Pending',
        ])
      })
    })
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `report_${dateFrom}_to_${dateTo}.csv`
    a.click()
  }

  const exportPDF = async () => {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF()

    doc.setFontSize(16)
    doc.text('Trainer Performance Report', 14, 18)
    doc.setFontSize(10)
    doc.text(`Period: ${formatDate(dateFrom)} to ${formatDate(dateTo)}`, 14, 26)
    doc.text(`Generated: ${formatDateTime(new Date().toISOString())}`, 14, 32)

    let y = 40

    // Summary table
    autoTable(doc, {
      startY: y,
      head: [['Trainer', 'Packages Sold', 'Revenue', 'Sessions', 'Qualified']],
      body: report.map(r => [
        r.trainer_name, r.packages_sold, formatSGD(r.package_revenue),
        r.sessions_count, r.qualified_sessions
      ]),
      foot: [['TOTAL', report.reduce((s,r)=>s+r.packages_sold,0), formatSGD(report.reduce((s,r)=>s+r.package_revenue,0)), report.reduce((s,r)=>s+r.sessions_count,0), report.reduce((s,r)=>s+r.qualified_sessions,0)]],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [22, 163, 74] },
      footStyles: { fillColor: [240, 253, 244], textColor: [22, 163, 74], fontStyle: 'bold' },
    })

    y = (doc as any).lastAutoTable.finalY + 12

    // Session detail per trainer
    for (const r of report) {
      if (r.sessions.length === 0) continue
      if (y > 240) { doc.addPage(); y = 20 }

      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.text(r.trainer_name, 14, y)
      y += 4

      autoTable(doc, {
        startY: y,
        head: [['Date', 'Time', 'Client', 'Notes Submitted At']],
        body: r.sessions.map(s => {
          const d = new Date(s.scheduled_at)
          return [
            formatDate(s.scheduled_at),
            d.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' }),
            s.client_name,
            s.is_notes_complete && s.notes_submitted_at
              ? formatDateTime(s.notes_submitted_at)
              : 'Pending',
          ]
        }),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [100, 150, 100] },
      })

      y = (doc as any).lastAutoTable.finalY + 10
    }

    doc.save(`report_${dateFrom}_to_${dateTo}.pdf`)
  }

  const totalSessions = report.reduce((s, r) => s + r.sessions_count, 0)
  const totalQualified = report.reduce((s, r) => s + r.qualified_sessions, 0)
  const totalPackages = report.reduce((s, r) => s + r.packages_sold, 0)
  const totalRevenue = report.reduce((s, r) => s + r.package_revenue, 0)

  const isTrainer = user?.role === 'trainer'
  const isManager = user?.role === 'manager'
  const isBizOps = user?.role === 'business_ops' || user?.role === 'admin'

  if (!user) return <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600" /></div>

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {isTrainer ? 'My Performance Report' : 'Trainer Performance Report'}
          </h1>
          <p className="text-sm text-gray-500">Sessions conducted with date, time and client details</p>
        </div>
        {report.length > 0 && (
          <div className="flex gap-2">
            <button onClick={exportCSV} className="btn-secondary flex items-center gap-1.5 text-xs">
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            <button onClick={exportPDF} className="btn-secondary flex items-center gap-1.5 text-xs">
              <Download className="w-3.5 h-3.5" /> PDF
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="card p-4 space-y-3">
        <p className="text-sm font-medium text-gray-700">Report Filters</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="label">From Date</label>
            <input className="input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">To Date</label>
            <input className="input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          {isBizOps && (
            <div>
              <label className="label">Gym Club</label>
              <select className="input" value={selectedGym} onChange={e => { setSelectedGym(e.target.value); setSelectedTrainer('all') }}>
                <option value="all">All Gyms</option>
                {gyms.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          )}
          {(isBizOps || isManager) && (
            <div>
              <label className="label">Trainer</label>
              <select className="input" value={selectedTrainer} onChange={e => setSelectedTrainer(e.target.value)}>
                <option value="all">All Trainers</option>
                {trainers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
            </div>
          )}
        </div>
        <button onClick={generateReport} disabled={loading} className="btn-primary flex items-center gap-2">
          <Search className="w-4 h-4" />
          {loading ? 'Generating...' : 'Generate Report'}
        </button>
      </div>

      {/* Summary Cards */}
      {report.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="stat-card">
              <p className="text-xs text-gray-500">Packages Sold</p>
              <p className="text-2xl font-bold text-gray-900">{totalPackages}</p>
            </div>
            <div className="stat-card">
              <p className="text-xs text-gray-500">Package Revenue</p>
              <p className="text-xl font-bold text-gray-900">{formatSGD(totalRevenue)}</p>
            </div>
            <div className="stat-card">
              <p className="text-xs text-gray-500">Sessions Conducted</p>
              <p className="text-2xl font-bold text-gray-900">{totalSessions}</p>
            </div>
            <div className="stat-card">
              <p className="text-xs text-gray-500">Qualified for Payout</p>
              <p className="text-2xl font-bold text-green-700">{totalQualified}</p>
            </div>
          </div>

          {/* Per-Trainer Breakdown */}
          <div className="space-y-3">
            {report.map(r => (
              <div key={r.trainer_id} className="card overflow-hidden">
                {/* Trainer Header */}
                <button
                  onClick={() => toggleTrainer(r.trainer_id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-green-700 font-semibold text-sm">{r.trainer_name.charAt(0)}</span>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{r.trainer_name}</p>
                      <p className="text-xs text-gray-500">
                        {r.packages_sold} package{r.packages_sold !== 1 ? 's' : ''} · {r.sessions_count} session{r.sessions_count !== 1 ? 's' : ''} · {r.qualified_sessions} qualified
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-green-700">{formatSGD(r.package_revenue)}</span>
                    {expandedTrainers.has(r.trainer_id)
                      ? <ChevronUp className="w-4 h-4 text-gray-400" />
                      : <ChevronDown className="w-4 h-4 text-gray-400" />
                    }
                  </div>
                </button>

                {/* Session List */}
                {expandedTrainers.has(r.trainer_id) && (
                  <div className="border-t border-gray-100">
                    {r.sessions.length === 0 ? (
                      <p className="p-4 text-sm text-gray-400 text-center">No completed sessions in this period</p>
                    ) : (
                      <>
                        {/* Table header */}
                        <div className="grid grid-cols-4 gap-2 px-4 py-2 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide">
                          <span>Date</span>
                          <span>Time</span>
                          <span>Client</span>
                          <span>Notes Status</span>
                        </div>
                        {r.sessions.map(s => {
                          const d = new Date(s.scheduled_at)
                          return (
                            <div key={s.id} className="grid grid-cols-4 gap-2 px-4 py-3 border-t border-gray-50 text-sm items-center">
                              <span className="text-gray-700">{formatDate(s.scheduled_at)}</span>
                              <span className="text-gray-700">
                                {d.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <span className="text-gray-900 font-medium truncate">{s.client_name}</span>
                              <span>
                                {s.is_notes_complete && s.notes_submitted_at ? (
                                  <span className="badge-active text-xs">
                                    ✓ {formatDate(s.notes_submitted_at)}
                                  </span>
                                ) : (
                                  <span className="badge-pending text-xs">Pending</span>
                                )}
                              </span>
                            </div>
                          )
                        })}
                        {/* Trainer subtotal */}
                        <div className="grid grid-cols-4 gap-2 px-4 py-2 bg-green-50 border-t border-green-100 text-xs font-medium text-green-800">
                          <span className="col-span-2">Subtotal</span>
                          <span>{r.sessions_count} sessions</span>
                          <span>{r.qualified_sessions} qualified</span>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {report.length === 0 && !loading && (
        <div className="card p-10 text-center">
          <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Set your date range and click "Generate Report"</p>
        </div>
      )}
    </div>
  )
}
