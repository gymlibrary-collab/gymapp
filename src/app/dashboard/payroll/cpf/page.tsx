'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { formatSGD, getMonthName, nowSGT} from '@/lib/utils'
import { getAgeAsOf, getCpfBracketRates, loadCpfBrackets } from '@/lib/cpf'
import { Calculator, Save, CheckCircle, FileText, Download, Edit2, AlertCircle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { StatusBanner } from '@/components/StatusBanner'
import { useCurrentUser } from '@/hooks/useCurrentUser'

// getAge/getAgeAsOf: use shared lib/cpf.ts versions
const getAge = (dob: string) => getAgeAsOf(dob, nowSGT())

export default function CpfPage() {

  const { user, loading } = useCurrentUser({ allowedRoles: ['business_ops'] })
  const { logActivity } = useActivityLog()
  const [brackets, setBrackets] = useState<any[]>([])
  const [submissions, setSubmissions] = useState<any[]>([])
  const [preview, setPreview] = useState<any>(null)
  const [editingBracket, setEditingBracket] = useState<string | null>(null)
  const [editValues, setEditValues] = useState({ employee_rate: 0, employer_rate: 0, effective_from: '' })
  const [selectedMonth, setSelectedMonth] = useState(nowSGT().getUTCMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const { success, error, showMsg } = useToast()


  const load = async () => {
    logActivity('page_view', 'CPF Configuration', 'Viewed cpf configuration')

    const { data: br } = await supabase.from('cpf_age_brackets').select('*').order('age_from')
    setBrackets(br || [])
    const { data: subs } = await supabase.from('cpf_submissions').select('*, submitted_by:users!cpf_submissions_submitted_by_fkey(full_name)').order('payroll_year', { ascending: false }).order('payroll_month', { ascending: false })
    setSubmissions(subs || [])
  }

  useEffect(() => { load() }, [])


  const getBracket = (dob: string | null, payrollYear: number, payrollMonth: number) => {
    if (!dob) return null
    // Last day of payroll month — CPF reference date
    const lastDayOfMonth = new Date(payrollYear, payrollMonth, 0)
    const payrollDate = new Date(payrollYear, payrollMonth - 1, 1)
    // Filter to brackets effective on or before the payroll month start
    const sorted = [...brackets]
      .filter(b => !b.effective_from || new Date(b.effective_from) <= payrollDate)
      .sort((a: any, b: any) => (a.age_from ?? 0) - (b.age_from ?? 0))
    if (sorted.length === 0) return null
    // Birthday-passed bracket logic: staff moves to next bracket the day AFTER
    // their birthday at the current bracket's upper age boundary.
    const birth = new Date(dob)
    let bracketIndex = 0
    for (let i = 0; i < sorted.length - 1; i++) {
      const upperAge = sorted[i].age_to
      if (upperAge === null) break
      try {
        const birthdayAtUpper = new Date(birth.getFullYear() + upperAge, birth.getMonth(), birth.getDate())
        if (lastDayOfMonth > birthdayAtUpper) { bracketIndex = i + 1 } else { break }
      } catch { break }
    }
    return sorted[bracketIndex] || null
  }

  const handleSaveBracket = async (id: string) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('cpf_age_brackets').update({
      employee_rate: editValues.employee_rate,
      employer_rate: editValues.employer_rate,
      effective_from: editValues.effective_from || null,
      updated_by: user?.id, updated_at: new Date().toISOString(),
    }).eq('id', id)
    await load(); setEditingBracket(null); setSaving(false); logActivity('update', 'CPF Configuration', 'Updated CPF rate')
    showMsg('CPF rate updated')
  }

  const generatePreview = async () => {
    setGenerating(true)
    const monthStart = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`
    // Use local date construction to avoid UTC timezone off-by-one in SGT
    const lastDay = new Date(selectedYear, selectedMonth, 0).getDate()
    const monthEnd = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    const { data: payslips } = await supabase.from('payslips')
      .select('*, user:users!payslips_user_id_fkey(full_name, nric, date_of_birth)')
      .eq('period_month', selectedMonth).eq('period_year', selectedYear)
      .in('status', ['approved', 'paid'])
      .eq('is_cpf_liable', true)

    // Load CPF ceiling config
    const { data: cfgRows } = await supabase.from('commission_config')
      .select('config_key, config_value').in('config_key', ['cpf_ow_ceiling', 'cpf_annual_ceiling'])
    const cfg: Record<string, number> = {}
    cfgRows?.forEach((r: any) => { cfg[r.config_key] = r.config_value })
    const OW_CEILING = cfg['cpf_ow_ceiling'] ?? 8000

    const rows = (payslips || []).map((p: any) => {
      const bracket = getCpfBracketRates(brackets, p.user?.date_of_birth || null, selectedYear, selectedMonth)
      const empRate = bracket?.employee_rate ?? p.employee_cpf_rate ?? 20
      const erRate = bracket?.employer_rate ?? p.employer_cpf_rate ?? 17
      // Use stored capped_ow if available (payslip already calculated correctly),
      // otherwise apply OW ceiling to basic_salary for the preview estimate.
      const cappedOW = p.capped_ow ?? Math.min(p.salary_amount || 0, OW_CEILING)
      const awSubject = p.aw_subject_to_cpf ?? 0
      const erCpfOW = Math.round(cappedOW * erRate / 100)
      const empCpfOW = Math.floor(cappedOW * empRate / 100)
      const erCpfAW = Math.round(awSubject * erRate / 100)
      const empCpfAW = Math.floor(awSubject * empRate / 100)
      const empCpf = empCpfOW + empCpfAW
      const erCpf = erCpfOW + erCpfAW
      const gross = p.gross_salary || 0
      return {
        name: p.user?.full_name, nric: p.user?.nric,
        age: p.user?.date_of_birth ? getAge(p.user.date_of_birth) : null,
        bracket: bracket?.label || 'Unknown',
        gross, empRate, erRate, empCpf, erCpf,
        totalCpf: empCpf + erCpf,
        cappedOW, awSubject,
        lowIncomeFlag: p.low_income_flag || false,
      }
    })

    const totalEmpCpf = rows.reduce((s, r) => s + r.empCpf, 0)
    const totalErCpf = rows.reduce((s, r) => s + r.erCpf, 0)
    const totalWages = rows.reduce((s, r) => s + r.gross, 0)

    setPreview({ month: selectedMonth, year: selectedYear, rows, totalEmpCpf, totalErCpf, totalWages, totalCpf: totalEmpCpf + totalErCpf, staffCount: rows.length })
    setGenerating(false)
  }

  const handleSaveSubmission = async () => {
    if (!preview) return
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('cpf_submissions').upsert({
      payroll_month: preview.month, payroll_year: preview.year,
      total_employee_cpf: preview.totalEmpCpf, total_employer_cpf: preview.totalErCpf,
      total_wages: preview.totalWages, staff_count: preview.staffCount,
      status: 'pending', generated_at: new Date().toISOString(),
    }, { onConflict: 'payroll_month,payroll_year' })
    await load(); setPreview(null); showMsg('CPF report saved')
  }

  const handleMarkSubmitted = async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('cpf_submissions').update({ status: 'submitted', submitted_by: user?.id, submitted_at: new Date().toISOString() }).eq('id', id)
    await load(); logActivity('update', 'CPF Configuration', 'Marked CPF submission complete')
    showMsg('Marked as submitted to CPF')
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div><h1 className="text-xl font-bold text-gray-900">CPF Configuration & Reports</h1><p className="text-sm text-gray-500">Singapore CPF rates by age bracket + monthly submission reports</p></div>

      <StatusBanner success={success} />

      {/* Age brackets */}
      <div className="card">
        <div className="p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2"><Calculator className="w-4 h-4 text-red-600" /> CPF Rates by Age Bracket</h2>
          <p className="text-xs text-gray-400 mt-1">Auto-applied to payslips based on staff date of birth. Update when government changes rates.</p>
        </div>
        <div className="divide-y divide-gray-100">
          {brackets.map(b => (
            <div key={b.id} className="p-4">
              {editingBracket === b.id ? (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-gray-900">{b.label}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="label text-xs">Employee CPF %</label><input className="input" type="number" step="0.1" value={editValues.employee_rate} onChange={e => setEditValues(v => ({ ...v, employee_rate: parseFloat(e.target.value) }))} /></div>
                    <div><label className="label text-xs">Employer CPF %</label><input className="input" type="number" step="0.1" value={editValues.employer_rate} onChange={e => setEditValues(v => ({ ...v, employer_rate: parseFloat(e.target.value) }))} /></div>
                  </div>
                  <div><label className="label text-xs">Effective From</label><input className="input" type="date" value={editValues.effective_from} onChange={e => setEditValues(v => ({ ...v, effective_from: e.target.value }))} /></div>
                  <div className="flex gap-2"><button onClick={() => handleSaveBracket(b.id)} disabled={saving} className="btn-primary text-xs py-1.5"><Save className="w-3.5 h-3.5 mr-1" />Save</button><button onClick={() => setEditingBracket(null)} className="btn-secondary text-xs py-1.5">Cancel</button></div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{b.label}</p>
                    {b.effective_from && <p className="text-xs text-gray-400">Effective {b.effective_from.split('T')[0]}</p>}
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="text-center"><p className="font-bold text-blue-700">{b.employee_rate}%</p><p className="text-xs text-gray-400">Employee</p></div>
                    <div className="text-center"><p className="font-bold text-red-700">{b.employer_rate}%</p><p className="text-xs text-gray-400">Employer</p></div>
                    <div className="text-center"><p className="font-bold text-gray-900">{b.employee_rate + b.employer_rate}%</p><p className="text-xs text-gray-400">Total</p></div>
                  </div>
                  <button onClick={() => { setEditingBracket(b.id); setEditValues({ employee_rate: b.employee_rate, employer_rate: b.employer_rate, effective_from: b.effective_from ? b.effective_from.split('T')[0] : '' }) }}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        CPF rates are auto-applied to payslips based on each staff member's date of birth. Staff without a DOB recorded will use the rates stored on their payslip at generation time.
      </div>

      {/* Generate report */}
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
          <div className="border border-gray-200 rounded-xl overflow-hidden space-y-0">
            <div className="p-4 bg-gray-50 flex items-center justify-between">
              <div><p className="text-sm font-semibold text-gray-900">{getMonthName(preview.month)} {preview.year} CPF Report</p><p className="text-xs text-gray-400">{preview.staffCount} CPF-liable staff</p></div>
              <div className="text-right"><p className="text-lg font-bold text-gray-900">{formatSGD(preview.totalCpf)}</p><p className="text-xs text-gray-400">Total to submit</p></div>
            </div>
            <div className="grid grid-cols-3 divide-x divide-gray-100">
              <div className="p-3 text-center"><p className="text-sm font-bold text-gray-700">{formatSGD(preview.totalWages)}</p><p className="text-xs text-gray-400">Total Wages</p></div>
              <div className="p-3 text-center"><p className="text-sm font-bold text-blue-700">{formatSGD(preview.totalEmpCpf)}</p><p className="text-xs text-blue-400">Employee CPF</p></div>
              <div className="p-3 text-center"><p className="text-sm font-bold text-red-700">{formatSGD(preview.totalErCpf)}</p><p className="text-xs text-red-400">Employer CPF</p></div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="bg-gray-50 text-gray-400 uppercase"><th className="text-left p-2">Staff</th><th className="text-center p-2">Age</th><th className="text-center p-2">Bracket</th><th className="text-right p-2">Gross</th><th className="text-right p-2">EE CPF</th><th className="text-right p-2">ER CPF</th></tr></thead>
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
            <div className="p-4 border-t border-gray-100">
              <button onClick={handleSaveSubmission} className="btn-primary w-full">Save Report</button>
            </div>
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
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', sub.status === 'submitted' ? 'bg-green-100 text-green-700' : 'badge-pending')}>{sub.status === 'submitted' ? '✓ Submitted' : 'Pending'}</span>
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
