'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { formatDate, formatSGD, getMonthName, getRoleLabel, todaySGT} from '@/lib/utils'
import { addLogoHeader, PDF_TABLE_STYLE, resolvePayslipBranding, renderPayslipPdf } from '@/lib/pdf'
import { getAgeAsOf, getCpfBracketRates, loadCpfBrackets } from '@/lib/cpf'
import {
  ArrowLeft, DollarSign, Plus, TrendingUp, FileText,
  CheckCircle, AlertCircle, Save, X, ChevronDown, ChevronUp,
  Clock, Calendar
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { StatusBanner } from '@/components/StatusBanner'
import { useCurrentUser } from '@/hooks/useCurrentUser'

export default function StaffPayrollDetailPage() {

  const { user, loading } = useCurrentUser({ allowedRoles: ['business_ops'] })
  const { id } = useParams()
  const router = useRouter()
  const { logActivity } = useActivityLog()
  const [staff, setStaff] = useState<any>(null)
  const [payroll, setPayroll] = useState<any>(null)
  const [salaryHistory, setSalaryHistory] = useState<any[]>([])
  const [bonuses, setBonuses] = useState<any[]>([])
  const [payslips, setPayslips] = useState<any[]>([])
  const [commissionPayouts, setCommissionPayouts] = useState<any[]>([])
  const [rosterSummary, setRosterSummary] = useState<any[]>([])
  const [cpfRates, setCpfRates] = useState<any>(null)
  const [payslipBranding, setPayslipBranding] = useState<{logoUrl: string|null, companyName: string, gymName: string}>({ logoUrl: null, companyName: 'Gym Operations', gymName: 'Gym Operations' })
  const [saving, setSaving] = useState(false)
  const [deleteModal, setDeleteModal] = useState<{ payslip: any } | null>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [editingDeduction, setEditingDeduction] = useState<{id: string, type: 'payslip' | 'commission', amount: string, reason: string} | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [isBizOpsRole, setIsBizOpsRole] = useState(false)

  const [showSalaryForm, setShowSalaryForm] = useState(false)
  const [showIncrementForm, setShowIncrementForm] = useState(false)
  const [showBonusForm, setShowBonusForm] = useState(false)
  const [showPayslipForm, setShowPayslipForm] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const [salaryForm, setSalaryForm] = useState({ current_salary: '', is_cpf_liable: 'true' })
  const [incrementForm, setIncrementForm] = useState({ change_amount: '', effective_from: '', change_type: 'increment', notes: '' })
  const [bonusForm, setBonusForm] = useState({ bonus_type: 'performance', amount: '', month: new Date(Date.now()+8*60*60*1000).getUTCMonth() + 1, year: new Date(Date.now()+8*60*60*1000).getUTCFullYear(), notes: '' })
  const [payslipForm, setPayslipForm] = useState({ month: new Date(Date.now()+8*60*60*1000).getUTCMonth() + 1, year: new Date(Date.now()+8*60*60*1000).getUTCFullYear(), notes: '' })
  const [payslipPreview, setPayslipPreview] = useState<any>(null)
  const supabase = createClient()

  const { success, error, showMsg, showError, setError } = useToast()

  // Calculate age as of a reference date.
  // CPF bracket moves to the next bracket the DAY AFTER the birthday,
  // so a person born 1 Aug 1970 is in Bracket 2 from 2 Aug 2025.
  // Reference date = last day of the payroll month.
  // getAgeAsOf and getCpfBracketRates are imported from @/lib/cpf
  const getAge = (dob: string | null) => getAgeAsOf(dob, new Date(Date.now() + 8 * 60 * 60 * 1000))

  // getBracketRates: alias of getCpfBracketRates from @/lib/cpf
  const getBracketRates = getCpfBracketRates

  const loadData = async () => {
    logActivity('page_view', 'Staff Payroll', 'Viewed staff payroll')
    // Guard — only business_ops can access payroll
    setIsBizOpsRole(user!.role === 'business_ops')

    const { data: staffData } = await supabase.from('users').select('*').eq('id', id).maybeSingle()
    setStaff(staffData)

    const { data: payrollData } = await supabase.from('staff_payroll').select('*').eq('user_id', id).maybeSingle()
    setPayroll(payrollData)
    if (payrollData) setSalaryForm({ current_salary: payrollData.current_salary?.toString() || '0', is_cpf_liable: payrollData.is_cpf_liable ? 'true' : 'false' })

    const { data: historyData } = await supabase.from('salary_history').select('*').eq('user_id', id).order('effective_from', { ascending: false })
    setSalaryHistory(historyData || [])

    const { data: bonusData } = await supabase.from('staff_bonuses').select('*').eq('user_id', id).order('year', { ascending: false }).order('month', { ascending: false })
    setBonuses(bonusData || [])

    const { data: slipData } = await supabase.from('payslips').select('*').eq('user_id', id).order('year', { ascending: false }).order('month', { ascending: false }).limit(26)
    setPayslips(slipData || [])

    const payoutYearFrom = `${(new Date(Date.now()+8*60*60*1000).getUTCFullYear() - 1)}-01-01`
    const { data: payoutData } = await supabase.from('commission_payouts').select('*').eq('user_id', id).gte('period_start', payoutYearFrom).order('period_start', { ascending: false })
    setCommissionPayouts(payoutData || [])

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

    // Load CPF age brackets
    const brackets = await loadCpfBrackets(supabase)
    setCpfRates(brackets || [])

    // Resolve payslip branding via central helper
    const branding = await resolvePayslipBranding(supabase, staffData)
    setPayslipBranding({ logoUrl: branding.logoUrl, companyName: branding.companyName, gymName: branding.gymName })
  }

  useEffect(() => { if (!user) return; loadData() }, [id, user])

  const handleSavePayroll = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('')
    const { data: { user: authUser } } = await supabase.auth.getUser()
    const newSalary = parseFloat(salaryForm.current_salary)
    const isCpf = salaryForm.is_cpf_liable === 'true'

    await supabase.from('staff_payroll').upsert({ user_id: id, current_salary: newSalary, is_cpf_liable: isCpf, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })

    if (salaryHistory.length === 0 && newSalary > 0) {
      await supabase.from('salary_history').insert({ user_id: id, salary_amount: newSalary, effective_from: staff?.date_of_joining || todaySGT(), change_type: 'initial', change_amount: newSalary, notes: 'Initial salary set', created_by: authUser?.id })
    }

    logActivity('update', 'Staff Payroll', 'Updated staff payroll profile')
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
    logActivity('update', 'Staff Payroll', 'Updated staff salary')
    showMsg(`Salary updated to ${formatSGD(newSalary)}`)
  }

  const handleAddBonus = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true)
    const { data: { user: authUser } } = await supabase.auth.getUser()
    await supabase.from('staff_bonuses').insert({ user_id: id, bonus_type: bonusForm.bonus_type, amount: parseFloat(bonusForm.amount), month: bonusForm.month, year: bonusForm.year, notes: bonusForm.notes || null, created_by: authUser?.id })
    await loadData(); setSaving(false); setShowBonusForm(false)
    setBonusForm({ bonus_type: 'performance', amount: '', month: new Date(Date.now()+8*60*60*1000).getUTCMonth() + 1, year: new Date(Date.now()+8*60*60*1000).getUTCFullYear(), notes: '' })
    logActivity('create', 'Staff Payroll', 'Recorded staff bonus')
    showMsg('Bonus recorded')
  }

  const computePayslipPreview = () => {
    if (!payslipForm.month || !payslipForm.year) return null
    const isPartTime = staff?.employment_type === 'part_time'
    const basicSalary = isPartTime ? null : (payroll?.current_salary || 0)
    const brackets = Array.isArray(cpfRates) ? cpfRates : []
    const hasDob = !!staff?.date_of_birth
    const rates = getBracketRates(brackets, staff?.date_of_birth || null, payslipForm.year, payslipForm.month)
    const isCpf = payroll?.is_cpf_liable ?? (isPartTime ? false : true)
    const bonusForMonth = bonuses.filter(b => b.month === payslipForm.month && b.year === payslipForm.year)
    const bonusAmt = bonusForMonth.reduce((s: number, b: any) => s + (b.amount || 0), 0)
    return { isPartTime, basicSalary, bonusAmt, isCpf, rates, hasDob, bonusForMonth }
  }

  const handleGeneratePayslip = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('')
    const { data: { user: authUser } } = await supabase.auth.getUser()
    const isPartTime = staff?.employment_type === 'part_time'
    const pMonth = payslipForm.month; const pYear = payslipForm.year

    // Block future months
    const now = new Date(Date.now() + 8 * 60 * 60 * 1000) // SGT
    if (pYear > now.getUTCFullYear() || (pYear === now.getUTCFullYear() && pMonth > now.getUTCMonth() + 1)) {
      setError(`Cannot generate a payslip for a future month.`); setSaving(false); return
    }

    // Block overwriting approved/paid payslips
    const { data: existing } = await supabase.from('payslips')
      .select('id, status').eq('user_id', id as string).eq('month', pMonth).eq('year', pYear).maybeSingle()
    if (existing && (existing.status === 'approved' || existing.status === 'paid')) {
      setError(`A ${existing.status} payslip already exists for this month and cannot be overwritten.`)
      setSaving(false); return
    }

    // ── Part-timer: sum completed roster shifts ───────────────
    let totalHours = 0, totalPay = 0
    let rosterShiftIds: string[] = []
    if (isPartTime) {
      const monthStart = `${pYear}-${String(pMonth).padStart(2, '0')}-01`
      const monthEnd = new Date(pYear, pMonth, 0).toISOString().split('T')[0]
      const { data: roster } = await supabase.from('duty_roster')
        .select('id, hours_worked, gross_pay').eq('user_id', id)
        .gte('shift_date', monthStart).lte('shift_date', monthEnd)
        .eq('status', 'completed').is('payslip_id', null) // only unpaid shifts
      totalHours = roster?.reduce((s: number, r: any) => s + (r.hours_worked || 0), 0) || 0
      totalPay = roster?.reduce((s: number, r: any) => s + (r.gross_pay || 0), 0) || 0
      rosterShiftIds = roster?.map((r: any) => r.id) || []
    }

    const basicSalary = isPartTime ? totalPay : (payroll?.current_salary || 0)
    const isCpf = payroll?.is_cpf_liable ?? (isPartTime ? false : true)

    // ── Bonuses for this payslip month ────────────────────────
    const { data: bonusRows } = await supabase.from('staff_bonuses')
      .select('amount').eq('user_id', id as string).eq('month', pMonth).eq('year', pYear)
    const bonusAmt = bonusRows?.reduce((s: number, b: any) => s + (b.amount || 0), 0) || 0

    // ── Pending deductions (overpayment recovery from disputes) ──
    let deductionAmount = 0
    let deductionReason: string | null = null
    let deductionIds: string[] = []
    if (isPartTime) {
      const gymId2 = staff?.trainer_gyms?.[0]?.gym_id || staff?.manager_gym_id || null
      const { data: deductions } = await supabase.from('pending_deductions')
        .select('id, amount, reason').eq('user_id', id as string)
        .is('applied_at', null)
        .is('gym_id', gymId2 ? undefined : null)
      if (gymId2) {
        const gymDeductions = await supabase.from('pending_deductions')
          .select('id, amount, reason').eq('user_id', id as string)
          .eq('gym_id', gymId2).is('applied_at', null)
        if (gymDeductions.data?.length) {
          gymDeductions.data.forEach((d: any) => {
            deductionAmount += d.amount || 0
            deductionReason = d.reason
            deductionIds.push(d.id)
          })
        }
      }
    }

    // ── CPF ceiling config from commission_config ─────────────
    const { data: cfgRows } = await supabase.from('commission_config')
      .select('config_key, config_value')
      .in('config_key', ['cpf_ow_ceiling', 'cpf_annual_ceiling'])
    const cfg: Record<string, number> = {}
    cfgRows?.forEach((r: any) => { cfg[r.config_key] = r.config_value })
    const OW_CEILING = cfg['cpf_ow_ceiling'] ?? 8000
    const ANNUAL_CEILING = cfg['cpf_annual_ceiling'] ?? 102000

    // ── CPF rates: effective_from-aware bracket lookup ────────
    const brackets = Array.isArray(cpfRates) ? cpfRates : []
    const rates = getBracketRates(brackets, staff?.date_of_birth || null, pYear, pMonth)

    // ── Age for low-income threshold check ────────────────────
    const age = getAge(staff?.date_of_birth || null)

    // ── YTD Ordinary Wages (prior approved/paid payslips this year) ──
    const { data: ytdSlips } = await supabase.from('payslips')
      .select('basic_salary, aw_subject_to_cpf, month')
      .eq('user_id', id as string).eq('year', pYear)
      .in('status', ['approved', 'paid'])
      .neq('month', pMonth)
    const ytdOWBefore = ytdSlips?.reduce((s: number, p: any) => s + (p.basic_salary || 0), 0) || 0
    const ytdAWCpfBefore = ytdSlips?.reduce((s: number, p: any) => s + (p.aw_subject_to_cpf || 0), 0) || 0

    // ── CPF Calculation ───────────────────────────────────────
    let empCpf = 0, erCpf = 0
    let cappedOW = 0, awSubject = 0
    let empCpfAW = 0, erCpfAW = 0
    let lowIncomeFlag = false

    if (isCpf && basicSalary > 0) {
      // Low-income threshold: age ≤55 earning ≤$50/month — no CPF required
      if (age !== null && age <= 55 && basicSalary <= 50) {
        lowIncomeFlag = true
      } else {
        // ── Ordinary Wages CPF ────────────────────────────────
        // Check annual ceiling headroom for OW
        const owHeadroom = Math.max(0, ANNUAL_CEILING - ytdOWBefore)
        cappedOW = Math.min(basicSalary, OW_CEILING, owHeadroom)

        const erCpfOW = Math.round(cappedOW * rates.employer_rate / 100)
        const empCpfOW = Math.floor(cappedOW * rates.employee_rate / 100)

        // ── Additional Wages CPF (bonus) ──────────────────────
        if (bonusAmt > 0) {
          // Projected OW = YTD OW already paid + (capped current month OW × remaining months)
          const remainingMonths = 12 - pMonth + 1
          const projectedOW = ytdOWBefore + (Math.min(basicSalary, OW_CEILING) * remainingMonths)
          // AW ceiling = Annual ceiling - projected OW
          const awCeiling = Math.max(0, ANNUAL_CEILING - projectedOW)
          // AW already subjected to CPF this year
          const awRemaining = Math.max(0, awCeiling - ytdAWCpfBefore)
          awSubject = Math.min(bonusAmt, awRemaining)

          if (awSubject > 0) {
            erCpfAW = Math.round(awSubject * rates.employer_rate / 100)
            empCpfAW = Math.floor(awSubject * rates.employee_rate / 100)
          }
        }

        empCpf = empCpfOW + empCpfAW
        erCpf = erCpfOW + erCpfAW
      }
    }

    // ── December Year-End Re-calculation ────────────────────────
    // If this is December, compare actual full-year OW against the
    // projected OW used when any bonus was processed earlier in the year.
    // Surface any CPF top-up or refund as an adjustment note.
    let cpfAdjustmentAmount = 0
    let cpfAdjustmentNote = ''
    if (pMonth === 12 && isCpf && !lowIncomeFlag && ytdAWCpfBefore > 0) {
      // Actual full-year OW = YTD before + December salary
      const actualFullYearOW = ytdOWBefore + Math.min(basicSalary, OW_CEILING)
      const cappedActualOW = Math.min(actualFullYearOW, OW_CEILING * 12)
      const actualAWCeiling = Math.max(0, ANNUAL_CEILING - cappedActualOW)
      const awVariance = actualAWCeiling - ytdAWCpfBefore
      if (Math.abs(awVariance) >= 1) {
        const erAdj = Math.round(Math.abs(awVariance) * rates.employer_rate / 100)
        const empAdj = Math.floor(Math.abs(awVariance) * rates.employee_rate / 100)
        const totalAdj = erAdj + empAdj
        const direction = awVariance > 0 ? 'top-up' : 'refund'
        cpfAdjustmentAmount = awVariance > 0 ? totalAdj : -totalAdj
        cpfAdjustmentNote = `Year-end CPF AW adjustment (${direction}): ` +
          `AW previously subjected to CPF: ${formatSGD(ytdAWCpfBefore)}. ` +
          `Actual AW ceiling based on full-year OW: ${formatSGD(actualAWCeiling)}. ` +
          `Variance: ${formatSGD(Math.abs(awVariance))}. ` +
          `Employee ${direction}: ${formatSGD(empAdj)}. ` +
          `Employer ${direction}: ${formatSGD(erAdj)}.`
      }
    }

    const grossSalary = basicSalary + bonusAmt
    const netSalary = grossSalary - deductionAmount - empCpf
    const totalEmployerCost = grossSalary + erCpf

    // Use delete+insert instead of upsert — avoids ON CONFLICT issues
    // with partial indexes on nullable gym_id column.
    // Only delete draft payslips (approved/paid are immutable).
    const gymId = staff?.trainer_gyms?.[0]?.gym_id || staff?.manager_gym_id || null
    await supabase.from('payslips')
      .delete()
      .eq('user_id', id).eq('month', pMonth).eq('year', pYear)
      .is('gym_id', gymId ? undefined : null)
      .eq('status', 'draft')

    const { error: err } = await supabase.from('payslips').insert({
      user_id: id, month: pMonth, year: pYear,
      gym_id: gymId,
      employment_type: staff?.employment_type || 'full_time',
      basic_salary: basicSalary, bonus_amount: bonusAmt,
      total_hours: isPartTime ? totalHours : null,
      hourly_rate_used: isPartTime ? (staff?.hourly_rate || 0) : null,
      is_cpf_liable: isCpf,
      employee_cpf_rate: rates.employee_rate,
      employer_cpf_rate: rates.employer_rate,
      employee_cpf_amount: empCpf,
      employer_cpf_amount: erCpf,
      net_salary: netSalary,
      total_employer_cost: totalEmployerCost,
      capped_ow: cappedOW,
      aw_subject_to_cpf: awSubject,
      employee_cpf_aw: empCpfAW,
      employer_cpf_aw: erCpfAW,
      ow_ceiling_used: OW_CEILING,
      annual_ceiling_used: ANNUAL_CEILING,
      ytd_ow_before: ytdOWBefore,
      ytd_aw_cpf_before: ytdAWCpfBefore,
      low_income_flag: lowIncomeFlag,
      cpf_adjustment_amount: cpfAdjustmentAmount,
      cpf_adjustment_note: cpfAdjustmentNote || null,
      deduction_amount: deductionAmount,
      deduction_reason: deductionReason,
      notes: payslipForm.notes || null, status: 'draft',
      generated_by: user?.id, generated_at: new Date().toISOString(),
    })

    if (err) { setError(err.message); setSaving(false); return }

    // Fetch the newly inserted payslip to get its ID
    const { data: newPs } = await supabase.from('payslips')
      .select('id').eq('user_id', id as string).eq('month', pMonth).eq('year', pYear)
      .eq('status', 'draft').maybeSingle()
    if (newPs?.id) {
      // Stamp payslip_id on roster rows — prevents double payment
      if (rosterShiftIds.length > 0) {
        await supabase.from('duty_roster').update({ payslip_id: newPs.id }).in('id', rosterShiftIds)
      }
      // Mark pending deductions as applied
      if (deductionIds.length > 0) {
        await supabase.from('pending_deductions')
          .update({ applied_at: new Date().toISOString(), applied_payslip_id: newPs.id })
          .in('id', deductionIds)
      }
    }
    logActivity('create', 'Staff Payroll', 'Generated individual payslip')
    await loadData(); setSaving(false); setShowPayslipForm(false); showMsg('Payslip generated')
  }

  const handleDeletePayslip = async (payslipId: string) => {
    if (!confirm('Delete this draft payslip? This cannot be undone.')) return
    await supabase.from('payslips').delete().eq('id', payslipId).eq('status', 'draft')  // status guard prevents deleting non-draft payslips
    logActivity('delete', 'Staff Payroll', 'Deleted draft payslip')
    await loadData(); showMsg('Draft payslip deleted')
  }

  const handleAdminDeletePayslip = async () => {
    if (!deleteModal) return
    if (deleteReason.trim().length < 10) { setError('Please enter a reason of at least 10 characters'); return }
    // Block deletion of paid payslips — salary already transferred, correct via next month adjustment
    if (deleteModal.payslip.status === 'paid') {
      setError('Paid payslips cannot be deleted — salary has already been transferred. Handle corrections as an adjustment in the next payslip cycle.')
      return
    }
    setDeleting(true)
    const { data: { user: authUser } } = await supabase.auth.getUser()
    const { data: adminUser } = await supabase.from('users_safe').select('full_name').eq('id', authUser?.id).maybeSingle()
    const ps = deleteModal.payslip

    // Write audit record before deleting
    const { error: auditErr } = await supabase.from('payslip_deletions').insert({
      payslip_id: ps.id,
      user_id: ps.user_id,
      staff_name: staff?.full_name || 'Unknown',
      gym_id: ps.gym_id || null,
      gym_name: ps.gym?.name || null,
      month: ps.month,
      year: ps.year,
      employment_type: ps.employment_type,
      basic_salary: ps.basic_salary,
      bonus_amount: ps.bonus_amount,
      gross_salary: ps.gross_salary,
      net_salary: ps.net_salary,
      status_at_deletion: ps.status,
      deleted_by: authUser?.id,
      deleted_by_name: adminUser?.full_name || 'Admin',
      reason: deleteReason.trim(),
    })
    if (auditErr) { setError('Failed to write audit record: ' + auditErr.message); setDeleting(false); return }

    // Delete the payslip — .eq('status', 'approved') ensures paid payslips cannot be deleted even via crafted requests
    await supabase.from('payslips').delete().eq('id', ps.id).eq('status', 'approved')
    setDeleteModal(null); setDeleteReason(''); setDeleting(false)
    logActivity('delete', 'Staff Payroll', 'Deleted approved payslip')
    await loadData(); showMsg('Payslip deleted — audit record saved')
  }

  const handleSaveDeduction = async () => {
    if (!editingDeduction) return
    setSaving(true)
    const amount = parseFloat(editingDeduction.amount) || 0
    if (editingDeduction.type === 'payslip') {
      await supabase.from('payslips').update({
        deduction_amount: amount,
        deduction_reason: editingDeduction.reason.trim() || null,
      }).eq('id', editingDeduction.id).eq('status', 'draft')
    } else {
      await supabase.from('commission_payouts').update({
        deduction_amount: amount,
        deduction_reason: editingDeduction.reason.trim() || null,
      }).eq('id', editingDeduction.id).eq('status', 'pending')
    }
    logActivity('update', 'Staff Payroll', `Updated deduction on ${editingDeduction.type}`)
    setEditingDeduction(null)
    setSaving(false)
    await loadData()
    showMsg('Deduction saved')
  }

  const handlePayslipAction = async (payslipId: string, action: 'approved' | 'paid') => {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    // Guard: only approved payslips can be marked paid
    if (action === 'paid') {
      const slip = payslips.find(p => p.id === payslipId)
      if (!slip || slip.status !== 'approved') {
        setError('Only approved payslips can be marked as paid.'); return
      }
    }
    const update: any = { status: action }
    if (action === 'approved') { update.approved_by = authUser?.id; update.approved_at = new Date().toISOString() }
    if (action === 'paid') update.paid_at = new Date().toISOString()
    await supabase.from('payslips').update(update).eq('id', payslipId)
    logActivity('approve', 'Staff Payroll', `Marked payslip as ${action}`)
    await loadData(); showMsg(`Payslip ${action}`)
  }

  const downloadPayslipPdf = async (slip: any) => {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF()
    await renderPayslipPdf(doc, autoTable, slip, staff!, payslipBranding, payslips, commissionPayouts)
    doc.save(`Payslip-${staff?.full_name}-${getMonthName(slip.month)} ${slip.year}.pdf`)
    logActivity('export', 'Staff Payroll', `Downloaded payslip PDF — ${staff?.full_name} ${getMonthName(slip.month)} ${slip.year}`)
  }

  if (!staff) return <div className="card p-8 text-center"><p className="text-gray-500">Staff not found</p></div>

  const isPartTime = staff.employment_type === 'part_time'

  return (
    <>
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/payroll" className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft className="w-4 h-4 text-gray-600" /></Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{staff.full_name}</h1>
          <p className="text-sm text-gray-500">{getRoleLabel(staff.role)} · {isPartTime ? 'Part-time' : 'Full-time'} · {staff.email}</p>
        </div>
        <div className={cn('text-xs px-2.5 py-1 rounded-full font-medium', payroll?.is_cpf_liable ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600')}>
          {payroll?.is_cpf_liable ? 'CPF Liable' : 'No CPF'}
        </div>
      </div>

      <StatusBanner success={success} error={error} onDismissError={() => setError('')} />

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
                    ? `${getBracketRates(Array.isArray(cpfRates) ? cpfRates : [], staff?.date_of_birth || null, new Date(Date.now()+8*60*60*1000).getUTCFullYear(), new Date(Date.now()+8*60*60*1000).getUTCMonth() + 1).employee_rate}%`
                    : 'N/A'}
                </p>
                <p className="text-xs text-blue-600 mt-1">Employee CPF</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-red-700">
                  {payroll?.is_cpf_liable
                    ? `${getBracketRates(Array.isArray(cpfRates) ? cpfRates : [], staff?.date_of_birth || null, new Date(Date.now()+8*60*60*1000).getUTCFullYear(), new Date(Date.now()+8*60*60*1000).getUTCMonth() + 1).employer_rate}%`
                    : 'N/A'}
                </p>
                <p className="text-xs text-red-600 mt-1">Employer CPF</p>
              </div>
            </div>
            {payroll?.is_cpf_liable && payroll?.current_salary > 0 && (
              <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 space-y-1">
                <div className="flex justify-between"><span>Gross Salary</span><span className="font-medium">{formatSGD(payroll.current_salary)}</span></div>
                {(() => {
                  const now = new Date(Date.now() + 8 * 60 * 60 * 1000) // SGT
                  const r = getBracketRates(Array.isArray(cpfRates) ? cpfRates : [], staff?.date_of_birth || null, now.getUTCFullYear(), now.getUTCMonth() + 1)
                  const sal = payroll.current_salary
                  const cappedSal = Math.min(sal, 8000)
                  const empCpfEst = Math.floor(cappedSal * r.employee_rate / 100)
                  const erCpfEst = Math.round(cappedSal * r.employer_rate / 100)
                  return <>
                    {sal > 8000 && <div className="flex justify-between text-amber-600"><span>OW Capped at $8,000</span><span className="font-medium">{formatSGD(cappedSal)}</span></div>}
                    <div className="flex justify-between text-blue-600"><span>Employee CPF ({r.employee_rate}%)</span><span>- {formatSGD(empCpfEst)}</span></div>
                    <div className="flex justify-between font-medium text-gray-900 border-t border-gray-200 pt-1"><span>Net Take-home</span><span>{formatSGD(sal - empCpfEst)}</span></div>
                    <div className="flex justify-between text-red-600 border-t border-gray-200 pt-1"><span>Employer CPF ({r.employer_rate}%)</span><span>+ {formatSGD(erCpfEst)}</span></div>
                    <div className="flex justify-between font-medium text-gray-900"><span>Total employer cost</span><span>{formatSGD(sal + erCpfEst)}</span></div>
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
            {/* Issue 5+6: Live preview + DOB warning */}
            {(() => {
              const prev = computePayslipPreview()
              if (!prev) return null
              return (
                <div className="space-y-2">
                  {/* DOB warning */}
                  {!prev.hasDob && prev.isCpf && (
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium">Date of birth not set</p>
                        <p className="mt-0.5">CPF rates will default to standard (20% / 17%). Please update this staff member's date of birth to apply the correct age-bracket rates.</p>
                      </div>
                    </div>
                  )}
                  {/* Preview panel */}
                  {!prev.isPartTime && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs space-y-1.5">
                      <p className="font-semibold text-gray-800 text-sm">Payslip Preview</p>
                      <div className="flex justify-between"><span className="text-gray-500">Basic Salary</span><span className="font-medium">{formatSGD(prev.basicSalary)}</span></div>
                      {prev.bonusAmt > 0 && (
                        <div className="flex justify-between text-green-700">
                          <span>Bonus ({prev.bonusForMonth.map((b: any) => b.bonus_type).join(', ')})</span>
                          <span className="font-medium">+ {formatSGD(prev.bonusAmt)}</span>
                        </div>
                      )}
                      {prev.bonusAmt === 0 && (
                        <div className="flex justify-between text-gray-400">
                          <span>Bonus</span><span>None recorded for this month</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-gray-200 pt-1.5"><span className="text-gray-700">Gross</span><span className="font-semibold">{formatSGD((prev.basicSalary || 0) + prev.bonusAmt)}</span></div>
                      {prev.isCpf && (() => {
                        const sal = prev.basicSalary || 0
                        const cappedOWEst = Math.min(sal, 8000)
                        const empCpfOWEst = Math.floor(cappedOWEst * prev.rates.employee_rate / 100)
                        const erCpfOWEst = Math.round(cappedOWEst * prev.rates.employer_rate / 100)
                        // AW estimate: rough ceiling = 102000 - (capped OW × 12 months)
                        const roughAWCeiling = Math.max(0, 102000 - cappedOWEst * 12)
                        const awEst = Math.min(prev.bonusAmt, roughAWCeiling)
                        const empCpfAWEst = Math.floor(awEst * prev.rates.employee_rate / 100)
                        const erCpfAWEst = Math.round(awEst * prev.rates.employer_rate / 100)
                        const totalEmpCpf = empCpfOWEst + empCpfAWEst
                        const totalErCpf = erCpfOWEst + erCpfAWEst
                        return (
                          <>
                            {sal > 8000 && <div className="flex justify-between text-amber-600"><span className="italic">OW capped at $8,000</span><span>{formatSGD(cappedOWEst)}</span></div>}
                            <div className="flex justify-between text-blue-600">
                              <span>Employee CPF ({prev.rates.employee_rate}%){prev.bonusAmt > 0 ? ' OW + AW' : ''}</span>
                              <span>- {formatSGD(totalEmpCpf)}</span>
                            </div>
                            <div className="flex justify-between font-semibold border-t border-gray-200 pt-1.5">
                              <span>Est. Net Pay</span>
                              <span>{formatSGD(sal + prev.bonusAmt - totalEmpCpf)}</span>
                            </div>
                            <div className="flex justify-between text-red-600 text-xs pt-0.5">
                              <span>Employer CPF ({prev.rates.employer_rate}%){prev.bonusAmt > 0 ? ' OW + AW' : ''}</span>
                              <span>+ {formatSGD(totalErCpf)}</span>
                            </div>
                            {prev.bonusAmt > 0 && awEst < prev.bonusAmt && (
                              <div className="text-xs text-amber-600 mt-1 italic">
                                Bonus CPF capped — AW ceiling estimated at {formatSGD(roughAWCeiling)}. Exact amount calculated at generation.
                              </div>
                            )}
                            {payslipForm.month === 12 && <div className="text-xs text-amber-600 mt-1 italic">December: system will check for year-end CPF AW adjustment at generation.</div>}
                          </>
                        )
                      })()}
                      {!prev.isCpf && (
                        <div className="flex justify-between font-semibold border-t border-gray-200 pt-1.5"><span>Net Pay</span><span>{formatSGD((prev.basicSalary || 0) + prev.bonusAmt)}</span></div>
                      )}
                    </div>
                  )}
                  {prev.isPartTime && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
                      Payslip will be calculated from completed roster shifts for the selected month. Only shifts with status Completed are included.
                    </div>
                  )}
                </div>
              )
            })()}
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
                {ps.cpf_adjustment_note && (
                  <div className="flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-2 text-xs text-amber-700">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">Year-End CPF Adjustment</p>
                      <p className="mt-0.5">{ps.cpf_adjustment_note}</p>
                    </div>
                  </div>
                )}
                {ps.deduction_amount > 0 && editingDeduction?.id !== ps.id && (
                  <div className="flex items-start gap-1.5 bg-red-50 border border-red-200 rounded-lg p-2 mt-2 text-xs text-red-700">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium">Deduction: -{formatSGD(ps.deduction_amount)}</p>
                      {ps.deduction_reason && <p className="mt-0.5">{ps.deduction_reason}</p>}
                    </div>
                  </div>
                )}
                {/* Inline deduction editor — draft only, Biz Ops only */}
                {ps.status === 'draft' && isBizOpsRole && (
                  editingDeduction?.id === ps.id ? (
                    <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
                      <p className="text-xs font-medium text-gray-700">Edit Deduction</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="label text-xs">Amount (SGD)</label>
                          <input className="input" type="number" min="0" step="0.01"
                            value={editingDeduction?.amount ?? ''}
                            onChange={e => setEditingDeduction(d => d ? {...d, amount: e.target.value} : null)} />
                        </div>
                        <div>
                          <label className="label text-xs">Reason</label>
                          <input className="input" type="text" placeholder="e.g. Cash advance recovery"
                            value={editingDeduction?.reason ?? ''}
                            onChange={e => setEditingDeduction(d => d ? {...d, reason: e.target.value} : null)} />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={handleSaveDeduction} disabled={saving}
                          className="btn-primary text-xs py-1.5 flex-1">{saving ? 'Saving...' : 'Save'}</button>
                        <button onClick={() => setEditingDeduction(null)}
                          className="btn-secondary text-xs py-1.5">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setEditingDeduction({ id: ps.id, type: 'payslip', amount: (ps.deduction_amount || 0).toString(), reason: ps.deduction_reason || '' })}
                      className="mt-2 text-xs text-gray-400 hover:text-gray-600 underline">
                      {ps.deduction_amount > 0 ? 'Edit deduction' : '+ Add deduction'}
                    </button>
                  )
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', ps.status === 'paid' ? 'bg-green-100 text-green-700' : ps.status === 'approved' ? 'bg-blue-100 text-blue-700' : 'badge-pending')}>{ps.status.charAt(0).toUpperCase() + ps.status.slice(1)}</span>
                  {ps.low_income_flag && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Low Income — No CPF</span>}
                  {ps.status === 'draft' && <button onClick={() => handlePayslipAction(ps.id, 'approved')} className="text-xs text-blue-600 hover:underline">Approve</button>}
                  {ps.status === 'draft' && <button onClick={() => handleDeletePayslip(ps.id)} className="text-xs text-red-500 hover:underline">Delete</button>}
                  {ps.status === 'approved' && <button onClick={() => handlePayslipAction(ps.id, 'paid')} className="text-xs text-green-600 hover:underline">Mark Paid</button>}
                  {ps.status === 'approved' && isBizOpsRole && (
                    <button onClick={() => { setDeleteModal({ payslip: ps }); setDeleteReason('') }} className="text-xs text-red-500 hover:underline">Delete</button>
                  )}
                  {ps.status !== 'draft' && <button onClick={() => downloadPayslipPdf(ps)} className="text-xs text-red-600 hover:underline flex items-center gap-1"><FileText className="w-3 h-3" /> PDF</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>

    {/* Admin delete modal */}
      {deleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setDeleteModal(null)}>
          <div className="fixed inset-0 bg-black/30" />
          <div className="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 text-sm mb-1">Delete Payslip</h3>
            <p className="text-xs text-gray-500 mb-4">
              Deleting {getMonthName(deleteModal.payslip.month)} {deleteModal.payslip.year} approved payslip
              for {staff?.full_name}. Salary has not been paid — this action is logged to the audit trail.
            </p>
            <div className="mb-4">
              <label className="label">Reason for deletion *</label>
              <textarea
                className="input min-h-[80px] resize-none"
                placeholder="e.g. Wrong salary used — regenerating with corrected amount after payroll adjustment"
                value={deleteReason}
                onChange={e => setDeleteReason(e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">{deleteReason.trim().length}/10 characters minimum</p>
            </div>
            <StatusBanner error={error} />
            <div className="flex gap-2 mt-4">
              <button onClick={() => setDeleteModal(null)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={handleAdminDeletePayslip}
                disabled={deleting || deleteReason.trim().length < 10}
                className="btn-primary flex-1 bg-red-600 hover:bg-red-700 border-red-600 disabled:opacity-50">
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
