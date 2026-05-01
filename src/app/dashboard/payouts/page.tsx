'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { User } from '@/types'
import { formatSGD, getMonthName } from '@/lib/utils'
import { DollarSign, CheckCircle, Clock, Download } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function PayoutsPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [payouts, setPayouts] = useState<any[]>([])
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [selectedMonth, selectedYear])

  const loadData = async () => {
    setLoading(true)
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return
    const { data: userData } = await supabase.from('users').select('*').eq('id', authUser.id).single()
    setCurrentUser(userData)

    let query = supabase
      .from('commission_payouts')
      .select('*, users(full_name, email), gyms(name)')
      .eq('month', selectedMonth)
      .eq('year', selectedYear)
      .order('created_at', { ascending: false })

    if (userData?.role === 'manager' && userData?.manager_gym_id) {
      query = query.eq('gym_id', userData.manager_gym_id)
    }

    const { data } = await query
    setPayouts(data || [])
    setLoading(false)
  }

  const generatePayouts = async () => {
    if (!currentUser) return
    setGenerating(true)

    const monthStart = new Date(selectedYear, selectedMonth - 1, 1).toISOString()
    const monthEnd = new Date(selectedYear, selectedMonth, 0, 23, 59, 59).toISOString()

    let trainerQuery = supabase.from('users').select('*').eq('role', 'trainer').eq('is_active', true)
    if (currentUser.role === 'manager' && currentUser.manager_gym_id) {
      const { data: gymTrainers } = await supabase
        .from('trainer_gyms').select('trainer_id').eq('gym_id', currentUser.manager_gym_id)
      const trainerIds = gymTrainers?.map(t => t.trainer_id) || []
      trainerQuery = trainerQuery.in('id', trainerIds)
    }
    const { data: trainers } = await trainerQuery

    for (const trainer of trainers || []) {
      const gymId = currentUser.manager_gym_id || trainer.id

      const { data: sessions } = await supabase.from('sessions')
        .select('session_commission_sgd')
        .eq('trainer_id', trainer.id)
        .eq('status', 'completed')
        .eq('is_notes_complete', true)
        .gte('marked_complete_at', monthStart)
        .lte('marked_complete_at', monthEnd)

      const { data: packages } = await supabase.from('packages')
        .select('signup_commission_sgd, gym_id')
        .eq('trainer_id', trainer.id)
        .gte('created_at', monthStart)
        .lte('created_at', monthEnd)

      const { count: newClients } = await supabase.from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('trainer_id', trainer.id)
        .gte('created_at', monthStart)
        .lte('created_at', monthEnd)

      const sessionComm = sessions?.reduce((s, r) => s + (r.session_commission_sgd || 0), 0) || 0
      const signupComm = packages?.reduce((s, r) => s + (r.signup_commission_sgd || 0), 0) || 0
      const gymIdToUse = packages?.[0]?.gym_id || currentUser.manager_gym_id

      if (!gymIdToUse) continue

      await supabase.from('commission_payouts').upsert({
        trainer_id: trainer.id,
        gym_id: gymIdToUse,
        month: selectedMonth,
        year: selectedYear,
        signup_commissions_sgd: signupComm,
        session_commissions_sgd: sessionComm,
        total_commission_sgd: signupComm + sessionComm,
        sessions_conducted: sessions?.length || 0,
        qualified_sessions: sessions?.length || 0,
        new_clients: newClients || 0,
        status: 'pending',
      }, { onConflict: 'trainer_id,gym_id,month,year' })
    }

    await loadData()
    setGenerating(false)
  }

  const updateStatus = async (payoutId: string, status: string) => {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    await supabase.from('commission_payouts').update({
      status,
      approved_by: authUser?.id,
      approved_at: status === 'approved' ? new Date().toISOString() : undefined,
      paid_at: status === 'paid' ? new Date().toISOString() : undefined,
    }).eq('id', payoutId)
    loadData()
  }

  const exportCSV = () => {
    const headers = ['Trainer', 'Gym', 'Qualified Sessions', 'New Clients', 'Sign-up Commission', 'Session Commission', 'Total', 'Status']
    const rows = payouts.map(p => [
      p.users?.full_name, p.gyms?.name, p.qualified_sessions, p.new_clients,
      p.signup_commissions_sgd?.toFixed(2), p.session_commissions_sgd?.toFixed(2),
      p.total_commission_sgd?.toFixed(2), p.status
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `payouts_${getMonthName(selectedMonth)}_${selectedYear}.csv`
    a.click()
  }

  const statusConfig: Record<string, { label: string; className: string }> = {
    pending: { label: 'Pending', className: 'badge-pending' },
    approved: { label: 'Approved', className: 'badge-active' },
    paid: { label: 'Paid', className: 'bg-blue-100 text-blue-700 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium' },
  }

  const years = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i)
  const totalPayout = payouts.reduce((s, p) => s + (p.total_commission_sgd || 0), 0)

  if (loading) return <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600" /></div>

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Commission Payouts</h1>
          <p className="text-sm text-gray-500">Only sessions with completed notes qualify for payout</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="btn-secondary flex items-center gap-1.5 text-xs">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button onClick={generatePayouts} disabled={generating} className="btn-primary flex items-center gap-1.5 text-xs">
            {generating ? 'Generating...' : '⟳ Generate Payouts'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-3 flex gap-2 flex-wrap">
        <select className="input w-auto" value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className="input w-auto" value={selectedMonth} onChange={e => setSelectedMonth(parseInt(e.target.value))}>
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i + 1} value={i + 1}>{getMonthName(i + 1)}</option>
          ))}
        </select>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="stat-card">
          <p className="text-xs text-gray-500">Total Payable</p>
          <p className="text-xl font-bold text-gray-900">{formatSGD(totalPayout)}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-gray-500">Trainers</p>
          <p className="text-xl font-bold text-gray-900">{payouts.length}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-gray-500">Paid Out</p>
          <p className="text-xl font-bold text-gray-900">
            {formatSGD(payouts.filter(p => p.status === 'paid').reduce((s, p) => s + p.total_commission_sgd, 0))}
          </p>
        </div>
      </div>

      {/* Payout List */}
      {payouts.length === 0 ? (
        <div className="card p-8 text-center">
          <DollarSign className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No payouts for this period</p>
          <p className="text-xs text-gray-400 mt-1">Click "Generate Payouts" to calculate commissions</p>
        </div>
      ) : (
        <div className="space-y-2">
          {payouts.map(payout => (
            <div key={payout.id} className="card p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900 text-sm">{payout.users?.full_name}</p>
                    <span className={statusConfig[payout.status]?.className}>
                      {statusConfig[payout.status]?.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">{payout.gyms?.name}</p>
                </div>
                <p className="text-lg font-bold text-green-700">{formatSGD(payout.total_commission_sgd)}</p>
              </div>

              <div className="grid grid-cols-4 gap-2 text-xs text-gray-500 mb-3">
                <div>
                  <p className="font-medium text-gray-700">{payout.qualified_sessions}</p>
                  <p>Qualified sessions</p>
                </div>
                <div>
                  <p className="font-medium text-gray-700">{payout.new_clients}</p>
                  <p>New clients</p>
                </div>
                <div>
                  <p className="font-medium text-gray-700">{formatSGD(payout.signup_commissions_sgd)}</p>
                  <p>Sign-up comm.</p>
                </div>
                <div>
                  <p className="font-medium text-gray-700">{formatSGD(payout.session_commissions_sgd)}</p>
                  <p>Session comm.</p>
                </div>
              </div>

              <div className="flex gap-2">
                {payout.status === 'pending' && (
                  <button onClick={() => updateStatus(payout.id, 'approved')}
                    className="btn-primary text-xs py-1.5 flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> Approve
                  </button>
                )}
                {payout.status === 'approved' && (
                  <button onClick={() => updateStatus(payout.id, 'paid')}
                    className="btn-primary text-xs py-1.5 flex items-center gap-1 bg-blue-600 hover:bg-blue-700">
                    <DollarSign className="w-3.5 h-3.5" /> Mark as Paid
                  </button>
                )}
                {payout.status === 'paid' && (
                  <div className="flex items-center gap-1 text-xs text-blue-600">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Paid {payout.paid_at ? new Date(payout.paid_at).toLocaleDateString('en-SG') : ''}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
