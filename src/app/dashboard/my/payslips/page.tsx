'use client'

import { useActivityLog } from '@/hooks/useActivityLog'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { formatSGD, getMonthName, nowSGT } from '@/lib/utils'
import { renderUnifiedPayslipPdf } from '@/lib/pdf'
import { FileText, Download, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { PageSpinner } from '@/components/PageSpinner'

export default function MyPayslipsPage() {
  const [payslips, setPayslips] = useState<any[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const { logActivity } = useActivityLog()
  const supabase = createClient()
  const router = useRouter()
  const { user, loading } = useCurrentUser({ allowedRoles: ['trainer', 'staff', 'manager', 'business_ops'] })
  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const [gymsMap, setGymsMap] = useState<Record<string, any>>({})

  useEffect(() => {
    if (!user) return
    const load = async () => {
      logActivity('page_view', 'My Payslips', 'Viewed own payslips')

      const { data: gymsData } = await supabase.from('gyms').select('id, name, logo_url')
      const map: Record<string, any> = {}
      gymsData?.forEach((g: any) => { map[g.id] = g })
      setGymsMap(map)

      // All payslips — salary, commission, combined — unified in one table
      const { data: slips } = await supabase.from('payslips')
        .select('*').eq('user_id', user!.id)
        .in('status', ['approved', 'paid'])
        .order('period_year', { ascending: false })
        .order('period_month', { ascending: false })
        .limit(36) // 13 months × up to 3 payslips per month (salary + commission + combined)
      setPayslips(slips || [])

      if (slips && slips.length > 0) {
        setSelectedMonth(`${slips[0].period_year}-${String(slips[0].period_month).padStart(2, '0')}`)
      }

      // Mark notifications as seen
      await supabase.from('users').update({
        payslip_notif_seen_at: new Date().toISOString(),
        commission_notif_seen_at: new Date().toISOString(),
      }).eq('id', user!.id)
    }
    load().finally(() => setDataLoading(false))
  }, [user])

  if (loading || dataLoading) return <PageSpinner />
  if (!user) return null

  const downloadPayslip = async (slip: any) => {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF()
    const gym = slip.gym_id ? gymsMap[slip.gym_id] : null
    const branding = { logoUrl: gym?.logo_url || null, gymName: gym?.name || 'Gym Library' }
    await renderUnifiedPayslipPdf(doc, autoTable, slip, user!, branding, payslips)
    const typeLabel = slip.payment_type === 'commission' ? 'Commission'
      : slip.payment_type === 'combined' ? 'Combined' : 'Payslip'
    doc.save(`${typeLabel}-${user?.full_name}-${getMonthName(slip.period_month)} ${slip.period_year}.pdf`)
    logActivity('export', 'My Payslips', `Downloaded ${slip.payment_type} payslip — ${getMonthName(slip.period_month)} ${slip.period_year}`)
  }

  // Build unique period months across all payslip types
  const months = Array.from(new Set(
    payslips.map(s => `${s.period_year}-${String(s.period_month).padStart(2, '0')}`)
  )).sort((a, b) => b.localeCompare(a))

  const activeMonth = selectedMonth || months[0] || ''
  const [selYear, selMon] = activeMonth.split('-').map(Number)

  // All payslips for the selected period (could be salary + commission, or combined)
  const monthSlips = payslips.filter(s =>
    s.period_year === selYear && s.period_month === selMon
  )

  const paymentTypeBadge = (type: string) => {
    if (type === 'commission') return <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">Commission</span>
    if (type === 'combined') return <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">Combined</span>
    return <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">Salary</span>
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">My Payslips</h1>
        <p className="text-sm text-gray-500">Your salary and commission payslips</p>
      </div>

      {payslips.length === 0 ? (
        <div className="card p-8 text-center">
          <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No payslips yet</p>
        </div>
      ) : (
        <>
          <div>
            <label className="label">Select Month</label>
            <select className="input" value={activeMonth} onChange={e => setSelectedMonth(e.target.value)}>
              {months.map(m => {
                const [y, mo] = m.split('-').map(Number)
                return <option key={m} value={m}>{getMonthName(mo)} {y}</option>
              })}
            </select>
          </div>

          <div className="space-y-3">
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
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 text-sm">
                        {getMonthName(slip.period_month)} {slip.period_year}
                      </p>
                      {paymentTypeBadge(slip.payment_type)}
                      {gym && <span className="text-xs text-gray-400">{gym.name}</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 flex-wrap">
                      {slip.payment_type !== 'commission' && (
                        slip.total_hours > 0
                          ? <span>{slip.total_hours}h roster pay</span>
                          : <span>Salary: {formatSGD(slip.salary_amount)}</span>
                      )}
                      {slip.commission_amount > 0 && <span>Commission: {formatSGD(slip.commission_amount)}</span>}
                      {slip.bonus_amount > 0 && <span>Bonus: {formatSGD(slip.bonus_amount)}</span>}
                      {slip.deduction_amount > 0 && <span className="text-red-600">Deduction: -{formatSGD(slip.deduction_amount)}</span>}
                      <span className="font-medium text-gray-900">Net: {formatSGD(slip.net_salary)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      {slip.status === 'paid'
                        ? <><CheckCircle className="w-3 h-3 text-green-600" /><span className="text-xs text-green-600">Paid</span></>
                        : <><CheckCircle className="w-3 h-3 text-blue-600" /><span className="text-xs text-blue-600">Approved</span></>
                      }
                    </div>
                  </div>
                  <button onClick={() => downloadPayslip(slip)}
                    className="btn-secondary text-xs py-1.5 flex items-center gap-1 flex-shrink-0">
                    <Download className="w-3.5 h-3.5" /> PDF
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
