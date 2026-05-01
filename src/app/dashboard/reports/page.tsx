'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { User } from '@/types'
import { formatSGD, getMonthName } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts'
import { Download, TrendingUp, Users, DollarSign } from 'lucide-react'

export default function ReportsPage() {
  const [user, setUser] = useState<User | null>(null)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedTrainer, setSelectedTrainer] = useState('all')
  const [trainers, setTrainers] = useState<User[]>([])
  const [monthlyData, setMonthlyData] = useState<any[]>([])
  const [performanceData, setPerformanceData] = useState<any[]>([])
  const [payoutSummary, setPayoutSummary] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return
      const { data: userData } = await supabase.from('users').select('*').eq('id', authUser.id).single()
      setUser(userData)

      if (userData?.role !== 'trainer') {
        const { data: trainerList } = await supabase.from('users').select('*').eq('role', 'trainer').eq('is_active', true)
        setTrainers(trainerList || [])
      }

      await loadReportData(authUser.id, userData?.role)
      setLoading(false)
    }
    load()
  }, [selectedYear, selectedMonth, selectedTrainer])

  const loadReportData = async (authId: string, role: string) => {
    const isTrainer = role === 'trainer'
    const trainerId = isTrainer ? authId : (selectedTrainer !== 'all' ? selectedTrainer : null)

    // Monthly sessions + commission for chart
    const monthlyChartData = []
    for (let m = 1; m <= 12; m++) {
      const start = new Date(selectedYear, m - 1, 1).toISOString()
      const end = new Date(selectedYear, m, 0, 23, 59, 59).toISOString()

      let q = supabase.from('sessions').select('session_commission_sgd')
        .eq('status', 'completed')
        .gte('marked_complete_at', start)
        .lte('marked_complete_at', end)
      if (trainerId) q = q.eq('trainer_id', trainerId)

      const { data: sessData } = await q
      const commission = sessData?.reduce((s, r) => s + (r.session_commission_sgd || 0), 0) || 0

      let cq = supabase.from('clients').select('id', { count: 'exact', head: true })
        .gte('created_at', start).lte('created_at', end)
      if (trainerId) cq = cq.eq('trainer_id', trainerId)
      const { count: newClients } = await cq

      monthlyChartData.push({ month: getMonthName(m).slice(0, 3), sessions: sessData?.length || 0, commission, newClients: newClients || 0 })
    }
    setMonthlyData(monthlyChartData)

    // Monthly payout summary for selected month
    const monthStart = new Date(selectedYear, selectedMonth - 1, 1).toISOString()
    const monthEnd = new Date(selectedYear, selectedMonth, 0, 23, 59, 59).toISOString()

    let payoutQ = supabase.from('users')
      .select('id, full_name, commission_signup_pct, commission_session_pct')
      .eq('role', 'trainer').eq('is_active', true)
    if (trainerId) payoutQ = payoutQ.eq('id', trainerId)
    const { data: trainerList } = await payoutQ

    const summaries = await Promise.all((trainerList || []).map(async (t) => {
      const { data: sessions } = await supabase.from('sessions')
        .select('session_commission_sgd').eq('trainer_id', t.id)
        .eq('status', 'completed').gte('marked_complete_at', monthStart).lte('marked_complete_at', monthEnd)
      const { data: packages } = await supabase.from('packages')
        .select('signup_commission_sgd').eq('trainer_id', t.id)
        .gte('created_at', monthStart).lte('created_at', monthEnd)
      const { count: newC } = await supabase.from('clients').select('id', { count: 'exact', head: true })
        .eq('trainer_id', t.id).gte('created_at', monthStart).lte('created_at', monthEnd)

      const sessionComm = sessions?.reduce((s, r) => s + (r.session_commission_sgd || 0), 0) || 0
      const signupComm = packages?.reduce((s, r) => s + (r.signup_commission_sgd || 0), 0) || 0

      return {
        trainer: t.full_name,
        trainer_id: t.id,
        sessions_completed: sessions?.length || 0,
        new_clients: newC || 0,
        signup_commission: signupComm,
        session_commission: sessionComm,
        total_commission: signupComm + sessionComm,
      }
    }))
    setPayoutSummary(summaries)
  }

  const exportCSV = () => {
    const headers = ['Trainer', 'Sessions Completed', 'New Clients', 'Sign-up Commission (SGD)', 'Session Commission (SGD)', 'Total Commission (SGD)']
    const rows = payoutSummary.map(r => [
      r.trainer, r.sessions_completed, r.new_clients,
      r.signup_commission.toFixed(2), r.session_commission.toFixed(2), r.total_commission.toFixed(2)
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `payout_${getMonthName(selectedMonth)}_${selectedYear}.csv`
    a.click()
  }

  const exportPDF = async () => {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF()

    doc.setFontSize(18)
    doc.text('GymApp Monthly Payout Report', 14, 20)
    doc.setFontSize(11)
    doc.text(`${getMonthName(selectedMonth)} ${selectedYear}`, 14, 30)
    doc.text(`Generated: ${new Date().toLocaleDateString('en-SG')}`, 14, 37)

    autoTable(doc, {
      startY: 45,
      head: [['Trainer', 'Sessions', 'New Clients', 'Sign-up Comm.', 'Session Comm.', 'Total']],
      body: payoutSummary.map(r => [
        r.trainer, r.sessions_completed, r.new_clients,
        formatSGD(r.signup_commission), formatSGD(r.session_commission), formatSGD(r.total_commission)
      ]),
      foot: [['TOTAL', '', '',
        formatSGD(payoutSummary.reduce((s, r) => s + r.signup_commission, 0)),
        formatSGD(payoutSummary.reduce((s, r) => s + r.session_commission, 0)),
        formatSGD(payoutSummary.reduce((s, r) => s + r.total_commission, 0)),
      ]],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [22, 163, 74] },
      footStyles: { fillColor: [240, 253, 244], textColor: [22, 163, 74], fontStyle: 'bold' },
    })

    doc.save(`payout_${getMonthName(selectedMonth)}_${selectedYear}.pdf`)
  }

  if (loading) return <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600" /></div>

  const isTrainer = user?.role === 'trainer'
  const totalCommission = payoutSummary.reduce((s, r) => s + r.total_commission, 0)
  const totalSessions = payoutSummary.reduce((s, r) => s + r.sessions_completed, 0)
  const totalNewClients = payoutSummary.reduce((s, r) => s + r.new_clients, 0)
  const years = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500">{isTrainer ? 'Your performance summary' : 'All trainer reports & payouts'}</p>
        </div>
        {!isTrainer && (
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
      <div className="card p-3 flex flex-wrap gap-2">
        <select className="input w-auto" value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className="input w-auto" value={selectedMonth} onChange={e => setSelectedMonth(parseInt(e.target.value))}>
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i + 1} value={i + 1}>{getMonthName(i + 1)}</option>
          ))}
        </select>
        {!isTrainer && (
          <select className="input w-auto" value={selectedTrainer} onChange={e => setSelectedTrainer(e.target.value)}>
            <option value="all">All Trainers</option>
            {trainers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </select>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="stat-card">
          <div className="flex items-center gap-1.5 mb-1">
            <DollarSign className="w-4 h-4 text-green-600" />
            <p className="text-xs text-gray-500">Total Commission</p>
          </div>
          <p className="text-xl font-bold text-gray-900">{formatSGD(totalCommission)}</p>
          <p className="text-xs text-gray-400">{getMonthName(selectedMonth)} {selectedYear}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            <p className="text-xs text-gray-500">Sessions Done</p>
          </div>
          <p className="text-xl font-bold text-gray-900">{totalSessions}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-1.5 mb-1">
            <Users className="w-4 h-4 text-purple-600" />
            <p className="text-xs text-gray-500">New Clients</p>
          </div>
          <p className="text-xl font-bold text-gray-900">{totalNewClients}</p>
        </div>
      </div>

      {/* Annual Performance Chart */}
      <div className="card p-4">
        <h2 className="font-semibold text-gray-900 text-sm mb-4">{selectedYear} — Sessions & New Clients by Month</h2>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={monthlyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip formatter={(val: any, name: string) => [val, name === 'sessions' ? 'Sessions' : 'New Clients']} />
            <Legend formatter={(val) => val === 'sessions' ? 'Sessions' : 'New Clients'} />
            <Bar dataKey="sessions" fill="#16a34a" radius={[3, 3, 0, 0]} />
            <Bar dataKey="newClients" fill="#93c5fd" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Payout Table */}
      <div className="card">
        <div className="p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm">
            {getMonthName(selectedMonth)} {selectedYear} — Payout Breakdown
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left p-3">Trainer</th>
                <th className="text-center p-3">Sessions</th>
                <th className="text-center p-3">New Clients</th>
                <th className="text-right p-3">Sign-up Comm.</th>
                <th className="text-right p-3">Session Comm.</th>
                <th className="text-right p-3 font-bold text-gray-700">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payoutSummary.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="p-3 font-medium text-gray-900">{row.trainer}</td>
                  <td className="p-3 text-center text-gray-600">{row.sessions_completed}</td>
                  <td className="p-3 text-center text-gray-600">{row.new_clients}</td>
                  <td className="p-3 text-right text-gray-600">{formatSGD(row.signup_commission)}</td>
                  <td className="p-3 text-right text-gray-600">{formatSGD(row.session_commission)}</td>
                  <td className="p-3 text-right font-bold text-green-700">{formatSGD(row.total_commission)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-green-50 font-bold text-sm">
                <td className="p-3 text-green-800">TOTAL</td>
                <td className="p-3 text-center text-green-800">{totalSessions}</td>
                <td className="p-3 text-center text-green-800">{totalNewClients}</td>
                <td className="p-3 text-right text-green-800">{formatSGD(payoutSummary.reduce((s, r) => s + r.signup_commission, 0))}</td>
                <td className="p-3 text-right text-green-800">{formatSGD(payoutSummary.reduce((s, r) => s + r.session_commission, 0))}</td>
                <td className="p-3 text-right text-green-800">{formatSGD(totalCommission)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
