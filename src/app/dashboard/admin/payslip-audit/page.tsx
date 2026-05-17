'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { formatSGD, formatDateTime, getMonthName , nowSGT } from '@/lib/utils'
import { Shield, ChevronDown, ChevronUp } from 'lucide-react'
import { useToast } from '@/hooks/useToast'
import { StatusBanner } from '@/components/StatusBanner'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { PageSpinner } from '@/components/PageSpinner'

export default function PayslipAuditPage() {

  const { user, loading } = useCurrentUser({ allowedRoles: ['admin'] })
  const { logActivity } = useActivityLog()
  const supabase = createClient()
  const router = useRouter()
  const { success, error } = useToast()

  const [records, setRecords] = useState<any[]>([])
  const [filterYear, setFilterYear] = useState(nowSGT().getUTCFullYear())
  const [filterMonth, setFilterMonth] = useState(0) // 0 = all months
  const [expanded, setExpanded] = useState<string | null>(null)


  const loadData = async () => {
    logActivity('page_view', 'Payslip Audit', 'Viewed payslip audit')

    let query = supabase
      .from('payslip_deletions')
      .select('*')
      .eq('year', filterYear)
      .order('deleted_at', { ascending: false })

    if (filterMonth > 0) query = query.eq('month', filterMonth)

    const { data } = await query
    setRecords(data || [])
  }

  useEffect(() => { loadData() }, [filterYear, filterMonth])


  const years = Array.from({ length: 5 }, (_, i) => nowSGT().getUTCFullYear() - i)
  const months = [
    { value: 0, label: 'All months' },
    ...Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: getMonthName(i + 1) }))
  ]

  if (loading) return (
    <PageSpinner />
  )

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Shield className="w-5 h-5 text-red-600" />
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Payslip Deletion Audit</h1>
          <p className="text-xs text-gray-500">All admin deletions of approved and paid payslips</p>
        </div>
      </div>

      <StatusBanner success={success} error={error} />

      {/* Filters */}
      <div className="flex gap-3">
        <select className="input flex-1" value={filterYear}
          onChange={e => setFilterYear(parseInt(e.target.value))}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className="input flex-1" value={filterMonth}
          onChange={e => setFilterMonth(parseInt(e.target.value))}>
          {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>

      {/* Records */}
      {records.length === 0 ? (
        <div className="card p-8 text-center">
          <Shield className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">No deletion records found for this period</p>
        </div>
      ) : (
        <div className="card divide-y divide-gray-100">
          {records.map(r => (
            <div key={r.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-gray-900 text-sm">{r.staff_name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      r.status_at_deletion === 'paid'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      Was {r.status_at_deletion}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {getMonthName(r.month)} {r.year}
                    {r.gym_name && ` · ${r.gym_name}`}
                    {r.net_salary && ` · Net: ${formatSGD(r.net_salary)}`}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Deleted by {r.deleted_by_name} · {formatDateTime(r.deleted_at)}
                  </p>
                </div>
                <button
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                  className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 flex-shrink-0">
                  Reason {expanded === r.id
                    ? <ChevronUp className="w-3 h-3" />
                    : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>
              {expanded === r.id && (
                <div className="mt-3 bg-amber-50 border border-amber-100 rounded-lg p-3">
                  <p className="text-xs font-medium text-amber-700 mb-1">Reason</p>
                  <p className="text-xs text-amber-800">{r.reason}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400 text-center">
        {records.length} deletion{records.length !== 1 ? 's' : ''} recorded
      </p>
    </div>
  )
}
