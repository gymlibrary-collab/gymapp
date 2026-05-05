'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { formatSGD, getMonthName , getRoleLabel } from '@/lib/utils'
import { Users, DollarSign, Search, ChevronRight, AlertCircle, Clock, Calendar, CheckCircle } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export default function PayrollPage() {
  const [staffList, setStaffList] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [rosterTotals, setRosterTotals] = useState<Record<string, any>>({})
  const [bulkMonth, setBulkMonth] = useState(new Date().getMonth() + 1)
  const [bulkYear, setBulkYear] = useState(new Date().getFullYear())
  const [bulkGenerating, setBulkGenerating] = useState(false)
  const [bulkResult, setBulkResult] = useState<{generated: number, skipped: number, noSalary: string[], noShifts: string[]} | null>(null)
  const [showBulkForm, setShowBulkForm] = useState(false)
  const [cpfBrackets, setCpfBrackets] = useState<any[]>([])
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { load() }, [selectedMonth, selectedYear])

  const load = async () => {
    setLoading(true)
    // Issue 7: Guard — only business_ops can access payroll
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) { router.replace('/dashboard'); return }
    const { data: me } = await supabase.from('users').select('role').eq('id', authUser.id).single()
    if (!me || me.role !== 'business_ops') { router.replace('/dashboard'); return }

    // Load all active staff with payroll profile — exclude admin (no payroll)
    const { data: staff } = await supabase
      .from('users')
      .select('*, staff_payroll(*)')
      .eq('is_archived', false)
      .neq('role', 'admin')
      .order('employment_type').order('full_name')
    setStaffList(staff || [])

    // Load roster totals for part-timers for selected month/year
    const monthStart = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`
    const monthEnd = new Date(selectedYear, selectedMonth, 0).toISOString().split('T')[0]

    const { data: rosterData } = await supabase
      .from('duty_roster')
      .select('user_id, hours_worked, gross_pay, status')
      .gte('shift_date', monthStart)
      .lte('shift_date', monthEnd)
      .eq('status', 'completed')

    const totals: Record<string, any> = {}
    rosterData?.forEach((r: any) => {
      if (!totals[r.user_id]) totals[r.user_id] = { hours: 0, pay: 0, shifts: 0 }
      totals[r.user_id].hours += r.hours_worked || 0
      totals[r.user_id].pay += r.gross_pay || 0
      totals[r.user_id].shifts += 1
    })
    setRosterTotals(totals)

    const { data: brackets } = await supabase.from('cpf_age_brackets').select('*').order('age_from')
    setCpfBrackets(brackets || [])
    setLoading(false)
  }

  const filtered = staffList.filter(s => {
    const matchSearch = s.full_name.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase())
    const matchType = filterType === 'all' || (s.employment_type || 'full_time') === filterType
    return matchSearch && matchType
  })

  // CPF age bracket helper
  const getAge = (dob: string | null) => {
    if (!dob) return null
    const today = new Date(); const birth = new Date(dob)
    let age = today.getFullYear() - birth.getFullYear()
    if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--
    return age
  }

  const getBracketRates = (dob: string | null) => {
    const age = getAge(dob)
    if (age === null) return { employee_rate: 20, employer_rate: 17 }
    const bracket = cpfBrackets.find(b => age >= b.age_from && (b.age_to === null || age <= b.age_to))
    return bracket ? { employee_rate: bracket.employee_rate, employer_rate: bracket.employer_rate } : { employee_rate: 20, employer_rate: 17 }
  }

  const handleBulkGenerate = async () => {
    // Issue 5: Hard block future month
    const now = new Date()
    const isFuture = bulkYear > now.getFullYear() ||
      (bulkYear === now.getFullYear() && bulkMonth > now.getMonth() + 1)
    if (isFuture) {
      alert(`Cannot generate payslips for a future month (${bulkMonth}/${bulkYear}). Wait until the month has ended.`)
      return
    }
    setBulkGenerating(true); setBulkResult(null)
    const { data: { user: authUser } } = await supabase.auth.getUser()
    const monthStart = `${bulkYear}-${String(bulkMonth).padStart(2, '0')}-01`
    const monthEnd = new Date(bulkYear, bulkMonth, 0).toISOString().split('T')[0]
    const allUserIds = staffList.map(m => m.id)

    // Batch-load everything upfront before the loop.
    // Supabase query builders return PromiseLike, not Promise — never use Promise.all() with them.
    const existingRes = await supabase.from('payslips').select('user_id, gym_id')
      .in('user_id', allUserIds).eq('month', bulkMonth).eq('year', bulkYear)
    // Part-timers: load roster grouped by gym_id so we generate one payslip per gym
    const rosterRes = await supabase.from('duty_roster').select('user_id, gym_id, hours_worked, gross_pay')
      .in('user_id', allUserIds)
      .gte('shift_date', monthStart).lte('shift_date', monthEnd)
      .eq('status', 'completed')
    const bonusRes = await supabase.from('staff_bonuses').select('user_id, amount')
      .in('user_id', allUserIds).eq('month', bulkMonth).eq('year', bulkYear)
    // Load gym info for logo on payslips
    const { data: gymsData } = await supabase.from('gyms').select('id, name, logo_url')

    // Build lookup maps
    // existingSet: track user+gym combos already generated
    const existingSet = new Set(existingRes.data?.map((p: any) => `${p.user_id}:${p.gym_id || 'null'}`) || [])
    // rosterByUserGym: { userId: { gymId: { hours, pay } } }
    const rosterByUserGym: Record<string, Record<string, {hours: number, pay: number}>> = {}
    rosterRes.data?.forEach((r: any) => {
      if (!rosterByUserGym[r.user_id]) rosterByUserGym[r.user_id] = {}
      const gymKey = r.gym_id || 'null'
      if (!rosterByUserGym[r.user_id][gymKey]) rosterByUserGym[r.user_id][gymKey] = { hours: 0, pay: 0 }
      rosterByUserGym[r.user_id][gymKey].hours += r.hours_worked || 0
      rosterByUserGym[r.user_id][gymKey].pay += r.gross_pay || 0
    })
    const bonusByUser: Record<string, number> = {}
    bonusRes.data?.forEach((b: any) => {
      bonusByUser[b.user_id] = (bonusByUser[b.user_id] || 0) + (b.amount || 0)
    })

    let generated = 0; let skipped = 0
    const noSalaryNames: string[] = []
    const toInsert: any[] = []

    for (const member of staffList) {
      const isPartTime = member.employment_type === 'part_time'
      const rates = getBracketRates(member.date_of_birth)
      const isCpf = member.staff_payroll != null
        ? !!member.staff_payroll.is_cpf_liable
        : !isPartTime

      if (isPartTime) {
        // Part-timers: generate one payslip per gym where they had completed shifts
        const gymMap = rosterByUserGym[member.id] || {}
        let anyGenerated = false
        for (const [gymId, roster] of Object.entries(gymMap)) {
          if (roster.pay === 0) continue // skip gyms with no pay
          const existKey = `${member.id}:${gymId}`
          if (existingSet.has(existKey)) { skipped++; continue }
          const actualGymId = gymId === 'null' ? null : gymId
          toInsert.push({
            user_id: member.id, month: bulkMonth, year: bulkYear,
            gym_id: actualGymId,
            employment_type: 'part_time',
            basic_salary: roster.pay, bonus_amount: 0,
            total_hours: roster.hours,
            hourly_rate_used: member.hourly_rate || 0,
            is_cpf_liable: isCpf,
            employee_cpf_rate: isCpf ? rates.employee_rate : 0,
            employer_cpf_rate: isCpf ? rates.employer_rate : 0,
            status: 'draft', generated_by: authUser?.id, generated_at: new Date().toISOString(),
          })
          generated++; anyGenerated = true
        }
        if (!anyGenerated && Object.keys(gymMap).length === 0) skipped++ // no shifts at all — skip silently
      } else {
        // Full-timers: one payslip from their assigned gym
        const existKey = `${member.id}:null`
        // Resolve gym_id: trainer uses trainer_gyms[0], others use manager_gym_id
        const gymId = member.trainer_gyms?.[0]?.gym_id || member.manager_gym_id || null
        const existKeyWithGym = `${member.id}:${gymId || 'null'}`
        if (existingSet.has(existKey) || existingSet.has(existKeyWithGym)) { skipped++; continue }
        const basicSalary = member.staff_payroll?.current_salary || 0
        if (basicSalary === 0) { noSalaryNames.push(member.full_name); skipped++; continue }
        const bonusAmt = bonusByUser[member.id] || 0
        toInsert.push({
          user_id: member.id, month: bulkMonth, year: bulkYear,
          gym_id: gymId,
          employment_type: member.employment_type || 'full_time',
          basic_salary: basicSalary, bonus_amount: bonusAmt,
          total_hours: null, hourly_rate_used: null,
          is_cpf_liable: isCpf,
          employee_cpf_rate: isCpf ? rates.employee_rate : 0,
          employer_cpf_rate: isCpf ? rates.employer_rate : 0,
          status: 'draft', generated_by: authUser?.id, generated_at: new Date().toISOString(),
        })
        generated++
      }
    }

    if (toInsert.length > 0) {
      await supabase.from('payslips').insert(toInsert)
    }

    setBulkResult({ generated, skipped, noSalary: noSalaryNames, noShifts: noShiftNames })
    setBulkGenerating(false)
    load()
  }

  const fullTimers = staffList.filter(s => (s.employment_type || 'full_time') === 'full_time')
  const partTimers = staffList.filter(s => s.employment_type === 'part_time')
  const totalFTSalary = fullTimers.reduce((s, f) => s + (f.staff_payroll?.current_salary || 0), 0)
  const totalPTCost = Object.values(rosterTotals).reduce((s: number, t: any) => s + t.pay, 0)
  const noSalary = fullTimers.filter(s => !s.staff_payroll?.current_salary).length

  const roleBadge: Record<string, string> = {
    admin: 'bg-red-100 text-red-700', trainer: 'bg-teal-100 text-teal-700',
    manager: 'bg-yellow-100 text-yellow-800', business_ops: 'bg-purple-100 text-purple-700',
  }

  if (loading) return <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600" /></div>

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Payroll</h1>
        <p className="text-sm text-gray-500">Monthly salary payroll — separate from commission payouts</p>
      </div>

      {/* Month selector */}
      <div className="card p-3 flex items-center gap-3">
        <Calendar className="w-4 h-4 text-red-600 flex-shrink-0" />
        <p className="text-sm font-medium text-gray-700">Viewing:</p>
        <select className="input flex-1" value={selectedMonth} onChange={e => setSelectedMonth(parseInt(e.target.value))}>
          {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{getMonthName(i + 1)}</option>)}
        </select>
        <input className="input w-24" type="number" value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))} />
      </div>

      {/* Bulk generate */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-sm font-semibold text-gray-900">Bulk Payslip Generation</p>
            <p className="text-xs text-gray-500">Generate payslips for all eligible staff in one step. Existing payslips are skipped.</p>
          </div>
          <button onClick={() => setShowBulkForm(!showBulkForm)} className="btn-secondary text-xs py-1.5">
            {showBulkForm ? 'Cancel' : 'Bulk Generate'}
          </button>
        </div>
        {showBulkForm && (
          <div className="space-y-3 border-t border-gray-100 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Month</label>
                <select className="input" value={bulkMonth} onChange={e => setBulkMonth(parseInt(e.target.value))}>
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][i]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Year</label>
                <input className="input" type="number" value={bulkYear} onChange={e => setBulkYear(parseInt(e.target.value))} />
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 space-y-1">
              <p className="font-medium">What will be generated:</p>
              <p>· Full-time staff — basic salary + any bonuses recorded for this month</p>
              <p>· Part-time staff — from locked roster shifts for this month</p>
              <p>· CPF rates applied from age bracket table (based on date of birth)</p>
              <p>· Staff with no salary set and part-timers with no shifts are skipped</p>
            </div>
            <button onClick={handleBulkGenerate} disabled={bulkGenerating}
              className="btn-primary w-full disabled:opacity-50">
              {bulkGenerating ? 'Generating payslips...' : `Generate All Payslips — ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][bulkMonth-1]} ${bulkYear}`}
            </button>
            {bulkResult && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  {bulkResult.generated} payslip{bulkResult.generated !== 1 ? 's' : ''} generated · {bulkResult.skipped} skipped
                </div>
                {bulkResult.noSalary.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                    <p className="font-medium mb-1">⚠ Skipped — no salary set ({bulkResult.noSalary.length}):</p>
                    <p>{bulkResult.noSalary.join(', ')}</p>
                    <p className="mt-1 text-amber-600">Set their salary in the individual payroll profile, then regenerate.</p>
                  </div>
                )}
                {bulkResult.noShifts.length > 0 && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600">
                    <p className="font-medium mb-1">Skipped — no completed shifts ({bulkResult.noShifts.length}):</p>
                    <p>{bulkResult.noShifts.join(', ')}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="stat-card">
          <div className="flex items-center gap-1.5 mb-1"><Users className="w-4 h-4 text-red-600" /><p className="text-xs text-gray-500">Full-time Staff</p></div>
          <p className="text-2xl font-bold text-gray-900">{fullTimers.length}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-1.5 mb-1"><DollarSign className="w-4 h-4 text-red-600" /><p className="text-xs text-gray-500">Total FT Salary</p></div>
          <p className="text-xl font-bold text-gray-900">{formatSGD(totalFTSalary)}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-1.5 mb-1"><Clock className="w-4 h-4 text-blue-600" /><p className="text-xs text-gray-500">Part-time Staff</p></div>
          <p className="text-2xl font-bold text-gray-900">{partTimers.length}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-1.5 mb-1"><DollarSign className="w-4 h-4 text-blue-600" /><p className="text-xs text-gray-500">PT Labour Cost</p></div>
          <p className="text-xl font-bold text-gray-900">{formatSGD(totalPTCost)}</p>
        </div>
      </div>

      {noSalary > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {noSalary} full-time staff {noSalary > 1 ? 'have' : 'has'} no salary set yet.
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="input pl-9" placeholder="Search staff..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1">
          {[{ key: 'all', label: 'All' }, { key: 'full_time', label: 'Full-time' }, { key: 'part_time', label: 'Part-time' }].map(({ key, label }) => (
            <button key={key} onClick={() => setFilterType(key)}
              className={cn('px-3 py-2 rounded-lg text-xs font-medium transition-colors',
                filterType === key ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Staff list */}
      <div className="space-y-2">
        {filtered.map(member => {
          const isPartTime = member.employment_type === 'part_time'
          const roster = rosterTotals[member.id]
          const payroll = member.staff_payroll
          return (
            <Link key={member.id} href={`/dashboard/hr/${member.id}/payroll`}
              className="card p-4 flex items-center gap-3 hover:border-red-200 transition-colors block">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-red-700 font-semibold text-sm">{member.full_name.charAt(0)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-gray-900 text-sm">{member.full_name}</p>
                  <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', roleBadge[member.role] || 'bg-gray-100 text-gray-600')}>{getRoleLabel(member.role)}</span>
                  <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium', isPartTime ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600')}>
                    {isPartTime ? 'Part-time' : 'Full-time'}
                  </span>
                  {payroll?.is_cpf_liable && <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">CPF</span>}
                </div>
                <p className="text-xs text-gray-500">{member.email}</p>
              </div>
              <div className="text-right flex-shrink-0">
                {isPartTime ? (
                  roster ? (
                    <>
                      <p className="text-sm font-bold text-blue-700">{formatSGD(roster.pay)}</p>
                      <p className="text-xs text-gray-400">{roster.hours.toFixed(1)}h · {roster.shifts} shifts</p>
                    </>
                  ) : (
                    <p className="text-xs text-gray-400">No shifts this month</p>
                  )
                ) : (
                  payroll?.current_salary > 0 ? (
                    <>
                      <p className="text-sm font-bold text-gray-900">{formatSGD(payroll.current_salary)}</p>
                      <p className="text-xs text-gray-400">per month</p>
                    </>
                  ) : (
                    <p className="text-xs text-amber-500">⚠ No salary set</p>
                  )
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
