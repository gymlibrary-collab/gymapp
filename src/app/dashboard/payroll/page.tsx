'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { formatSGD } from '@/lib/utils'
import { Users, DollarSign, Search, ChevronRight, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export default function PayrollPage() {
  const [staffList, setStaffList] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      // Get all active staff with their payroll profile
      const { data: staff } = await supabase
        .from('users')
        .select('*, staff_payroll(*)')
        .eq('is_archived', false)
        .in('role', ['trainer', 'manager', 'business_ops', 'admin'])
        .order('full_name')

      setStaffList(staff || [])
      setLoading(false)
    }
    load()
  }, [])

  const filtered = staffList.filter(s =>
    s.full_name.toLowerCase().includes(search.toLowerCase()) ||
    s.email.toLowerCase().includes(search.toLowerCase()) ||
    s.role.toLowerCase().includes(search.toLowerCase())
  )

  const totalSalary = staffList.reduce((sum, s) => sum + (s.staff_payroll?.current_salary || 0), 0)
  const cpfLiable = staffList.filter(s => s.staff_payroll?.is_cpf_liable).length
  const noSalary = staffList.filter(s => !s.staff_payroll?.current_salary).length

  const roleBadge: Record<string, string> = {
    admin: 'bg-red-100 text-red-700',
    trainer: 'bg-green-100 text-green-700',
    manager: 'bg-yellow-100 text-yellow-800',
    business_ops: 'bg-purple-100 text-purple-700',
  }

  if (loading) return <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600" /></div>

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Payroll</h1>
        <p className="text-sm text-gray-500">Manage staff salaries, increments, bonuses and payslips</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="stat-card">
          <div className="flex items-center gap-1.5 mb-1"><Users className="w-4 h-4 text-red-600" /><p className="text-xs text-gray-500">Total Staff</p></div>
          <p className="text-2xl font-bold text-gray-900">{staffList.length}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-1.5 mb-1"><DollarSign className="w-4 h-4 text-red-600" /><p className="text-xs text-gray-500">Total Monthly Payroll</p></div>
          <p className="text-xl font-bold text-gray-900">{formatSGD(totalSalary)}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-1.5 mb-1"><DollarSign className="w-4 h-4 text-blue-600" /><p className="text-xs text-gray-500">CPF Liable</p></div>
          <p className="text-2xl font-bold text-gray-900">{cpfLiable}</p>
        </div>
      </div>

      {noSalary > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {noSalary} staff member{noSalary > 1 ? 's' : ''} {noSalary > 1 ? 'have' : 'has'} no salary set yet.
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input className="input pl-9" placeholder="Search staff..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Staff list */}
      <div className="space-y-2">
        {filtered.map(member => {
          const payroll = member.staff_payroll
          const hasSalary = payroll?.current_salary > 0
          return (
            <Link key={member.id} href={`/dashboard/staff-payroll/${member.id}`}
              className="card p-4 flex items-center gap-3 hover:border-red-200 transition-colors block">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-red-700 font-semibold text-sm">{member.full_name.charAt(0)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-gray-900 text-sm">{member.full_name}</p>
                  <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', roleBadge[member.role] || 'bg-gray-100 text-gray-600')}>
                    {member.role.replace('_', ' ')}
                  </span>
                  {payroll?.is_cpf_liable && <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">CPF</span>}
                </div>
                <p className="text-xs text-gray-500">{member.email}</p>
              </div>
              <div className="text-right flex-shrink-0">
                {hasSalary ? (
                  <>
                    <p className="text-sm font-bold text-gray-900">{formatSGD(payroll.current_salary)}</p>
                    <p className="text-xs text-gray-400">per month</p>
                  </>
                ) : (
                  <p className="text-xs text-amber-500">⚠ No salary set</p>
                )}
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
