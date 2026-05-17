'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { getAgeAsOf, getCpfBracketRates, loadCpfBrackets, getCpfCeilings } from '@/lib/cpf'
import { Calculator, Save, FileText, Edit2, Info, X } from 'lucide-react'
import { cn, formatSGD, getMonthName, nowSGT } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { StatusBanner } from '@/components/StatusBanner'
import { useCurrentUser } from '@/hooks/useCurrentUser'

const getAge = (dob: string) => getAgeAsOf(dob, nowSGT())

interface BracketDraft {
  id: string; label: string; age_from: number; age_to: number | null
  employee_rate: number; employer_rate: number
}
interface PeriodDraft {
  effective_from: string; ow_ceiling: number; annual_aw_ceiling: number
  brackets: BracketDraft[]
}

export default function CpfPage() {
  const { user, loading } = useCurrentUser({ allowedRoles: ['business_ops'] })
  const { logActivity } = useActivityLog()
  const [brackets, setBrackets] = useState<any[]>([])
  const [submissions, setSubmissions] = useState<any[]>([])
  const [preview, setPreview] = useState<any>(null)
  const [editingPeriod, setEditingPeriod] = useState<string | null>(null)
  const [periodDraft, setPeriodDraft] = useState<PeriodDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(nowSGT().getUTCMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(nowSGT().getUTCFullYear())
  const [generating, setGenerating] = useState(false)
  const supabase = createClient()
  const { success, error, showMsg, showError } = useToast()

  const load = async () => {
    const { data: br } = await supabase.from('cpf_age_brackets').select('*')
      .order('effective_from', { ascending: false }).order('age_from')
    setBrackets(br || [])
    const { data: subs } = await supabase.from('cpf_submissions')
      .select('*, submitted_by:users!cpf_submissions_submitted_by_fkey(full_name)')
      .order('payroll_year', { ascending: false }).order('payroll_month', { ascending: false })
    setSubmissions(subs || [])
  }

  useEffect(() => {
    if (!user) return
    logActivity('page_view', 'CPF Configuration', 'Viewed CPF configuration')
    load()
  }, [user])

  const getPeriods = () => {
    const grouped: Record<string, any[]> = {}
    brackets.forEach(b => {
      const key = b.effective_from ? b.effective_from.split('T')[0] : 'default'
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(b)
    })
    return Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a)).slice(0, 3)
  }

  const periodStatus = (key: string) => {
    if (key === 'default') return 'active'
    const t = nowSGT()
    return new Date(key) <= new Date(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) ? 'active' : 'pending'
  }

  const openEdit = (periodKey: string, periodBrackets: any[]) => {
    const sorted = [...periodBrackets].sort((a, b) => (a.age_from ?? 0) - (b.age_from ?? 0))
    setPeriodDraft({
      effective_from: periodKey === 'default' ? '' : periodKey,
      ow_ceiling: parseFloat(sorted[0]?.ow_ceiling) || 6800,
      annual_aw_ceiling: parseFloat(sorted[0]?.annual_aw_ceiling) || 102000,
      brackets: sorted.map(b => ({
        id: b.id, label: b.label, age_from: b.age_from, age_to: b.age_to,
        employee_rate: parseFloat(b.employee_rate), employer_rate: parseFloat(b.employer_rate),
      }))
    })
    setEditingPeriod(periodKey)
  }

  const handleSavePeriod = async () => {
    if (!periodDraft) return
    setSaving(true)
    const { data: { user: authUser } } = await supabase.auth.getUser()
    const updatedAt = new Date().toISOString()
    const effectiveFrom = periodDraft.effective_from || null
    let hasError = false
    for (const b of periodDraft.brackets) {
      const { error: err } = await supabase.from('cpf_age_brackets').update({
        employee_rate: b.employee_rate, employer_rate: b.employer_rate,
        ow_ceiling: periodDraft.ow_ceiling, annual_aw_ceiling: periodDraft.annual_aw_ceiling,
        effective_from: effectiveFrom, updated_by: authUser?.id, updated_at: updatedAt,
      }).eq('id', b.id)
      if (err) { hasError = true; break }
    }
    if (hasError) { showError('Failed to save — please try again'); setSaving(false); return }
    const ratesSummary = periodDraft.brackets
      .map(b => `${b.label}: EE ${b.employee_rate}% / ER ${b.employer_rate}%`).join('; ')
    logActivity('update', 'CPF Configuration',
      `Updated CPF period ${periodDraft.effective_from || 'default'} — ${periodDraft.brackets.length} brackets, OW ceiling $${periodDraft.ow_ceiling}, AW ceiling $${periodDraft.annual_aw_ceiling}. Rates: ${ratesSummary}`)
    await load(); setEditingPeriod(null); setPeriodDraft(null); setSaving(false); showMsg('CPF period saved')
  }

  const updateBracketRate = (idx: number, field: 'employee_rate' | 'employer_rate', val: string) => {
    if (!periodDraft) return
    const updated = [...periodDraft.brackets]
    updated[idx] = { ...updated[idx], [field]: parseFloat(val) || 0 }
    setPeriodDraft({ ...periodDraft, brackets: updated })
  }

  const generatePreview = async () => {
    setGenerating(true)
    const { owCeiling: OW_CEILING } = getCpfCeilings(brackets, selectedYear)
    const { data: payslips } = await supabase.from('payslips')
      .select('*, user:users!payslips_user_id_fkey(full_name, nric, date_of_birth)')
      .eq('period_month', selectedMonth).eq('period_year', selectedYear)
      .in('status', ['approved', 'paid']).eq('is_cpf_liable', true)
    const rows = (payslips || []).map((p: any) => {
      const bracket = getCpfBracketRates(brackets, p.user?.date_of_birth || null, selectedYear, selectedMonth)
      const empRate = bracket?.employee_rate ?? p.employee_cpf_rate ?? 20
      const erRate = bracket?.employer_rate ?? p.employer_cpf_rate ?? 17
      const cappedOW = p.capped_ow ?? Math.min(p.salary_amount || 0, OW_CEILING)
      const awSubject = p.aw_subject_to_cpf ?? 0
      const empCpf = Math.floor(cappedOW * empRate / 100) + Math.floor(awSubject * empRate / 100)
      const erCpf = Math.round(cappedOW * erRate / 100) + Math.round(awSubject * erRate / 100)
      const age = p.user?.date_of_birth ? getAge(p.user.date_of_birth) : null
      return {
        name: p.user?.full_name, nric: p.user?.nric, age,
        bracket: age === null ? 'Unknown' : age <= 55 ? '≤55' : age <= 60 ? '56–60' : age <= 65 ? '61–65' : age <= 70 ? '66–70' : '>70',
        gross: p.gross_salary || 0, empCpf, erCpf,
      }
    })
    setPreview({
      month: selectedMonth, year: selectedYear, rows, staffCount: rows.length,
      totalEmpCpf: rows.reduce((s, r) => s + r.empCpf, 0),
      totalErCpf: rows.reduce((s, r) => s + r.erCpf, 0),
      totalWages: rows.reduce((s, r) => s + r.gross, 0),
      totalCpf: rows.reduce((s, r) => s + r.empCpf + r.erCpf, 0),
    })
    setGenerating(false)
  }

  const handleSaveSubmission = async () => {
    if (!preview) return
    await supabase.from('cpf_submissions').upsert({
      payroll_month: preview.month, payroll_year: preview.year,
      total_employee_cpf: preview.totalEmpCpf, total_employer_cpf: preview.totalErCpf,
      total_wages: preview.totalWages, staff_count: preview.staffCount,
      status: 'pending', generated_at: new Date().toISOString(),
    }, { onConflict: 'payroll_month,payroll_year' })
    logActivity('create', 'CPF Configuration', `Saved CPF report for ${getMonthName(preview.month)} ${preview.year}`)
    await load(); setPreview(null); showMsg('CPF report saved')
  }

  const handleMarkSubmitted = async (id: string) => {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    await supabase.from('cpf_submissions').update({
      status: 'submitted', submitted_by: authUser?.id, submitted_at: new Date().toISOString()
    }).eq('id', id)
    logActivity('update', 'CPF Configuration', 'Marked CPF submission complete')
    await load(); showMsg('Marked as submitted to CPF')
  }

  if (loading || !user) return null
  const periods = getPeriods()
  const activePeriodKey = periods.find(([k]) => periodStatus(k) === 'active')?.[0] ?? null

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">CPF Configuration & Reports</h1>
        <p className="text-sm text-gray-500">Singapore CPF rates by age bracket + monthly submission reports</p>
      </div>
      <StatusBanner success={success} error={error} />

      {/* Period cards — read view */}
      {editingPeriod === null && periods.map(([periodKey, periodBrackets]) => {
        const sorted = [...periodBrackets].sort((a, b) => (a.age_from ?? 0) - (b.age_from ?? 0))
        const isActive = periodKey === activePeriodKey
        const isPending = periodStatus(periodKey) === 'pending'
        const ow = sorted[0]?.ow_ceiling
        const aw = sorted[0]?.annual_aw_ceiling
        return (
          <div key={periodKey} className="card">
            <div className={cn('p-4 border-b border-gray-100 flex items-center gap-3',
              isActive ? 'bg-green-50' : isPending ? 'bg-amber-50' : 'bg-gray-50')}>
              <Calculator className={cn('w-4 h-4', isActive ? 'text-green-600' : isPending ? 'text-amber-600' : 'text-gray-400')} />
              <div className="flex-1">
                <h2 className="font-semibold text-gray-900 text-sm">
                  CPF rates{periodKey === 'default' ? '' : ` — effective ${periodKey}`}
                </h2>
                <p className={cn('text-xs mt-0.5', isActive ? 'text-green-700' : isPending ? 'text-amber-700' : 'text-gray-400')}>
                  {isActive ? '✓ Currently active — applied to all new payslips'
                    : isPending ? `⏳ Pending — takes effect on ${periodKey}` : 'Historical'}
                </p>
              </div>
              <button onClick={() => openEdit(periodKey, periodBrackets)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-white text-gray-600">
                <Edit2 className="w-3.5 h-3.5" /> Edit period
              </button>
            </div>
            <div className="p-3">
              <div className="grid grid-cols-4 gap-2 text-xs text-gray-400 font-medium pb-1.5 border-b border-gray-100 px-1">
                <div>Age bracket</div><div className="text-center">Employee %</div>
                <div className="text-center">Employer %</div><div className="text-center">Total</div>
              </div>
              {sorted.map((b: any) => (
                <div key={b.id} className="grid grid-cols-4 gap-2 text-sm py-2 border-b border-gray-50 last:border-0 px-1 items-center">
                  <div>
                    <p className="font-medium text-gray-900 text-xs">{b.label}</p>
                    <p className="text-xs text-gray-400">Age {b.age_from}{b.age_to ? `–${b.age_to}` : '+'}</p>
                  </div>
                  <div className="text-center font-medium text-blue-700 text-sm">{parseFloat(b.employee_rate).toFixed(2)}%</div>
                  <div className="text-center font-medium text-red-700 text-sm">{parseFloat(b.employer_rate).toFixed(2)}%</div>
                  <div className="text-center text-gray-600 text-sm">{(parseFloat(b.employee_rate) + parseFloat(b.employer_rate)).toFixed(2)}%</div>
                </div>
              ))}
              <div className="mt-2 pt-2 border-t border-gray-100 grid grid-cols-2 gap-3 px-1">
                <div className="text-xs text-gray-500">OW ceiling: <span className="font-medium text-gray-700">{ow != null ? formatSGD(ow) : <span className="text-amber-600">not set</span>}</span></div>
                <div className="text-xs text-gray-500">AW ceiling: <span className="font-medium text-gray-700">{aw != null ? formatSGD(aw) : <span className="text-amber-600">not set</span>}</span></div>
              </div>
            </div>
          </div>
        )
      })}

      {/* Edit form — full period */}
      {editingPeriod !== null && periodDraft && (
        <div className="card">
          <div className="p-4 border-b border-gray-100 flex items-center gap-3 bg-green-50">
            <Edit2 className="w-4 h-4 text-green-600" />
            <div className="flex-1">
              <h2 className="font-semibold text-gray-900 text-sm">
                Editing CPF period{periodDraft.effective_from ? ` — effective ${periodDraft.effective_from}` : ''}
              </h2>
              <p className="text-xs text-green-700 mt-0.5">Changes apply to all brackets in this period</p>
            </div>
            <button onClick={() => { setEditingPeriod(null); setPeriodDraft(null) }}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-white rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-4 border-b border-gray-100">
            <label className="label text-xs">Effective from date</label>
            <input className="input mt-1" style={{ maxWidth: 200 }} type="date"
              value={periodDraft.effective_from}
              onChange={e => setPeriodDraft({ ...periodDraft, effective_from: e.target.value })} />
            <p className="text-xs text-gray-400 mt-1.5">Only change this when creating a new period set. Changing it here will move all brackets in this period to the new date.</p>
          </div>
          <div className="border-b border-gray-100">
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Age bracket rates</p>
            </div>
            <div className="grid grid-cols-4 gap-3 px-4 py-2 text-xs text-gray-400 font-medium border-b border-gray-100">
              <div>Age bracket</div><div className="text-center">Employee %</div>
              <div className="text-center">Employer %</div><div className="text-center">Total</div>
            </div>
            {periodDraft.brackets.map((b, idx) => (
              <div key={b.id} className="grid grid-cols-4 gap-3 px-4 py-3 border-b border-gray-50 last:border-0 items-center">
                <div>
                  <p className="text-sm font-medium text-gray-900">{b.label}</p>
                  <p className="text-xs text-gray-400">Age {b.age_from}{b.age_to ? `–${b.age_to}` : '+'}</p>
                </div>
                <input className="input text-center text-sm" type="number" step="0.01" min="0" max="100"
                  value={b.employee_rate} onChange={e => updateBracketRate(idx, 'employee_rate', e.target.value)} />
                <input className="input text-center text-sm" type="number" step="0.01" min="0" max="100"
                  value={b.employer_rate} onChange={e => updateBracketRate(idx, 'employer_rate', e.target.value)} />
                <div className="text-center">
                  <span className="inline-block text-xs font-medium px-2 py-1 rounded-md bg-gray-50 text-gray-600 border border-gray-100">
                    {(b.employee_rate + b.employer_rate).toFixed(2)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="border-b border-gray-100">
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Wage ceilings</p>
            </div>
            <div className="grid grid-cols-2 gap-4 p-4">
              <div>
                <label className="label text-xs">Monthly OW ceiling ($)</label>
                <input className="input mt-1" type="number" step="100"
                  value={periodDraft.ow_ceiling}
                  onChange={e => setPeriodDraft({ ...periodDraft, ow_ceiling: parseFloat(e.target.value) || 0 })} />
                <p className="text-xs text-gray-400 mt-1">Max ordinary wages subject to CPF per month</p>
              </div>
              <div>
                <label className="label text-xs">Annual AW ceiling ($)</label>
                <input className="input mt-1" type="number" step="1000"
                  value={periodDraft.annual_aw_ceiling}
                  onChange={e => setPeriodDraft({ ...periodDraft, annual_aw_ceiling: parseFloat(e.target.value) || 0 })} />
                <p className="text-xs text-gray-400 mt-1">Max additional wages subject to CPF per year</p>
              </div>
            </div>
          </div>
          <div className="p-4 flex gap-2">
            <button onClick={handleSavePeriod} disabled={saving}
              className="btn-primary flex items-center gap-2 disabled:opacity-50">
              <Save className="w-4 h-4" />{saving ? 'Saving...' : 'Save all changes'}
            </button>
            <button onClick={() => { setEditingPeriod(null); setPeriodDraft(null) }} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        CPF rates are applied based on staff date of birth and the payroll period month. Existing approved and paid payslips are not affected — their rates are locked at generation time.
      </div>

      {/* Generate CPF report */}
      <div className="card p-4 space-y-4">
        <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2"><FileText className="w-4 h-4 text-red-600" /> Generate CPF Submission Report</h2>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Month</label>
            <select className="input" value={selectedMonth} onChange={e => setSelectedMonth(parseInt(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => <option key={i+1} value={i+1}>{getMonthName(i+1)}</option>)}
            </select>
          </div>
          <div><label className="label">Year</label><input className="input" type="number" value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))} /></div>
        </div>
        <button onClick={generatePreview} disabled={generating} className="btn-primary flex items-center gap-2">
          <Calculator className="w-4 h-4" />{generating ? 'Calculating...' : 'Generate Preview'}
        </button>
        {preview && (
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="p-4 bg-gray-50 flex items-center justify-between">
              <div><p className="text-sm font-semibold text-gray-900">{getMonthName(preview.month)} {preview.year} CPF Report</p><p className="text-xs text-gray-400">{preview.staffCount} CPF-liable staff</p></div>
              <div className="text-right"><p className="text-lg font-bold text-gray-900">{formatSGD(preview.totalCpf)}</p><p className="text-xs text-gray-400">Total to submit</p></div>
            </div>
            <div className="grid grid-cols-3 divide-x divide-gray-100">
              <div className="p-3 text-center"><p className="text-sm font-bold text-gray-700">{formatSGD(preview.totalWages)}</p><p className="text-xs text-gray-400">Total wages</p></div>
              <div className="p-3 text-center"><p className="text-sm font-bold text-blue-700">{formatSGD(preview.totalEmpCpf)}</p><p className="text-xs text-blue-400">Employee CPF</p></div>
              <div className="p-3 text-center"><p className="text-sm font-bold text-red-700">{formatSGD(preview.totalErCpf)}</p><p className="text-xs text-red-400">Employer CPF</p></div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="bg-gray-50 text-gray-400 uppercase">
                  <th className="text-left p-2">Staff</th><th className="text-center p-2">Age</th>
                  <th className="text-center p-2">Bracket</th><th className="text-right p-2">Gross</th>
                  <th className="text-right p-2">EE CPF</th><th className="text-right p-2">ER CPF</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.rows.map((r: any, i: number) => (
                    <tr key={i}>
                      <td className="p-2"><p className="font-medium text-gray-900">{r.name}</p>{r.nric && <p className="text-gray-400">{r.nric}</p>}</td>
                      <td className="p-2 text-center text-gray-600">{r.age ?? '—'}</td>
                      <td className="p-2 text-center text-gray-600">{r.bracket}</td>
                      <td className="p-2 text-right">{formatSGD(r.gross)}</td>
                      <td className="p-2 text-right text-blue-600">{formatSGD(r.empCpf)}</td>
                      <td className="p-2 text-right text-red-600">{formatSGD(r.erCpf)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-gray-100"><button onClick={handleSaveSubmission} className="btn-primary w-full">Save Report</button></div>
          </div>
        )}
      </div>

      {/* Past submissions */}
      <div className="card">
        <div className="p-4 border-b border-gray-100"><h2 className="font-semibold text-gray-900 text-sm">Past CPF Reports</h2></div>
        {submissions.length === 0 ? <p className="p-4 text-sm text-gray-400 text-center">No reports yet</p> : (
          <div className="divide-y divide-gray-100">
            {submissions.map(sub => (
              <div key={sub.id} className="p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900">{getMonthName(sub.payroll_month)} {sub.payroll_year}</p>
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', sub.status === 'submitted' ? 'bg-green-100 text-green-700' : 'badge-pending')}>
                      {sub.status === 'submitted' ? '✓ Submitted' : 'Pending'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">{sub.staff_count} staff · EE: {formatSGD(sub.total_employee_cpf)} · ER: {formatSGD(sub.total_employer_cpf)} · Total: {formatSGD(sub.total_employee_cpf + sub.total_employer_cpf)}</p>
                  {sub.submitted_at && <p className="text-xs text-green-600">Submitted by {sub.submitted_by?.full_name} on {new Date(sub.submitted_at).toLocaleDateString('en-SG')}</p>}
                </div>
                {sub.status === 'pending' && (
                  <button onClick={() => handleMarkSubmitted(sub.id)} className="btn-primary text-xs py-1.5 flex-shrink-0">Mark Submitted</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
