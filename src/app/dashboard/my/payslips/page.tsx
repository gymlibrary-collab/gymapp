'use client'

import { useActivityLog } from '@/hooks/useActivityLog'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { formatSGD, getMonthName } from '@/lib/utils'
import { addLogoHeader, PDF_TABLE_STYLE, renderPayslipPdf, renderCommissionPdf } from '@/lib/pdf'
import { FileText, Download, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCurrentUser } from '@/hooks/useCurrentUser'

export default function MyPayslipsPage() {

  const [payslips, setPayslips] = useState<any[]>([])
  const [commissionPayouts, setCommissionPayouts] = useState<any[]>([])
  const { logActivity } = useActivityLog()
  const [activeTab, setActiveTab] = useState<'salary' | 'commission'>('salary')
  const supabase = createClient()
  const router = useRouter()
  const { user, loading } = useCurrentUser({ allowedRoles: ['trainer', 'staff', 'manager'] })

  const [selectedMonth, setSelectedMonth] = useState<string>('') // 'YYYY-MM' format
  const [gymsMap, setGymsMap] = useState<Record<string, any>>({}) // gymId -> gym object

  useEffect(() => {
    const load = async () => {
      logActivity('page_view', 'My Payslips', 'Viewed own payslips')

      // Load gyms map for logo lookup
      const { data: gymsData } = await supabase.from('gyms').select('id, name, logo_url')
      const map: Record<string, any> = {}
      gymsData?.forEach((g: any) => { map[g.id] = g })
      setGymsMap(map)

      // Load last 13 months of salary payslips (with gym_id)
      const { data: slips } = await supabase.from('payslips')
        .select('*').eq('user_id', user!.id)
        .in('status', ['approved', 'paid'])
        .order('year', { ascending: false }).order('month', { ascending: false })
        .limit(26) // more records to account for part-timers with multiple gyms per month
      setPayslips(slips || [])
      // Default to most recent month
      if (slips && slips.length > 0) {
        setSelectedMonth(`${slips[0].year}-${String(slips[0].month).padStart(2, '0')}`)
      }

      // Mark notifications as seen — clears the dashboard banner on next login
      await supabase.from('users').update({
        payslip_notif_seen_at: new Date().toISOString(),
        commission_notif_seen_at: new Date().toISOString(),
      }).eq('id', user!.id)

      // Load commission payouts — approved and paid only (drafts not visible to staff)
      const commYearFrom = `${(new Date().getFullYear() - 1)}-01-01`
      const { data: payouts } = await supabase.from('commission_payouts')
        .select('*, gym:gyms(name)')
        .eq('user_id', user!.id)
        .in('status', ['approved', 'paid'])
        .gte('period_start', commYearFrom)
        .order('period_end', { ascending: false })
        .limit(13)
      setCommissionPayouts(payouts || [])
    }
    load()
  }, [])

  if (loading) return <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600" /></div>
  if (!user) return null

  const downloadPayslip = async (slip: any) => {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF()
    const gym = slip.gym_id ? gymsMap[slip.gym_id] : null
    const branding = { logoUrl: gym?.logo_url || null, gymName: gym?.name || 'Gym Library' }
    await renderPayslipPdf(doc, autoTable, slip, user!, branding, payslips, commissionPayouts)
    doc.save(`Payslip-${user?.full_name}-${getMonthName(slip.month)} ${slip.year}.pdf`)
    logActivity('export', 'My Payslips', `Downloaded payslip PDF — ${getMonthName(slip.month)} ${slip.year}`)
  }

    const downloadCommissionSlip = async (payout: any) => {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF()
    const gym = payout.gym_id ? gymsMap[payout.gym_id] : Object.values(gymsMap)[0]
    const branding = { logoUrl: (gym as any)?.logo_url || null, gymName: (gym as any)?.name || 'Gym Library' }
    const commMonth = parseInt(payout.period_start.split('-')[1])
    const commYear = payout.period_start.split('-')[0]
    await renderCommissionPdf(doc, autoTable, payout, user!, branding)
    doc.save(`Commission-${user?.full_name}-${getMonthName(commMonth)} ${commYear}.pdf`)
    logActivity('export', 'My Payslips', `Downloaded commission PDF — ${payout.period_start} to ${payout.period_end}`)
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">My Payslips</h1>
        <p className="text-sm text-gray-500">Your last 13 months of salary and commission statements</p>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        <button onClick={() => setActiveTab('salary')}
          className={cn('flex-1 py-1.5 rounded-md text-xs font-medium transition-colors',
            activeTab === 'salary' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600')}>
          Salary Payslips ({payslips.length})
        </button>
        <button onClick={() => setActiveTab('commission')}
          className={cn('flex-1 py-1.5 rounded-md text-xs font-medium transition-colors',
            activeTab === 'commission' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600')}>
          Commission ({commissionPayouts.length})
        </button>
      </div>

      {activeTab === 'salary' && (
        <div className="space-y-3">
          {payslips.length === 0 ? (
            <div className="card p-8 text-center">
              <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No payslips yet</p>
            </div>
          ) : (() => {
            // Build unique months list
            const months = Array.from(new Set(payslips.map(s => `${s.year}-${String(s.month).padStart(2, '0')}`)))
              .sort((a, b) => b.localeCompare(a))
            const activeMonth = selectedMonth || months[0] || ''
            const [selYear, selMon] = activeMonth.split('-').map(Number)
            const monthSlips = payslips.filter(s => s.year === selYear && s.month === selMon)
            return (
              <>
                {/* Month selector */}
                <div>
                  <label className="label">Select Month</label>
                  <select className="input" value={activeMonth} onChange={e => setSelectedMonth(e.target.value)}>
                    {months.map(m => {
                      const [y, mo] = m.split('-').map(Number)
                      return <option key={m} value={m}>{getMonthName(mo)} {y}</option>
                    })}
                  </select>
                </div>
                {/* Payslips for selected month */}
                {monthSlips.length === 0 ? (
                  <div className="card p-6 text-center text-sm text-gray-400">No payslips for this month</div>
                ) : monthSlips.map(slip => {
                  const gym = slip.gym_id ? gymsMap[slip.gym_id] : null
                  return (
                    <div key={slip.id} className="card p-4 flex items-center gap-4">
                      <div className="bg-red-50 p-2.5 rounded-lg flex-shrink-0">
                        <FileText className="w-5 h-5 text-red-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm">
                          {getMonthName(slip.month)} {slip.year}
                          {gym && <span className="text-gray-400 font-normal"> · {gym.name}</span>}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 flex-wrap">
                          {slip.total_hours > 0
                            ? <span>{slip.total_hours}h roster pay</span>
                            : <span>Basic: {formatSGD(slip.basic_salary)}</span>
                          }
                          {slip.bonus_amount > 0 && <span>Bonus: {formatSGD(slip.bonus_amount)}</span>}
                          <span className="font-medium text-gray-900">Net: {formatSGD(slip.net_salary)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          {slip.status === 'paid'
                            ? <><CheckCircle className="w-3 h-3 text-green-600" /><span className="text-xs text-green-600">Paid</span></>
                            : <><CheckCircle className="w-3 h-3 text-blue-600" /><span className="text-xs text-blue-600">Approved</span></>
                          }
                        </div>
                      </div>
                      {slip.status !== 'draft' && (
                        <button onClick={() => downloadPayslip(slip)}
                          className="btn-secondary text-xs py-1.5 flex items-center gap-1 flex-shrink-0">
                          <Download className="w-3.5 h-3.5" /> PDF
                        </button>
                      )}
                    </div>
                  )
                })}
              </>
            )
          })()}
        </div>
      )}

      {activeTab === 'commission' && (
        <div className="space-y-2">
          {commissionPayouts.length === 0 ? (
            <div className="card p-8 text-center">
              <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No commission payouts yet</p>
            </div>
          ) : commissionPayouts.map(p => (
            <div key={p.id} className="card p-4 flex items-center gap-4">
              <div className="bg-green-50 p-2.5 rounded-lg flex-shrink-0">
                <FileText className="w-5 h-5 text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm">
                  {p.period_start} — {p.period_end}
                </p>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 flex-wrap">
                  <span>PT: {formatSGD(p.pt_signup_commission_sgd + p.pt_session_commission_sgd)}</span>
                  <span>Membership: {formatSGD(p.membership_commission_sgd)}</span>
                  <span className="font-medium text-green-700">Total: {formatSGD(p.total_commission_sgd)}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  {p.status === 'paid'
                    ? <><CheckCircle className="w-3 h-3 text-green-600" /><span className="text-xs text-green-600">Paid</span></>
                    : <><CheckCircle className="w-3 h-3 text-blue-600" /><span className="text-xs text-blue-600">Approved</span></>
                  }
                </div>
              </div>
              {p.status !== 'draft' && (
                <button onClick={() => downloadCommissionSlip(p)}
                  className="btn-secondary text-xs py-1.5 flex items-center gap-1 flex-shrink-0">
                  <Download className="w-3.5 h-3.5" /> PDF
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
