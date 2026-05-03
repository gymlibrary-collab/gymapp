'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { formatDate, formatSGD, getMonthName } from '@/lib/utils'
import {
  ArrowLeft, DollarSign, Plus, TrendingUp, FileText,
  CheckCircle, AlertCircle, Save, X, ChevronDown, ChevronUp,
  Clock, Calendar
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export default function StaffPayrollDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const [staff, setStaff] = useState<any>(null)
  const [payroll, setPayroll] = useState<any>(null)
  const [salaryHistory, setSalaryHistory] = useState<any[]>([])
  const [bonuses, setBonuses] = useState<any[]>([])
  const [payslips, setPayslips] = useState<any[]>([])
  const [rosterSummary, setRosterSummary] = useState<any[]>([])
  const [cpfRates, setCpfRates] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [showSalaryForm, setShowSalaryForm] = useState(false)
  const [showIncrementForm, setShowIncrementForm] = useState(false)
  const [showBonusForm, setShowBonusForm] = useState(false)
  const [showPayslipForm, setShowPayslipForm] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const [salaryForm, setSalaryForm] = useState({ current_salary: '', is_cpf_liable: 'true' })
  const [incrementForm, setIncrementForm] = useState({ change_amount: '', effective_from: '', change_type: 'increment', notes: '' })
  const [bonusForm, setBonusForm] = useState({ bonus_type: 'performance', amount: '', month: new Date().getMonth() + 1, year: new Date().getFullYear(), notes: '' })
  const [payslipForm, setPayslipForm] = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear(), notes: '' })
  const supabase = createClient()

  const showMsg = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000) }

  const getAge = (dob: string | null) => {
    if (!dob) return null
    const today = new Date(); const birth = new Date(dob)
    let age = today.getFullYear() - birth.getFullYear()
    if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--
    return age
  }

  const getBracketRates = (brackets: any[], dob: string | null) => {
    const age = getAge(dob)
    if (age === null) return { employee_rate: 20, employer_rate: 17 }
    const bracket = brackets.find((b: any) => age >= b.age_from && (b.age_to === null || age <= b.age_to))
    return bracket
      ? { employee_rate: bracket.employee_rate, employer_rate: bracket.employer_rate }
      : { employee_rate: 20, employer_rate: 17 }
  }

  useEffect(() => { loadData() }, [id])

  const loadData = async () => {
    setLoading(true)
    // Guard — only business_ops can access payroll
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) { router.push('/dashboard'); return }
    const { data: me } = await supabase.from('users').select('role').eq('id', authUser.id).single()
    if (!me || me.role !== 'business_ops') { router.push('/dashboard'); return }

    const { data: staffData } = await supabase.from('users').select('*').eq('id', id).single()
    setStaff(staffData)

    const { data: payrollData } = await supabase.from('staff_payroll').select('*').eq('user_id', id).single()
    setPayroll(payrollData)
    if (payrollData) setSalaryForm({ current_salary: payrollData.current_salary?.toString() || '0', is_cpf_liable: payrollData.is_cpf_liable ? 'true' : 'false' })

    const { data: historyData } = await supabase.from('salary_history').select('*').eq('user_id', id).order('effective_from', { ascending: false })
    setSalaryHistory(historyData || [])

    const { data: bonusData } = await supabase.from('staff_bonuses').select('*').eq('user_id', id).order('year', { ascending: false }).order('month', { ascending: false })
    setBonuses(bonusData || [])

    const { data: slipData } = await supabase.from('payslips').select('*').eq('user_id', id).order('year', { ascending: false }).order('month', { ascending: false }).limit(13)
    setPayslips(slipData || [])

    // For part-timers: load last 3 months roster summary
    if (staffData?.employment_type === 'part_time') {
      const { data: roster } = await supabase.from('duty_roster').select('shift_date, hours_worked, gross_pay, status')
        .eq('user_id', id).order('shift_date', { ascending: false }).limit(90)

      // Group by month/year
      const grouped: Record<string, any> = {}
      roster?.forEach((r: any) => {
        const d = new Date(r.shift_date)
        const key = `${d.getFullYear()}-${d.getMonth() + 1}`
        if (!grouped[key]) grouped[key] = { month: d.getMonth() + 1, year: d.getFullYear(), hours: 0, pay: 0, shifts: 0 }
        if (r.status === 'completed') { grouped[key].hours += r.hours_worked || 0; grouped[key].pay += r.gross_pay || 0; grouped[key].shifts++ }
      })
      setRosterSummary(Object.values(grouped).sort((a, b) => b.year - a.year || b.month - a.month).slice(0, 3))
    }

    // Load CPF age brackets (Q3 fix: use age-bracket rates not flat cpf_rates table)
    const { data: brackets } = await supabase.from('cpf_age_brackets').select('*').order('age_from')
    setCpfRates(brackets || [])  // repurpose cpfRates state to hold brackets array
    setLoading(false)
  }

  const handleSavePayroll = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('')
    const { data: { user: authUser } } = await supabase.auth.getUser()
    const newSalary = parseFloat(salaryForm.current_salary)
    const isCpf = salaryForm.is_cpf_liable === 'true'

    await supabase.from('staff_payroll').upsert({ user_id: id, current_salary: newSalary, is_cpf_liable: isCpf, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })

    if (salaryHistory.length === 0 && newSalary > 0) {
      await supabase.from('salary_history').insert({ user_id: id, salary_amount: newSalary, effective_from: staff?.date_of_joining || new Date().toISOString().split('T')[0], change_type: 'initial', change_amount: newSalary, notes: 'Initial salary set', created_by: authUser?.id })
    }

    await loadData(); setSaving(false); setShowSalaryForm(false); showMsg('Payroll profile saved')
  }

  const handleAddIncrement = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('')
    const { data: { user: authUser } } = await supabase.auth.getUser()
    const changeAmt = parseFloat(incrementForm.change_amount)
    const newSalary = (payroll?.current_salary || 0) + changeAmt

    await supabase.from('salary_history').insert({ user_id: id, salary_amount: newSalary, effective_from: incrementForm.effective_from, change_type: incrementForm.change_type, change_amount: changeAmt, notes: incrementForm.notes || null, created_by: authUser?.id })
    await supabase.from('staff_payroll').update({ current_salary: newSalary, updated_at: new Date().toISOString() }).eq('user_id', id)

    await loadData(); setSaving(false); setShowIncrementForm(false)
    setIncrementForm({ change_amount: '', effective_from: '', change_type: 'increment', notes: '' })
    showMsg(`Salary updated to ${formatSGD(newSalary)}`)
  }

  const handleAddBonus = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true)
    const { data: { user: authUser } } = await supabase.auth.getUser()
    await supabase.from('staff_bonuses').insert({ user_id: id, bonus_type: bonusForm.bonus_type, amount: parseFloat(bonusForm.amount), month: bonusForm.month, year: bonusForm.year, notes: bonusForm.notes || null, created_by: authUser?.id })
    await loadData(); setSaving(false); setShowBonusForm(false)
    setBonusForm({ bonus_type: 'performance', amount: '', month: new Date().getMonth() + 1, year: new Date().getFullYear(), notes: '' })
    showMsg('Bonus recorded')
  }

  const handleGeneratePayslip = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('')
    const { data: { user: authUser } } = await supabase.auth.getUser()
    const isPartTime = staff?.employment_type === 'part_time'

    // Issue 5: Hard block future month
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1
    const isFuture = payslipForm.year > currentYear ||
      (payslipForm.year === currentYear && payslipForm.month > currentMonth)
    if (isFuture) {
      setError(`Cannot generate a payslip for a future month (${payslipForm.month}/${payslipForm.year}). Wait until the month has ended.`)
      setSaving(false); return
    }

    // Issue 2: Hard block if approved or paid payslip already exists
    const { data: existing } = await supabase.from('payslips')
      .select('id, status').eq('user_id', id as string)
      .eq('month', payslipForm.month).eq('year', payslipForm.year).single()
    if (existing && (existing.status === 'approved' || existing.status === 'paid')) {
      setError(`A ${existing.status} payslip already exists for this month. Approved and paid payslips cannot be overwritten.`)
      setSaving(false); return
    }

    // Issue 2 fix: only include completed shifts for part-timers
    let totalHours = 0, totalPay = 0
    if (isPartTime) {
      const monthStart = `${payslipForm.year}-${String(payslipForm.month).padStart(2, '0')}-01`
      const monthEnd = new Date(payslipForm.year, payslipForm.month, 0).toISOString().split('T')[0]
      const { data: roster } = await supabase.from('duty_roster')
        .select('hours_worked, gross_pay')
        .eq('user_id', id)
        .gte('shift_date', monthStart).lte('shift_date', monthEnd)
        .eq('status', 'completed')  // completed shifts only, not scheduled or cancelled
      totalHours = roster?.reduce((s: number, r: any) => s + (r.hours_worked || 0), 0) || 0
      totalPay = roster?.reduce((s: number, r: any) => s + (r.gross_pay || 0), 0) || 0
    }

    const basicSalary = isPartTime ? totalPay : (payroll?.current_salary || 0)

    // Issue 1 fix: auto-pull bonuses from staff_bonuses for this month
    const { data: bonusRows } = await supabase.from('staff_bonuses')
      .select('amount').eq('user_id', id as string)
      .eq('month', payslipForm.month).eq('year', payslipForm.year)
    const bonusAmt = bonusRows?.reduce((s: number, b: any) => s + (b.amount || 0), 0) || 0

    const isCpf = payroll?.is_cpf_liable ?? (isPartTime ? false : true)

    // Issue 1 fix: use age-bracket rates from cpf_age_brackets
    const brackets = Array.isArray(cpfRates) ? cpfRates : []
    const rates = getBracketRates(brackets, staff?.date_of_birth || null)

    const { error: err } = await supabase.from('payslips').upsert({
      user_id: id, month: payslipForm.month, year: payslipForm.year,
      employment_type: staff?.employment_type || 'full_time',
      basic_salary: basicSalary, bonus_amount: bonusAmt,
      total_hours: isPartTime ? totalHours : null,
      hourly_rate_used: isPartTime ? (staff?.hourly_rate || 0) : null,
      is_cpf_liable: isCpf,
      employee_cpf_rate: isCpf ? rates.employee_rate : 0,
      employer_cpf_rate: isCpf ? rates.employer_rate : 0,
      notes: payslipForm.notes || null, status: 'draft',
      generated_by: authUser?.id, generated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,month,year' })

    if (err) { setError(err.message); setSaving(false); return }
    await loadData(); setSaving(false); setShowPayslipForm(false); showMsg('Payslip generated')
  }

  const handleDeletePayslip = async (payslipId: string) => {
    if (!confirm('Delete this draft payslip? This cannot be undone.')) return
    await supabase.from('payslips').delete().eq('id', payslipId).eq('status', 'draft')
    await loadData(); showMsg('Draft payslip deleted')
  }

  const handlePayslipAction = async (payslipId: string, action: 'approved' | 'paid') => {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    const update: any = { status: action }
    if (action === 'approved') { update.approved_by = authUser?.id; update.approved_at = new Date().toISOString() }
    if (action === 'paid') update.paid_at = new Date().toISOString()
    await supabase.from('payslips').update(update).eq('id', payslipId)
    await loadData(); showMsg(`Payslip ${action}`)
  }

  const downloadPayslipPdf = async (slip: any) => {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF()
    const isPartTime = slip.employment_type === 'part_time'

    doc.setFontSize(18); doc.text('PAYSLIP', 14, 20)
    doc.setFontSize(10); doc.setTextColor(100)
    doc.text(`${getMonthName(slip.month)} ${slip.year}`, 14, 28)
    doc.setTextColor(0)
    doc.text(`${staff?.full_name} · ${isPartTime ? 'Part-time' : 'Full-time'}`, 14, 36)
    if (staff?.nric) doc.text(`NRIC: ${staff.nric}`, 14, 42)

    const rows: any[] = []
    if (isPartTime && slip.total_hours > 0) {
      rows.push([`Hours Worked: ${slip.total_hours}h @ ${formatSGD(slip.hourly_rate_used)}/h`, formatSGD(slip.basic_salary)])
    } else {
      rows.push(['Basic Salary', formatSGD(slip.basic_salary)])
    }
    if (slip.bonus_amount > 0) rows.push(['Bonus', formatSGD(slip.bonus_amount)])
    rows.push(['Gross Salary', formatSGD(slip.gross_salary)])
    rows.push(['', ''])
    if (slip.is_cpf_liable) rows.push([`Employee CPF (${slip.employee_cpf_rate}%)`, `- ${formatSGD(slip.employee_cpf_amount)}`])
    else rows.push(['CPF', 'Not applicable'])
    rows.push(['', ''])
    rows.push(['Net Pay', formatSGD(slip.net_salary)])

    autoTable(doc, {
      startY: 52, head: [['Description', 'Amount (SGD)']], body: rows,
      headStyles: { fillColor: [220, 38, 38] },
      columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
    })
    const fy = (doc as any).lastAutoTable.finalY + 8
    if (slip.is_cpf_liable) { doc.setFontSize(9); doc.setTextColor(100); doc.text(`Employer CPF (${slip.employer_cpf_rate}%): ${formatSGD(slip.employer_cpf_amount)}`, 14, fy) }
    doc.save(`payslip_${staff?.full_name}_${getMonthName(slip.month)}_${slip.year}.pdf`)
  }

  if (loading) return <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600" /></div>
  if (!staff) return <div className="card p-8 text-center"><p className="text-gray-500">Staff not found</p></div>

  const isPartTime = staff.employment_type === 'part_time'

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/payroll" className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft className="w-4 h-4 text-gray-600" /></Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{staff.full_name}</h1>
          <p className="text-sm text-gray-500 capitalize">{staff.role} · {isPartTime ? 'Part-time' : 'Full-time'} · {staff.email}</p>
        </div>
        <div className={cn('text-xs px-2.5 py-1 rounded-full font-medium', payroll?.is_cpf_liable ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600')}>
          {payroll?.is_cpf_liable ? 'CPF Liable' : 'No CPF'}
        </div>
      </div>

      {success && <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700"><CheckCircle className="w-4 h-4 flex-shrink-0" />{success}</div>}
      {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600"><AlertCircle className="w-4 h-4 flex-shrink-0" />{error}<button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button></div>}

      {/* Part-timer: roster summary */}
      {isPartTime && (
        <div className="card p-4">
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2 mb-3"><Clock className="w-4 h-4 text-red-600" /> Recent Roster Summary</h2>
          {rosterSummary.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-2">No roster shifts recorded yet</p>
          ) : (
            <div className="space-y-2">
              {rosterSummary.map(r => (
                <div key={`${r.year}-${r.month}`} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                  <p className="text-sm font-medium text-gray-900">{getMonthName(r.month)} {r.year}</p>
                  <div className="text-right">
                    <p className="text-sm font-bold text-blue-700">{formatSGD(r.pay)}</p>
                    <p className="text-xs text-gray-400">{r.hours.toFixed(1)}h · {r.shifts} shifts</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Salary & CPF — only for full-time */}
      {!isPartTime && (
        <div className="card">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2"><DollarSign className="w-4 h-4 text-red-600" /> Salary & CPF</h2>
            <div className="flex gap-2">
              <button onClick={() => { setShowSalaryForm(!showSalaryForm); setShowIncrementForm(false) }} className="btn-secondary text-xs py-1.5">Edit</button>
              {payroll?.current_salary > 0 && <button onClick={() => { setShowIncrementForm(!showIncrementForm); setShowSalaryForm(false) }} className="btn-primary flex items-center gap-1 text-xs py-1.5"><TrendingUp className="w-3.5 h-3.5" /> Increment</button>}
            </div>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-gray-50 rounded-lg p-3 text-center"><p className="text-xl font-bold text-gray-900">{formatSGD(payroll?.current_salary || 0)}</p><p className="text-xs text-gray-500 mt-1">Monthly Salary</p></div>
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-blue-700">
                  {payroll?.is_cpf_liable
                    ? `${getBracketRates(Array.isArray(cpfRates) ? cpfRates : [], staff?.date_of_birth || null).employee_rate}%`
                    : 'N/A'}
                </p>
                <p className="text-xs text-blue-600 mt-1">Employee CPF</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-red-700">
                  {payroll?.is_cpf_liable
                    ? `${getBracketRates(Array.isArray(cpfRates) ? cpfRates : [], staff?.date_of_birth || null).employer_rate}%`
                    : 'N/A'}
                </p>
                <p className="text-xs text-red-600 mt-1">Employer CPF</p>
              </div>
            </div>
            {payroll?.is_cpf_liable && payroll?.current_salary > 0 && (
              <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 space-y-1">
                <div className="flex justify-between"><span>Gross Salary</span><span className="font-medium">{formatSGD(payroll.current_salary)}</span></div>
                {(() => {
                  const r = getBracketRates(Array.isArray(cpfRates) ? cpfRates : [], staff?.date_of_birth || null)
                  const sal = payroll.current_salary
                  return <>
                    <div className="flex justify-between text-blue-600"><span>Employee CPF ({r.employee_rate}%)</span><span>- {formatSGD(sal * r.employee_rate / 100)}</span></div>
                    <div className="flex justify-between font-medium text-gray-900 border-t border-gray-200 pt-1"><span>Net Take-home</span><span>{formatSGD(sal * (1 - r.employee_rate / 100))}</span></div>
                    <div className="flex justify-between text-red-600 border-t border-gray-200 pt-1"><span>Employer CPF ({r.employer_rate}%)</span><span>+ {formatSGD(sal * r.employer_rate / 100)}</span></div>
                    <div className="flex justify-between font-medium text-gray-900"><span>Total employer cost</span><span>{formatSGD(sal * (1 + r.employer_rate / 100))}</span></div>
                  </>
                })()}
              </div>
            )}
          </div>

          {showSalaryForm && (
            <form onSubmit={handleSavePayroll} className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
              <div><label className="label">Monthly Salary (SGD) *</label><input className="input" type="number" required min="0" step="0.01" value={salaryForm.current_salary} onChange={e => setSalaryForm(f => ({ ...f, current_salary: e.target.value }))} /></div>
              <div><label className="label">CPF Liability</label><select className="input" value={salaryForm.is_cpf_liable} onChange={e => setSalaryForm(f => ({ ...f, is_cpf_liable: e.target.value }))}><option value="true">CPF Liable (SG Citizen / PR)</option><option value="false">Not CPF Liable (Foreigner / Exempt)</option></select></div>
              <div className="flex gap-2"><button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : 'Save'}</button><button type="button" onClick={() => setShowSalaryForm(false)} className="btn-secondary">Cancel</button></div>
            </form>
          )}

          {showIncrementForm && (
            <form onSubmit={handleAddIncrement} className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Type</label><select className="input" value={incrementForm.change_type} onChange={e => setIncrementForm(f => ({ ...f, change_type: e.target.value }))}><option value="increment">Increment</option><option value="adjustment">Adjustment</option><option value="promotion">Promotion</option></select></div>
                <div><label className="label">Amount (SGD)</label><input className="input" type="number" step="0.01" required value={incrementForm.change_amount} onChange={e => setIncrementForm(f => ({ ...f, change_amount: e.target.value }))} placeholder="+ raise / - reduction" /></div>
              </div>
              <div><label className="label">Effective From *</label><input className="input" type="date" required value={incrementForm.effective_from} onChange={e => setIncrementForm(f => ({ ...f, effective_from: e.target.value }))} /></div>
              {incrementForm.change_amount && <div className="text-xs bg-green-50 border border-green-200 rounded-lg p-2">New salary: <strong>{formatSGD((payroll?.current_salary || 0) + parseFloat(incrementForm.change_amount || '0'))}</strong></div>}
              <div><label className="label">Notes</label><input className="input" value={incrementForm.notes} onChange={e => setIncrementForm(f => ({ ...f, notes: e.target.value }))} /></div>
              <div className="flex gap-2"><button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : 'Add Change'}</button><button type="button" onClick={() => setShowIncrementForm(false)} className="btn-secondary">Cancel</button></div>
            </form>
          )}
        </div>
      )}

      {/* Salary history — full-time only */}
      {!isPartTime && (
        <div className="card">
          <button className="w-full flex items-center justify-between p-4" onClick={() => setShowHistory(!showHistory)}>
            <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4 text-red-600" /> Salary History ({salaryHistory.length})</h2>
            {showHistory ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
          {showHistory && (
            <div className="border-t border-gray-100 overflow-x-auto">
              {salaryHistory.length === 0 ? <p className="p-4 text-sm text-gray-400 text-center">No history yet</p> : (
                <table className="w-full text-sm">
                  <thead><tr className="bg-gray-50 text-xs text-gray-500 uppercase"><th className="text-left p-3">Effective</th><th className="text-left p-3">Type</th><th className="text-right p-3">Change</th><th className="text-right p-3">New Salary</th></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {salaryHistory.map(h => (
                      <tr key={h.id}>
                        <td className="p-3 text-gray-900">{formatDate(h.effective_from)}</td>
                        <td className="p-3 text-gray-600 capitalize">{h.change_type}</td>
                        <td className={cn('p-3 text-right font-medium', h.change_amount > 0 ? 'text-green-600' : 'text-red-600')}>{h.change_amount > 0 ? '+' : ''}{formatSGD(h.change_amount)}</td>
                        <td className="p-3 text-right font-bold text-gray-900">{formatSGD(h.salary_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {/* Bonuses */}
      <div className="card">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2"><DollarSign className="w-4 h-4 text-red-600" /> Bonuses ({bonuses.length})</h2>
          <button onClick={() => setShowBonusForm(!showBonusForm)} className="btn-primary flex items-center gap-1 text-xs py-1.5"><Plus className="w-3.5 h-3.5" /> Add Bonus</button>
        </div>
        {showBonusForm && (
          <form onSubmit={handleAddBonus} className="p-4 border-b border-gray-100 bg-red-50 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Type</label><select className="input" value={bonusForm.bonus_type} onChange={e => setBonusForm(f => ({ ...f, bonus_type: e.target.value }))}><option value="performance">Performance</option><option value="annual">Annual</option><option value="discretionary">Discretionary</option><option value="other">Other</option></select></div>
              <div><label className="label">Amount (SGD) *</label><input className="input" type="number" required min="0" step="0.01" value={bonusForm.amount} onChange={e => setBonusForm(f => ({ ...f, amount: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Month</label><select className="input" value={bonusForm.month} onChange={e => setBonusForm(f => ({ ...f, month: parseInt(e.target.value) }))}>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{getMonthName(i + 1)}</option>)}</select></div>
              <div><label className="label">Year</label><input className="input" type="number" value={bonusForm.year} onChange={e => setBonusForm(f => ({ ...f, year: parseInt(e.target.value) }))} /></div>
            </div>
            <div><label className="label">Notes</label><input className="input" value={bonusForm.notes} onChange={e => setBonusForm(f => ({ ...f, notes: e.target.value }))} /></div>
            <div className="flex gap-2"><button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : 'Record Bonus'}</button><button type="button" onClick={() => setShowBonusForm(false)} className="btn-secondary">Cancel</button></div>
          </form>
        )}
        {bonuses.length === 0 ? <p className="p-4 text-sm text-gray-400 text-center">No bonuses</p> : (
          <div className="divide-y divide-gray-100">
            {bonuses.map(b => <div key={b.id} className="flex items-center gap-3 p-4"><div className="flex-1 min-w-0"><p className="text-sm font-medium text-gray-900 capitalize">{b.bonus_type} Bonus</p><p className="text-xs text-gray-500">{getMonthName(b.month)} {b.year}{b.notes && ` · ${b.notes}`}</p></div><p className="text-sm font-bold text-green-700">{formatSGD(b.amount)}</p></div>)}
          </div>
        )}
      </div>

      {/* Payslips */}
      <div className="card">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2"><FileText className="w-4 h-4 text-red-600" /> Payslips ({payslips.length})</h2>
          <button onClick={() => setShowPayslipForm(!showPayslipForm)} className="btn-primary flex items-center gap-1 text-xs py-1.5"><Plus className="w-3.5 h-3.5" /> Generate</button>
        </div>
        {showPayslipForm && (
          <form onSubmit={handleGeneratePayslip} className="p-4 border-b border-gray-100 bg-red-50 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Month *</label><select className="input" value={payslipForm.month} onChange={e => setPayslipForm(f => ({ ...f, month: parseInt(e.target.value) }))}>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{getMonthName(i + 1)}</option>)}</select></div>
              <div><label className="label">Year *</label><input className="input" type="number" value={payslipForm.year} onChange={e => setPayslipForm(f => ({ ...f, year: parseInt(e.target.value) }))} /></div>
            </div>
            {/* Bonus auto-pulled from Bonuses section for this month */}
            {!isPartTime && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 space-y-1">
                <p className="font-medium">Bonus auto-included</p>
                <p>Any bonuses recorded under the Bonuses section for this month will be automatically included in the payslip.</p>
              </div>
            )}
            {isPartTime && <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">Payslip will be calculated from completed roster shifts for the selected month. Only shifts with status Completed are included.</div>}
            <div><label className="label">Notes</label><input className="input" value={payslipForm.notes} onChange={e => setPayslipForm(f => ({ ...f, notes: e.target.value }))} /></div>
            <div className="flex gap-2"><button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Generating...' : 'Generate Payslip'}</button><button type="button" onClick={() => setShowPayslipForm(false)} className="btn-secondary">Cancel</button></div>
          </form>
        )}
        {payslips.length === 0 ? <p className="p-4 text-sm text-gray-400 text-center">No payslips yet</p> : (
          <div className="divide-y divide-gray-100">
            {payslips.map(ps => (
              <div key={ps.id} className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div><p className="font-medium text-gray-900 text-sm">{getMonthName(ps.month)} {ps.year}</p><p className="text-xs text-gray-500">{ps.employment_type === 'part_time' ? `${ps.total_hours}h roster` : `Basic: ${formatSGD(ps.basic_salary)}`}{ps.bonus_amount > 0 && ` + ${formatSGD(ps.bonus_amount)}`}</p></div>
                  <div className="text-right"><p className="font-bold text-gray-900">{formatSGD(ps.net_salary)}</p><p className="text-xs text-gray-400">net pay</p></div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', ps.status === 'paid' ? 'bg-green-100 text-green-700' : ps.status === 'approved' ? 'bg-blue-100 text-blue-700' : 'badge-pending')}>{ps.status.charAt(0).toUpperCase() + ps.status.slice(1)}</span>
                  {ps.status === 'draft' && <button onClick={() => handlePayslipAction(ps.id, 'approved')} className="text-xs text-blue-600 hover:underline">Approve</button>}
                  {ps.status === 'draft' && <button onClick={() => handleDeletePayslip(ps.id)} className="text-xs text-red-500 hover:underline">Delete</button>}
                  {ps.status === 'approved' && <button onClick={() => handlePayslipAction(ps.id, 'paid')} className="text-xs text-green-600 hover:underline">Mark Paid</button>}
                  {ps.status !== 'draft' && <button onClick={() => downloadPayslipPdf(ps)} className="text-xs text-red-600 hover:underline flex items-center gap-1"><FileText className="w-3 h-3" /> PDF</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
