'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { formatSGD, getMonthName } from '@/lib/utils'
import { BarChart3, CreditCard, Package, Banknote } from 'lucide-react'

export default function ReportsPage() {
  const [stats, setStats] = useState<any>({})
  const [month] = useState(new Date().getMonth() + 1)
  const [year] = useState(new Date().getFullYear())
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
    // Route guard
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) { router.replace('/dashboard'); return }
    const { data: me } = await supabase.from('users').select('role').eq('id', authUser.id).single()
    if (!me || (me.role !== 'manager' && me.role !== 'business_ops')) { router.replace('/dashboard'); return }

      const monthStart = `${year}-${String(month).padStart(2,'0')}-01`
      const monthEnd = new Date(year, month, 0).toISOString().split('T')[0]

      // Managers see only their gym's figures; Biz Ops sees all gyms.
      const { data: meDetail } = await supabase.from('users').select('manager_gym_id').eq('id', authUser.id).single()
      const gymId = me.role === 'manager' ? meDetail?.manager_gym_id : null

      let memQ = supabase.from('gym_memberships')
        .select('price_sgd, commission_sgd').eq('sale_status','confirmed')
        .gte('created_at', monthStart).lte('created_at', monthEnd+'T23:59:59')
      if (gymId) memQ = memQ.eq('gym_id', gymId)
      const { data: memSales } = await memQ

      let ptQ = supabase.from('packages')
        .select('total_price_sgd, signup_commission_sgd')
        .gte('created_at', monthStart).lte('created_at', monthEnd+'T23:59:59')
      if (gymId) ptQ = ptQ.eq('gym_id', gymId)
      const { data: ptSales } = await ptQ

      let sessQ = supabase.from('sessions')
        .select('session_commission_sgd').eq('status','completed').eq('manager_confirmed',true)
        .gte('marked_complete_at', monthStart).lte('marked_complete_at', monthEnd+'T23:59:59')
      if (gymId) sessQ = sessQ.eq('gym_id', gymId)
      const { data: ptSessions } = await sessQ

      // Payslips: for manager scope to staff whose manager_gym_id matches
      let staffIds: string[] | null = null
      if (gymId) {
        const { data: tgRows } = await supabase.from('trainer_gyms').select('trainer_id').eq('gym_id', gymId)
        const { data: staffRows } = await supabase.from('users').select('id').eq('manager_gym_id', gymId)
        staffIds = Array.from(new Set([
          ...(tgRows?.map((r: any) => r.trainer_id) || []),
          ...(staffRows?.map((r: any) => r.id) || []),
        ]))
      }
      let payQ = supabase.from('payslips')
        .select('gross_salary, employee_cpf_amount, employer_cpf_amount')
        .eq('month', month).eq('year', year).in('status', ['approved','paid'])
      if (staffIds && staffIds.length > 0) payQ = payQ.in('user_id', staffIds)
      const { data: payslips } = await payQ

      const memRevenue = memSales?.reduce((s,m) => s+(m.price_sgd||0), 0) || 0
      const memCommission = memSales?.reduce((s,m) => s+(m.commission_sgd||0), 0) || 0
      const ptRevenue = ptSales?.reduce((s,p) => s+(p.total_price_sgd||0), 0) || 0
      const ptSignupComm = ptSales?.reduce((s,p) => s+(p.signup_commission_sgd||0), 0) || 0
      const ptSessionComm = ptSessions?.reduce((s,p) => s+(p.session_commission_sgd||0), 0) || 0
      const salaryCost = payslips?.reduce((s,p) => s+(p.gross_salary||0), 0) || 0
      const employerCPF = payslips?.reduce((s,p) => s+(p.employer_cpf_amount||0), 0) || 0

      setStats({ memRevenue, memCommission, ptRevenue, ptSignupComm, ptSessionComm,
        totalCommission: memCommission + ptSignupComm + ptSessionComm,
        salaryCost, employerCPF, totalPayrollCost: salaryCost + employerCPF,
        memCount: memSales?.length||0, ptCount: ptSales?.length||0, sessionCount: ptSessions?.length||0 })
    }
    load()
  }, [])

  return (
    <div className="space-y-6 max-w-2xl">
      <div><h1 className="text-xl font-bold text-gray-900">Summary Reports</h1><p className="text-sm text-gray-500">{getMonthName(month)} {year} overview</p></div>

      <div className="card p-4 space-y-4">
        <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2"><CreditCard className="w-4 h-4 text-red-600"/>Gym Membership</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="stat-card"><p className="text-xs text-gray-500">Sales Count</p><p className="text-2xl font-bold">{stats.memCount||0}</p></div>
          <div className="stat-card"><p className="text-xs text-gray-500">Revenue</p><p className="text-xl font-bold">{formatSGD(stats.memRevenue||0)}</p></div>
          <div className="stat-card col-span-2"><p className="text-xs text-gray-500">Staff Commissions Earned</p><p className="text-xl font-bold text-green-700">{formatSGD(stats.memCommission||0)}</p></div>
        </div>
      </div>

      <div className="card p-4 space-y-4">
        <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2"><Package className="w-4 h-4 text-red-600"/>Personal Training</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="stat-card"><p className="text-xs text-gray-500">Packages Sold</p><p className="text-2xl font-bold">{stats.ptCount||0}</p></div>
          <div className="stat-card"><p className="text-xs text-gray-500">Sessions Completed</p><p className="text-2xl font-bold">{stats.sessionCount||0}</p></div>
          <div className="stat-card"><p className="text-xs text-gray-500">PT Revenue</p><p className="text-xl font-bold">{formatSGD(stats.ptRevenue||0)}</p></div>
          <div className="stat-card"><p className="text-xs text-gray-500">PT Commissions</p><p className="text-xl font-bold text-green-700">{formatSGD((stats.ptSignupComm||0)+(stats.ptSessionComm||0))}</p></div>
        </div>
      </div>

      <div className="card p-4 space-y-4">
        <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2"><Banknote className="w-4 h-4 text-red-600"/>Payroll Cost</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="stat-card"><p className="text-xs text-gray-500">Gross Salary</p><p className="text-xl font-bold">{formatSGD(stats.salaryCost||0)}</p></div>
          <div className="stat-card"><p className="text-xs text-gray-500">Employer CPF</p><p className="text-xl font-bold">{formatSGD(stats.employerCPF||0)}</p></div>
          <div className="stat-card col-span-2 bg-red-50 border-red-100"><p className="text-xs text-red-600">Total Payroll Cost (excl. commission)</p><p className="text-xl font-bold text-red-700">{formatSGD(stats.totalPayrollCost||0)}</p></div>
        </div>
      </div>

      <div className="card p-4 bg-gray-50">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-900">Total Staff Commissions</p>
          <p className="text-lg font-bold text-green-700">{formatSGD(stats.totalCommission||0)}</p>
        </div>
        <p className="text-xs text-gray-400 mt-1">Membership + PT sign-up + PT session commissions</p>
      </div>
    </div>
  )
}
