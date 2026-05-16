'use client'

import { useActivityLog } from '@/hooks/useActivityLog'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { formatSGD, getMonthName, getRoleLabel, roleBadgeClass, nowSGT} from '@/lib/utils'
import { getAgeAsOf, getCpfBracketRates, loadCpfBrackets } from '@/lib/cpf'
import { Users, DollarSign, Search, ChevronRight, AlertCircle, Clock, Calendar, CheckCircle, Trash2, Download, FileText } from 'lucide-react'
import { useToast } from '@/hooks/useToast'
import { StatusBanner } from '@/components/StatusBanner'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { PageSpinner } from '@/components/PageSpinner'

export default function PayrollPage() {
  const { user, loading } = useCurrentUser({ allowedRoles: ['business_ops'] })

  const [staffList, setStaffList] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('all')
  const { logActivity } = useActivityLog()
  const [selectedMonth, setSelectedMonth] = useState(nowSGT().getUTCMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [rosterTotals, setRosterTotals] = useState<Record<string, any>>({})
  const [ytdOW, setYtdOW] = useState<Record<string, number>>({}) // user_id -> YTD ordinary wages
  const [bulkMonth, setBulkMonth] = useState(nowSGT().getUTCMonth() + 1)
  const [bulkYear, setBulkYear] = useState(new Date().getFullYear())
  const [bulkGenerating, setBulkGenerating] = useState(false)
  const [bulkDraftWarning, setBulkDraftWarning] = useState<string[]>([]) // names with existing drafts
  const [pendingBulkGenerate, setPendingBulkGenerate] = useState(false)
  const [bulkResult, setBulkResult] = useState<{generated: number, skipped: number, noSalary: string[], noShifts: string[], deleted?: boolean} | null>(null)
  const [showBulkForm, setShowBulkForm] = useState(false)
  const { error: archiveError, showError: showArchiveError, setError: setArchiveError } = useToast()
  const [archiveYear, setArchiveYear] = useState(new Date().getFullYear() - 1)
  const [archiveGym, setArchiveGym] = useState('')
  const [archiveGyms, setArchiveGyms] = useState<any[]>([])
  const [archiveProgress, setArchiveProgress] = useState('')
  const [archiveGenerating, setArchiveGenerating] = useState(false)

  const [cpfBrackets, setCpfBrackets] = useState<any[]>([])
  const router = useRouter()
  const supabase = createClient()


  const load = async () => {
    logActivity('page_view', 'Monthly Payroll', 'Viewed monthly payroll')
    // Issue 7: Guard — only business_ops can access payroll
    // Load all active staff with payroll profile — exclude admin (no payroll)
    const { data: staff } = await supabase
      .from('users_safe')
      .select('*, staff_payroll(*)')
      .eq('is_archived', false)
      .neq('role', 'admin')
      .order('employment_type').order('full_name')
    setStaffList(staff || [])

    // Load gyms for archive download
    const { data: gymsData } = await supabase.from('gyms').select('id, name').eq('is_active', true).order('name')
    setArchiveGyms(gymsData || [])
    if (gymsData && gymsData.length > 0 && !archiveGym) setArchiveGym(gymsData[0].id)

    // Load roster totals for part-timers for selected month/year
    const monthStart = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`
    const monthEnd = new Date(selectedYear, selectedMonth, 0).toISOString().split('T')[0]

    const { data: rosterData } = await supabase
      .from('duty_roster')
      .select('user_id, hours_worked, gross_pay, status')
      .gte('shift_date', monthStart)
      .lte('shift_date', monthEnd)
      .eq('status', 'completed')
      .is('payslip_id', null)  // only show unpaid shifts in preview

    const totals: Record<string, any> = {}
    rosterData?.forEach((r: any) => {
      if (!totals[r.user_id]) totals[r.user_id] = { hours: 0, pay: 0, shifts: 0 }
      totals[r.user_id].hours += r.hours_worked || 0
      totals[r.user_id].pay += r.gross_pay || 0
      totals[r.user_id].shifts += 1
    })
    setRosterTotals(totals)

    const brackets = await loadCpfBrackets(supabase)
    setCpfBrackets(brackets || [])

    // Load YTD ordinary wages for current year to detect CPF ceiling approach
    const currentYear = new Date().getFullYear()
    const { data: ytdSlips } = await supabase.from('payslips')
      .select('user_id, capped_ow')
      .eq('period_year', currentYear)
      .in('status', ['approved', 'paid'])
    const ytdMap: Record<string, number> = {}
    ytdSlips?.forEach((s: any) => {
      ytdMap[s.user_id] = (ytdMap[s.user_id] || 0) + (s.capped_ow || 0)
    })
    setYtdOW(ytdMap)

  }

  useEffect(() => { load() }, [selectedMonth, selectedYear])

  if (loading) return <PageSpinner />
  if (!user) return null


  const filtered = staffList.filter(s => {
    const matchSearch = s.full_name.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase())
    const matchType = filterType === 'all' || (s.employment_type || 'full_time') === filterType
    return matchSearch && matchType
  })

  // CPF bracket rates — uses accurate birthday-boundary logic from @/lib/cpf
  const getBracketRates = (dob: string | null) =>
    getCpfBracketRates(cpfBrackets, dob, bulkYear, bulkMonth)

  const handleBulkGenerate = async () => {
    // Issue 5: Hard block future month
    const now = nowSGT()
    const isFuture = bulkYear > now.getUTCFullYear() ||
      (bulkYear === now.getUTCFullYear() && bulkMonth > now.getUTCMonth() + 1)
    if (isFuture) {
      alert(`Cannot generate payslips for a future month (${bulkMonth}/${bulkYear}). Wait until the month has ended.`)
      return
    }
    // Check for existing draft payslips and warn before overwriting
    const allIds = staffList.map(m => m.id)
    const { data: existingDraftCheck } = await supabase.from('payslips')
      .select('user_id, users!payslips_user_id_fkey(full_name)')
      .in('user_id', allIds).eq('period_month', bulkMonth).eq('period_year', bulkYear).eq('status', 'draft')
    const draftNames = (existingDraftCheck || []).map((p: any) => (p as any).users?.full_name).filter(Boolean)
    if (draftNames.length > 0 && !pendingBulkGenerate) {
      setBulkDraftWarning(draftNames)
      setPendingBulkGenerate(true)
      return
    }
    setBulkDraftWarning([])
    setPendingBulkGenerate(false)
    setBulkGenerating(true); setBulkResult(null)
    const { data: { user: authUser } } = await supabase.auth.getUser()
    const monthStart = `${bulkYear}-${String(bulkMonth).padStart(2, '0')}-01`
    const monthEnd = new Date(bulkYear, bulkMonth, 0).toISOString().split('T')[0]
    const allUserIds = staffList.map(m => m.id)

    // Batch-load everything upfront before the loop.
    // Supabase query builders return PromiseLike, not Promise — never use Promise.all() with them.
    const existingRes = await supabase.from('payslips').select('user_id, gym_id')
      .in('user_id', allUserIds).eq('period_month', bulkMonth).eq('period_year', bulkYear)
    // Part-timers: load roster grouped by gym_id so we generate one payslip per gym
    const rosterRes = await supabase.from('duty_roster').select('user_id, gym_id, hours_worked, gross_pay, id')
      .in('user_id', allUserIds)
      .gte('shift_date', monthStart).lte('shift_date', monthEnd)
      .eq('status', 'completed')
      .is('payslip_id', null)  // only unpaid shifts
    const bonusRes = await supabase.from('staff_bonuses').select('user_id, amount')
      .in('user_id', allUserIds).eq('period_month', bulkMonth).eq('period_year', bulkYear)
    // Load pending deductions (overpayment recovery from dispute approvals)
    const deductionRes = await supabase.from('pending_deductions')
      .select('user_id, gym_id, amount, reason, id')
      .in('user_id', allUserIds).is('applied_at', null)
    // Load gym info for logo on payslips
    const { data: gymsData } = await supabase.from('gyms').select('id, name, logo_url')

    // Build lookup maps
    // existingApproved: track approved/paid payslips — these must never be overwritten
    const existingApproved = new Set(
      existingRes.data?.filter((p: any) => p.status !== 'draft').map((p: any) => `${p.user_id}:${p.gym_id || 'null'}`) || []
    )
    // Clear payslip_id on roster rows linked to draft payslips before deleting
    // (ON DELETE SET NULL handles this via FK, but explicit clear is more reliable)
    const { data: draftPayslips } = await supabase.from('payslips')
      .select('id').eq('period_month', bulkMonth).eq('period_year', bulkYear).eq('status', 'draft')
    if (draftPayslips && draftPayslips.length > 0) {
      const draftIds = draftPayslips.map((p: any) => p.id)
      await supabase.from('duty_roster')
        .update({ payslip_id: null }).in('payslip_id', draftIds)
    }
    // Delete all existing DRAFT payslips for this month — regeneration overwrites them
    await supabase.from('payslips')
      .delete().eq('period_month', bulkMonth).eq('period_year', bulkYear).eq('status', 'draft')
    // rosterByUserGym: { userId: { gymId: { hours, pay } } }
    const rosterByUserGym: Record<string, Record<string, {hours: number, pay: number, shiftIds: string[]}>> = {}
    rosterRes.data?.forEach((r: any) => {
      if (!rosterByUserGym[r.user_id]) rosterByUserGym[r.user_id] = {}
      const gymKey = r.gym_id || 'null'
      if (!rosterByUserGym[r.user_id][gymKey]) rosterByUserGym[r.user_id][gymKey] = { hours: 0, pay: 0, shiftIds: [] }
      rosterByUserGym[r.user_id][gymKey].hours += r.hours_worked || 0
      rosterByUserGym[r.user_id][gymKey].pay += r.gross_pay || 0
      rosterByUserGym[r.user_id][gymKey].shiftIds.push(r.id)
    })
    const bonusByUser: Record<string, number> = {}
    bonusRes.data?.forEach((b: any) => {
      bonusByUser[b.user_id] = (bonusByUser[b.user_id] || 0) + (b.amount || 0)
    })
    // Pending deductions keyed by userId:gymId
    const deductionByUserGym: Record<string, { amount: number, reason: string, ids: string[] }> = {}
    deductionRes.data?.forEach((d: any) => {
      const key = `${d.user_id}:${d.gym_id || 'null'}`
      if (!deductionByUserGym[key]) deductionByUserGym[key] = { amount: 0, reason: '', ids: [] }
      deductionByUserGym[key].amount += d.amount || 0
      deductionByUserGym[key].reason = d.reason // use last reason (typically one per month)
      deductionByUserGym[key].ids.push(d.id)
    })
    const appliedDeductionIds: string[] = []

    let generated = 0; let skipped = 0
    const noSalaryNames: string[] = []
    const toInsert: any[] = []

    for (const member of staffList) {
      const isPartTime = member.employment_type === 'part_time'
      const rates = getCpfBracketRates(cpfBrackets, member.date_of_birth, bulkYear, bulkMonth)
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
          if (existingApproved.has(existKey)) { skipped++; continue } // skip approved/paid only
          const actualGymId = gymId === 'null' ? null : gymId
          const deductKey = `${member.id}:${gymId}`
          const deduction = deductionByUserGym[deductKey]
          if (deduction) deduction.ids.forEach(id => appliedDeductionIds.push(id))
          toInsert.push({
            user_id: member.id, period_month: bulkMonth, period_year: bulkYear,
            payment_type: 'salary', gym_id: actualGymId,
            employment_type: 'part_time',
            salary_amount: roster.pay, bonus_amount: 0,
            total_hours: roster.hours,
            hourly_rate_used: member.hourly_rate || 0,
            is_cpf_liable: isCpf,
            employee_cpf_rate: isCpf ? rates.employee_rate : 0,
            employer_cpf_rate: isCpf ? rates.employer_rate : 0,
            deduction_amount: deduction?.amount || 0,
            deduction_reason: deduction?.reason || null,
            status: 'draft', generated_by: user?.id, generated_at: new Date().toISOString(),
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
        if (existingApproved.has(existKey) || existingApproved.has(existKeyWithGym)) { skipped++; continue } // skip approved/paid only
        const basicSalary = member.staff_payroll?.current_salary || 0
        if (basicSalary === 0) { noSalaryNames.push(member.full_name); skipped++; continue }
        const bonusAmt = bonusByUser[member.id] || 0
        toInsert.push({
          user_id: member.id, period_month: bulkMonth, period_year: bulkYear,
          payment_type: 'salary', gym_id: gymId,
          employment_type: member.employment_type || 'full_time',
          salary_amount: basicSalary, bonus_amount: bonusAmt,
          total_hours: null, hourly_rate_used: null,
          is_cpf_liable: isCpf,
          employee_cpf_rate: isCpf ? rates.employee_rate : 0,
          employer_cpf_rate: isCpf ? rates.employer_rate : 0,
          status: 'draft', generated_by: user?.id, generated_at: new Date().toISOString(),
        })
        generated++
      }
    }

    if (toInsert.length > 0) {
      const { data: inserted } = await supabase.from('payslips').insert(toInsert).select('id, user_id, gym_id')
      // Stamp payslip_id on roster rows — prevents double payment
      if (inserted) {
        for (const ps of inserted) {
          const gymKey = ps.gym_id || 'null'
          const shiftIds = rosterByUserGym[ps.user_id]?.[gymKey]?.shiftIds || []
          if (shiftIds.length > 0) {
            await supabase.from('duty_roster')
              .update({ payslip_id: ps.id })
              .in('id', shiftIds)
          }
        }
      }
      // Mark pending deductions as applied
      if (appliedDeductionIds.length > 0) {
        await supabase.from('pending_deductions')
          .update({ applied_at: new Date().toISOString() })
          .in('id', appliedDeductionIds)
      }
    }

    setBulkResult({ generated, skipped, noSalary: noSalaryNames, noShifts: [] })
    logActivity('create', 'Monthly Payroll', 'Generated bulk payslips')
    setBulkGenerating(false)
    load()
  }

  const handleBulkDelete = async () => {
    if (!confirm(`Delete all DRAFT payslips for ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][bulkMonth-1]} ${bulkYear}? This cannot be undone. Approved and paid payslips are NOT affected.`)) return
    setBulkGenerating(true)
    const { error } = await supabase.from('payslips')
      .delete()
      .eq('period_month', bulkMonth)
      .eq('period_year', bulkYear)
      .eq('status', 'draft')
    if (error) { alert('Delete failed: ' + error.message); setBulkGenerating(false); return }
    setBulkResult(null)
    setBulkGenerating(false)
    load()
    logActivity('delete', 'Monthly Payroll', `Deleted draft payslips for bulk period`)
    setBulkResult({ generated: 0, skipped: 0, noSalary: [], noShifts: [], deleted: true })
  }

  const fullTimers = staffList.filter(s => (s.employment_type || 'full_time') === 'full_time')
  const partTimers = staffList.filter(s => s.employment_type === 'part_time')
  const totalFTSalary = fullTimers.reduce((s, f) => s + (f.staff_payroll?.current_salary || 0), 0)
  const totalPTCost = Object.values(rosterTotals).reduce((s: number, t: any) => s + t.pay, 0)
  const noSalary = fullTimers.filter(s => !s.staff_payroll?.current_salary).length

  
  const handleArchiveDownload = async () => {
    if (!archiveGym) return
    setArchiveGenerating(true)
    setArchiveError('')
    setArchiveProgress('Loading payslip data...')

    try {
      const { default: jsPDF } = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')
      const { renderUnifiedPayslipPdf } = await import('@/lib/pdf')

      const { data: gym } = await supabase.from('gyms').select('name, logo_url').eq('id', archiveGym).maybeSingle()
      const gymName = (gym as any)?.name || 'Gym'
      const logoUrl = (gym as any)?.logo_url || ''

      const { data: staffData } = await supabase.from('users')
        .select('id, full_name, nric, employment_type')
        .eq('manager_gym_id', archiveGym)
        .eq('is_archived', false)
        .neq('role', 'admin')
        .order('full_name')

      if (!staffData || staffData.length === 0) {
        showArchiveError('No staff found for this gym and year')
        setArchiveGenerating(false)
        setArchiveProgress('')
        return
      }

      setArchiveProgress('Loading zip library...')
      const JSZip = await new Promise<any>((resolve, reject) => {
        if ((window as any).JSZip) { resolve((window as any).JSZip); return }
        const script = document.createElement('script')
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
        script.onload = () => resolve((window as any).JSZip)
        script.onerror = () => reject(new Error('Failed to load zip library'))
        document.head.appendChild(script)
      })

      const zip = new JSZip()
      const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

      for (const staff of staffData) {
        setArchiveProgress(`Generating PDFs for ${staff.full_name}...`)
        const folderName = (staff.full_name as string).replace(/[^a-zA-Z0-9 ]/g, '').trim()
        const folder = zip.folder(folderName)

        // Load payslips — approved or paid only
        const { data: payslips } = await supabase.from('payslips')
          .select('*').eq('user_id', staff.id).eq('year', archiveYear)
          .in('status', ['approved', 'paid']).order('month')

        // Commission payslips unified in payslips table — loaded above already

        for (const slip of payslips || []) {
          const doc = new jsPDF()
          await renderUnifiedPayslipPdf(doc, autoTable, slip, staff, { logoUrl, gymName }, payslips || [])
          folder!.file(`Payslip-${staff.full_name}-${MONTHS[slip.month - 1]} ${slip.year}.pdf`, doc.output('arraybuffer'))
        }

        // Commission payslips are now unified in payslips table — already rendered above

      }

      setArchiveProgress('Zipping files...')
      const content = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(content)
      const a = document.createElement('a'); a.href = url
      a.download = `${gymName.replace(/\s+/g, '_')}_Payroll_${archiveYear}.zip`
      a.click(); URL.revokeObjectURL(url)

      logActivity('export', 'Monthly Payroll', `Downloaded bulk payroll archive for ${gymName} ${archiveYear}`)
      setArchiveProgress(`Done — ${staffData.length} staff folders zipped and downloaded`)

    } catch (err: any) {
      showArchiveError('Download failed: ' + (err?.message || 'Unknown error'))
      setArchiveProgress('')
    } finally {
      setArchiveGenerating(false)
    }
  }


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
              <p>· Existing draft payslips for this month are overwritten — approved/paid are protected</p>
            </div>

            {/* Draft overwrite warning */}
            {bulkDraftWarning.length > 0 && pendingBulkGenerate && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-amber-800">Existing draft payslips will be overwritten</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      {bulkDraftWarning.join(', ')} already {bulkDraftWarning.length === 1 ? 'has a' : 'have'} draft payslip{bulkDraftWarning.length !== 1 ? 's' : ''} for {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][bulkMonth-1]} {bulkYear}. Proceeding will replace {bulkDraftWarning.length === 1 ? 'it' : 'them'}.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleBulkGenerate} disabled={bulkGenerating}
                    className="btn-danger flex-1 disabled:opacity-50 text-sm">
                    {bulkGenerating ? 'Generating...' : `Confirm & Overwrite ${bulkDraftWarning.length} Draft${bulkDraftWarning.length !== 1 ? 's' : ''}`}
                  </button>
                  <button onClick={() => { setBulkDraftWarning([]); setPendingBulkGenerate(false) }}
                    className="btn-secondary flex-shrink-0">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={handleBulkGenerate} disabled={bulkGenerating || pendingBulkGenerate}
                className="btn-primary flex-1 disabled:opacity-50">
                {bulkGenerating ? 'Generating...' : `Generate All Payslips — ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][bulkMonth-1]} ${bulkYear}`}
              </button>
              <button onClick={handleBulkDelete} disabled={bulkGenerating}
                className="btn-secondary flex-shrink-0 flex items-center gap-1.5 text-red-600 border-red-200 hover:bg-red-50 disabled:opacity-50"
                title="Delete all draft payslips for this month">
                <Trash2 className="w-4 h-4" /> Delete Drafts
              </button>
            </div>
            {bulkResult && (
              <div className="space-y-2">
                {bulkResult.deleted ? (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                    <CheckCircle className="w-4 h-4 flex-shrink-0" />
                    All draft payslips for this month have been deleted
                  </div>
                ) : (
                  <>
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
                  </>
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
                  <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', roleBadgeClass(member.role))}>{getRoleLabel(member.role)}</span>
                  <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium', isPartTime ? 'bg-orange-100 text-orange-700' : 'bg-indigo-100 text-indigo-700')}>
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
                      {(() => {
                        const ytd = ytdOW[member.id] || 0
                        const OW_ANNUAL_CEILING = 102000 // TODO: read from cpf_age_brackets via getCpfCeilings()
                        if (ytd >= OW_ANNUAL_CEILING - 10000 && ytd < OW_ANNUAL_CEILING) {
                          return <p className="text-xs text-amber-600 mt-0.5">⚠ YTD OW {formatSGD(ytd)} — {formatSGD(OW_ANNUAL_CEILING - ytd)} below annual ceiling</p>
                        }
                        if (ytd >= OW_ANNUAL_CEILING) {
                          return <p className="text-xs text-red-600 mt-0.5">⚠ Annual OW ceiling reached — CPF capped</p>
                        }
                        return null
                      })()}
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

    {/* ── Annual Income Statements ── */}
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-red-600" />
          <div>
            <h2 className="font-semibold text-gray-900 text-sm">Annual Income Statements</h2>
            <p className="text-xs text-gray-500 mt-0.5">Generate per-staff annual statements for income tax reporting</p>
          </div>
        </div>
        <Link href="/dashboard/payroll/annual" className="btn-primary flex items-center gap-2 text-sm">
          <FileText className="w-4 h-4" /> Generate
        </Link>
      </div>
    </div>

    {/* ── Annual Payroll Archive Download ── */}
    <div className="card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Download className="w-4 h-4 text-red-600" />
        <h2 className="font-semibold text-gray-900 text-sm">Annual Payroll Archive Download</h2>
      </div>
      <p className="text-xs text-gray-500">Download all payslips and commission payouts for a year, grouped by staff member, as a zip file for offsite storage.</p>
      <StatusBanner error={archiveError} onDismissError={() => setArchiveError("")} />
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">Year</label>
          <select className="input" value={archiveYear} onChange={e => setArchiveYear(parseInt(e.target.value))}>
            {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 - i).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Gym Outlet</label>
          <select className="input" value={archiveGym} onChange={e => setArchiveGym(e.target.value)}>
            {archiveGyms.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <button onClick={handleArchiveDownload} disabled={archiveGenerating || !archiveGym}
          className="btn-primary flex items-center gap-2 disabled:opacity-50">
          <Download className="w-4 h-4" />
          {archiveGenerating ? 'Generating...' : 'Download Zip'}
        </button>
      </div>
      {archiveProgress && (
        <div className={cn('text-xs px-3 py-2 rounded-lg', archiveProgress.startsWith('Done') ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700')}>
          {archiveProgress.startsWith('Done') ? '✓ ' : '⏳ '}{archiveProgress}
        </div>
      )}
      <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-1">
        <p className="font-medium text-gray-700">Zip structure:</p>
        <p className="font-mono">GymName_Payroll_{archiveYear}.zip/</p>
        <p className="font-mono ml-4">StaffName/</p>
        <p className="font-mono ml-8">payslip-Jan.pdf · payslip-Feb.pdf · ...</p>
        <p className="font-mono ml-8">comm-Jan.pdf · comm-Mar.pdf · ...</p>
      </div>
    </div>
  </div>
  )
}
