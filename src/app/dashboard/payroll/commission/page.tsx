'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { formatSGD, getMonthName, nowSGT } from '@/lib/utils'
import { getCpfBracketRates, loadCpfBrackets, getCpfCeilings, loadYtdOW, computeCpfAmounts } from '@/lib/cpf'
import { TrendingUp, Plus, CheckCircle, AlertCircle, X, Trash2, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { StatusBanner } from '@/components/StatusBanner'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { PageSpinner } from '@/components/PageSpinner'

// ── Commission Payslips ───────────────────────────────────────
// Generates commission payslips (payment_type='commission') from commission_items.
// Only shown when combined_payslip_enabled = false.
// Each run sweeps ALL unpaid commission_items up to the selected period
// so late-confirmed items from prior months are included automatically.

export default function CommissionPayslipsPage() {
  const { user, loading } = useCurrentUser({ allowedRoles: ['business_ops'] })
  const { logActivity } = useActivityLog()
  const [payslips, setPayslips] = useState<any[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [staff, setStaff] = useState<any[]>([])
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [showGenerateForm, setShowGenerateForm] = useState(false)
  const [genForm, setGenForm] = useState({
    period_month: nowSGT().getUTCMonth() === 0 ? 12 : nowSGT().getUTCMonth(),
    period_year: nowSGT().getUTCMonth() === 0 ? nowSGT().getUTCFullYear() - 1 : nowSGT().getUTCFullYear(),
    user_ids: [] as string[],
  })
  const [preview, setPreview] = useState<any[]>([])
  const [lateItems, setLateItems] = useState<any[]>([]) // items from prior periods
  const [cpfBrackets, setCpfBrackets] = useState<any[]>([])
  const [existingDrafts, setExistingDrafts] = useState<string[]>([])
  const supabase = createClient()
  const { success, error, showMsg, showError, setError } = useToast()

  const loadData = async () => {
    logActivity('page_view', 'Commission Payslips', 'Viewed commission payslips')
    if (!user) return

    // Load commission payslips (payment_type=commission or combined)
    const { data: slips } = await supabase.from('payslips')
      .select('*, user:users_safe!payslips_user_id_fkey(full_name, role), gym:gyms(name)')
      .in('payment_type', ['commission', 'combined'])
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false })
    setPayslips(slips || [])

    // Load staff for generation
    const { data: staffData } = await supabase.from('users_safe')
      .select('*, trainer_gyms(gym_id), staff_payroll(is_cpf_liable)')
      .eq('is_archived', false).neq('role', 'admin').order('full_name')
    setStaff(staffData || [])

    const brackets = await loadCpfBrackets(supabase)
    setCpfBrackets(brackets || [])
  }

  useEffect(() => {
    if (!user) return
    loadData().finally(() => setDataLoading(false))
  }, [user])

  if (loading || dataLoading) return <PageSpinner />
  if (!user) return null

  const generatePreview = async () => {
    setGenerating(true); setError(''); setPreview([]); setLateItems([])

    const { period_month, period_year } = genForm
    const targetStaff = genForm.user_ids.length > 0
      ? staff.filter(s => genForm.user_ids.includes(s.id))
      : staff

    const results: any[] = []
    const late: any[] = []
    const { owCeiling, annualAWCeiling } = getCpfCeilings(cpfBrackets, period_year)

    for (const member of targetStaff) {
      // Load ALL unpaid commission items up to selected period
      const { data: items } = await supabase.from('commission_items')
        .select('id, source_type, amount, period_month, period_year, gym_id')
        .eq('user_id', member.id)
        .is('payslip_id', null)
        .or(`period_year.lt.${period_year},and(period_year.eq.${period_year},period_month.lte.${period_month})`)

      if (!items || items.length === 0) continue

      const currentItems = items.filter(i => i.period_month === period_month && i.period_year === period_year)
      const priorItems = items.filter(i => !(i.period_month === period_month && i.period_year === period_year))

      if (priorItems.length > 0) {
        priorItems.forEach(i => late.push({ ...i, staff_name: member.full_name }))
      }

      const total = items.reduce((s: number, i: any) => s + (i.amount || 0), 0)
      if (total === 0) continue

      const gymId = items[0]?.gym_id || member.trainer_gyms?.[0]?.gym_id || null
      const isCpf = !!member.staff_payroll?.is_cpf_liable
      const rates = getCpfBracketRates(cpfBrackets, member.date_of_birth, period_year, period_month)

      // Load YTD for CPF ceiling calculation
      const { ytdOW: ytdOWBefore, ytdAW: ytdAWBefore, allLowIncome } = await loadYtdOW(
        supabase, member.id, period_year, period_month
      )

      const cpf = computeCpfAmounts({
        salaryAmount: 0, commissionAmount: total, allowanceAmount: 0,
        bonusAW: 0, othersAmount: 0, othersCpfLiable: false, deductionAmount: 0,
        isCpf, rates, owCeiling, annualAWCeiling,
        ytdOWBefore, ytdAWBefore, allLowIncome,
        periodMonth: period_month, periodYear: period_year,
      })

      results.push({
        user_id: member.id, user_name: member.full_name, user_role: member.role,
        gym_id: gymId, itemIds: items.map(i => i.id),
        ptSessionTotal: items.filter(i => i.source_type === 'pt_session').reduce((s: number, i: any) => s + i.amount, 0),
        ptSignupTotal: items.filter(i => i.source_type === 'pt_signup').reduce((s: number, i: any) => s + i.amount, 0),
        membershipTotal: items.filter(i => i.source_type === 'membership').reduce((s: number, i: any) => s + i.amount, 0),
        commission_amount: total,
        is_cpf_liable: isCpf,
        employee_cpf_rate: rates.employee_rate,
        employer_cpf_rate: rates.employer_rate,
        ow_ceiling_used: owCeiling,
        annual_aw_ceiling_used: annualAWCeiling,
        capped_ow: cpf.cappedOW,
        aw_subject_to_cpf: cpf.awSubject,
        employee_cpf_amount: cpf.employeeCpf,
        employer_cpf_amount: cpf.employerCpf,
        gross_salary: cpf.grossSalary,
        net_salary: cpf.netSalary,
        total_employer_cost: cpf.totalEmployerCost,
        low_income_flag: cpf.lowIncomeFlag,
      })
    }

    setLateItems(late)

    // Check for existing drafts
    if (results.length > 0) {
      const userIds = results.map(r => r.user_id)
      const { data: drafts } = await supabase.from('payslips')
        .select('user_id, user:users_safe!payslips_user_id_fkey(full_name)')
        .in('user_id', userIds)
        .eq('period_month', genForm.period_month)
        .eq('period_year', genForm.period_year)
        .eq('payment_type', 'commission')
        .in('status', ['draft', 'approved', 'paid'])
      const draftNames = (drafts || []).map((d: any) => d.user?.full_name).filter(Boolean)
      setExistingDrafts(draftNames)
    }

    setPreview(results)
    setGenerating(false)
    if (results.length === 0) setError('No unpaid commission items found for this period.')
  }

  const handleSave = async () => {
    if (preview.length === 0) return
    if (existingDrafts.length > 0) {
      showError(`Cannot generate — draft/approved/paid commission payslips already exist for: ${existingDrafts.join(', ')}. Delete them first.`)
      return
    }
    setSaving(true); setError('')

    for (const item of preview) {
      const { data: inserted, error: insertErr } = await supabase.from('payslips').insert({
        user_id: item.user_id, gym_id: item.gym_id,
        period_month: genForm.period_month, period_year: genForm.period_year,
        payment_type: 'commission',
        commission_period_month: genForm.period_month,
        commission_period_year: genForm.period_year,
        salary_amount: 0, commission_amount: item.commission_amount,
        allowance_amount: 0, bonus_amount: 0, others_amount: 0,
        gross_salary: item.gross_salary, net_salary: item.net_salary,
        deduction_amount: 0,
        is_cpf_liable: item.is_cpf_liable,
        employee_cpf_rate: item.employee_cpf_rate,
        employer_cpf_rate: item.employer_cpf_rate,
        employee_cpf_amount: item.employee_cpf_amount,
        employer_cpf_amount: item.employer_cpf_amount,
        capped_ow: item.capped_ow, aw_subject_to_cpf: item.aw_subject_to_cpf,
        ow_ceiling_used: item.ow_ceiling_used,
        annual_aw_ceiling_used: item.annual_aw_ceiling_used,
        total_employer_cost: item.total_employer_cost,
        low_income_flag: item.low_income_flag,
        status: 'draft', generated_by: user!.id,
        generated_at: new Date().toISOString(),
      }).select('id').single()

      if (insertErr) { showError('Failed to save payslip: ' + insertErr.message); setSaving(false); return }
      // Note: commission_items.payslip_id stamped only on Mark Paid, not on generation
    }

    await loadData()
    setPreview([]); setShowGenerateForm(false); setSaving(false)
    logActivity('create', 'Commission Payslips', `Generated ${preview.length} commission payslip draft(s) for ${getMonthName(genForm.period_month)} ${genForm.period_year}`)
    showMsg(`${preview.length} commission payslip(s) generated as draft`)
  }

  const handleStatusChange = async (payslipId: string, newStatus: 'approved' | 'paid') => {
    const update: any = { status: newStatus }
    if (newStatus === 'approved') { update.approved_by = user!.id; update.approved_at = new Date().toISOString() }
    if (newStatus === 'paid') {
      update.paid_at = new Date().toISOString()
      // Stamp payslip_id on commission_items — marks them as paid
      const slip = payslips.find(p => p.id === payslipId)
      if (slip) {
        await supabase.from('commission_items')
          .update({ payslip_id: payslipId })
          .eq('user_id', slip.user_id)
          .eq('period_year', slip.commission_period_year || slip.period_year)
          .is('payslip_id', null)
          .lte('period_year', slip.commission_period_year || slip.period_year)
      }
    }
    await supabase.from('payslips').update(update).eq('id', payslipId)
    const slip = payslips.find(p => p.id === payslipId)
    logActivity(newStatus === 'approved' ? 'approve' : 'update', 'Commission Payslips',
      `${newStatus === 'approved' ? 'Approved' : 'Marked paid'}: ${slip?.user?.full_name || ''} — ${getMonthName(slip?.period_month)} ${slip?.period_year}`)
    await loadData()
    showMsg(`Payslip ${newStatus}`)
  }

  const handleDelete = async (payslipId: string) => {
    const slip = payslips.find(p => p.id === payslipId)
    if (slip?.status === 'paid') { showError('Paid payslips cannot be deleted.'); return }
    if (!confirm(`Delete this draft commission payslip for ${slip?.user?.full_name}? Commission items will be available for the next generation run.`)) return
    await supabase.from('payslips').delete().eq('id', payslipId)
    // commission_items.payslip_id cleared by ON DELETE SET NULL
    logActivity('delete', 'Commission Payslips', `Deleted draft commission payslip — ${slip?.user?.full_name || ''} ${getMonthName(slip?.period_month)} ${slip?.period_year}`)
    await loadData()
    showMsg('Draft deleted')
  }

  const totalDraft = payslips.filter(p => p.status === 'draft').reduce((s, p) => s + (p.commission_amount || 0), 0)
  const totalPaid = payslips.filter(p => p.status === 'paid').reduce((s, p) => s + (p.commission_amount || 0), 0)
  const filtered = payslips.filter(p => {
    const matchSearch = p.user?.full_name?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = filterStatus === 'all' || p.status === filterStatus
    return matchSearch && matchStatus
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Commission Payslips</h1>
          <p className="text-sm text-gray-500">PT session, signup and membership sale commissions</p>
        </div>
        <button onClick={() => setShowGenerateForm(!showGenerateForm)} className="btn-primary flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Generate
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="stat-card"><p className="text-xs text-gray-500 mb-1">Total Payslips</p><p className="text-2xl font-bold text-gray-900">{payslips.length}</p></div>
        <div className="stat-card"><p className="text-xs text-gray-500 mb-1">Draft / Pending</p><p className="text-xl font-bold text-amber-600">{formatSGD(totalDraft)}</p></div>
        <div className="stat-card"><p className="text-xs text-gray-500 mb-1">Paid Out</p><p className="text-xl font-bold text-green-700">{formatSGD(totalPaid)}</p></div>
      </div>

      <StatusBanner success={success} error={error} onDismissError={() => setError('')} />

      {showGenerateForm && (
        <div className="card p-4 space-y-4 border-red-200">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 text-sm">Generate Commission Payslips</h2>
            <button onClick={() => { setShowGenerateForm(false); setPreview([]) }}><X className="w-4 h-4 text-gray-400" /></button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Month *</label>
              <select className="input" value={genForm.period_month}
                onChange={e => setGenForm(f => ({ ...f, period_month: parseInt(e.target.value) }))}>
                {['January','February','March','April','May','June','July','August','September','October','November','December']
                  .map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Year *</label>
              <select className="input" value={genForm.period_year}
                onChange={e => setGenForm(f => ({ ...f, period_year: parseInt(e.target.value) }))}>
                {Array.from({ length: 3 }, (_, i) => nowSGT().getUTCFullYear() - i)
                  .map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Staff (leave empty for all)</label>
            <div className="space-y-1.5 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2">
              {staff.map(s => (
                <label key={s.id} className="flex items-center gap-2 cursor-pointer py-1">
                  <input type="checkbox" checked={genForm.user_ids.includes(s.id)}
                    onChange={() => setGenForm(f => ({ ...f, user_ids: f.user_ids.includes(s.id) ? f.user_ids.filter(id => id !== s.id) : [...f.user_ids, s.id] }))}
                    className="rounded border-gray-300 text-red-600" />
                  <span className="text-sm text-gray-700">{s.full_name}</span>
                </label>
              ))}
            </div>
          </div>

          <button onClick={generatePreview} disabled={generating} className="btn-primary w-full disabled:opacity-50">
            {generating ? 'Calculating...' : 'Calculate Preview'}
          </button>

          {lateItems.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">{lateItems.length} item{lateItems.length > 1 ? 's' : ''} from prior periods included</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    {Array.from(new Set(lateItems.map(i => `${getMonthName(i.period_month)} ${i.period_year}`))).join(', ')} — confirmed late, swept into this run
                  </p>
                </div>
              </div>
            </div>
          )}

          {existingDrafts.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-800">
                  Cannot generate — payslips already exist for: <strong>{existingDrafts.join(', ')}</strong>. Delete drafts first.
                </p>
              </div>
            </div>
          )}

          {preview.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-900">Preview — {preview.length} staff with unpaid commissions</p>
              <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
                {preview.map((item, i) => (
                  <div key={i} className="p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{item.user_name}</p>
                      <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5 flex-wrap">
                        {item.ptSessionTotal > 0 && <span>Sessions: {formatSGD(item.ptSessionTotal)}</span>}
                        {item.ptSignupTotal > 0 && <span>Signups: {formatSGD(item.ptSignupTotal)}</span>}
                        {item.membershipTotal > 0 && <span>Memberships: {formatSGD(item.membershipTotal)}</span>}
                        {item.is_cpf_liable && item.employee_cpf_amount > 0 && (
                          <span className="text-amber-600">CPF: -{formatSGD(item.employee_cpf_amount)}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-green-700">{formatSGD(item.net_salary)}</p>
                      {item.is_cpf_liable && item.employee_cpf_amount > 0 && (
                        <p className="text-xs text-gray-400">Gross: {formatSGD(item.gross_salary)}</p>
                      )}
                    </div>
                  </div>
                ))}
                <div className="p-3 bg-gray-50 flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-900">Total</p>
                  <p className="text-sm font-bold text-green-700">{formatSGD(preview.reduce((s, i) => s + i.net_salary, 0))}</p>
                </div>
              </div>
              <button onClick={handleSave} disabled={saving || existingDrafts.length > 0} className="btn-primary w-full disabled:opacity-50">
                {saving ? 'Saving...' : `Save ${preview.length} Draft Payslip${preview.length > 1 ? 's' : ''}`}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="input pl-9" placeholder="Search by staff name..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1">
          {['all', 'draft', 'approved', 'paid'].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={cn('px-3 py-2 rounded-lg text-xs font-medium capitalize transition-colors',
                filterStatus === s ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card p-8 text-center"><TrendingUp className="w-10 h-10 text-gray-300 mx-auto mb-3" /><p className="text-gray-500 text-sm">No commission payslips found</p></div>
      ) : (
        <div className="space-y-2">
          {filtered.map(slip => (
            <div key={slip.id} className="card p-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-green-700 font-semibold text-sm">{slip.user?.full_name?.charAt(0)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900 text-sm">{slip.user?.full_name}</p>
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
                      slip.status === 'paid' ? 'bg-green-100 text-green-700' :
                      slip.status === 'approved' ? 'bg-blue-100 text-blue-700' : 'badge-pending')}>
                      {slip.status.charAt(0).toUpperCase() + slip.status.slice(1)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">{getMonthName(slip.period_month)} {slip.period_year} · {slip.gym?.name}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                    <span>Commission: {formatSGD(slip.commission_amount)}</span>
                    {slip.deduction_amount > 0 && <span className="text-red-600">Deduction: -{formatSGD(slip.deduction_amount)}</span>}
                    <span className="font-bold text-green-700">Net: {formatSGD(slip.net_salary)}</span>
                  </div>
                  {slip.paid_at && <p className="text-xs text-green-600 mt-0.5">Paid {new Date(slip.paid_at).toLocaleDateString('en-SG', { timeZone: 'Asia/Singapore' })}</p>}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {slip.status === 'draft' && (
                    <>
                      <button onClick={() => handleStatusChange(slip.id, 'approved')} className="btn-primary text-xs py-1.5">Approve</button>
                      <button onClick={() => handleDelete(slip.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Delete draft">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  {slip.status === 'approved' && (
                    <button onClick={() => handleStatusChange(slip.id, 'paid')} className="btn-primary text-xs py-1.5">Mark Paid</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
