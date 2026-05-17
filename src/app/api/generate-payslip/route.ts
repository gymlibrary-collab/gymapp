import { createAdminClient, createSupabaseServerClient } from '@/lib/supabase-server'
import { rateLimit } from '@/lib/rate-limit'
import { validateAndLoadCurrentUser } from '@/lib/api-auth'
import { NextResponse, NextRequest } from 'next/server'
import {
  loadCpfBrackets, getCpfBracketRates, getCpfCeilings,
  computeCpfAmounts, loadYtdOW
} from '@/lib/cpf'
import { nowSGT, todaySGT } from '@/lib/utils'

// ── POST /api/generate-payslip ────────────────────────────────
// Generates an individual salary payslip for one staff member.
// Called from hr/[id]/payroll/page.tsx.
//
// Atomic operations:
//   1. Block if draft/approved/paid payslip exists for period
//   2. Delete existing draft (if re-generating a clean draft)
//   3. INSERT payslips (with full CPF amounts computed server-side)
//   4. UPDATE duty_roster — stamp payslip_id (part-timers)
//   5. UPDATE pending_deductions — stamp applied_payslip_id
//
// Also handles:
//   action = 'delete'      → delete draft payslip, clear roster + deductions
//   action = 'approve'     → set status = approved
//   action = 'mark_paid'   → set status = paid
//   action = 'admin_delete'→ delete approved/paid with reason (audit trail)
//
// Security:
//   - business_ops only for generate/delete/approve/mark_paid
//   - admin only for admin_delete
//   - adminClient writes for all sensitive tables

export async function POST(request: NextRequest) {
  try {
  // Rate limiting — individual payslip generation
  const { limited } = rateLimit(request, { limit: 30, windowMs: 3600000, keyPrefix: 'gen-slip' })
  if (limited) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const serverClient = await createSupabaseServerClient()
    const { data: { user: authUser } } = await serverClient.auth.getUser()
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: currentUser } = await serverClient
      .from('users').select('role').eq('id', authUser.id).maybeSingle()
    if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { action = 'generate', userId, payslipId } = body

    const adminClient = createAdminClient()

    // ── Admin delete (with audit) ─────────────────────────────
    if (action === 'admin_delete') {
      if (currentUser.role !== 'admin') {
        return NextResponse.json({ error: 'Admin only' }, { status: 403 })
      }
      const { reason } = body
      if (!reason) return NextResponse.json({ error: 'Reason required for admin delete' }, { status: 400 })

      const { data: slip } = await adminClient.from('payslips')
        .select('*, user:users(full_name)').eq('id', payslipId).maybeSingle()
      if (!slip) return NextResponse.json({ error: 'Payslip not found' }, { status: 404 })

      // Insert audit record
      await adminClient.from('payslip_deletions').insert({
        payslip_id: payslipId, user_id: slip.user_id, gym_id: slip.gym_id,
        staff_name: slip.user?.full_name, period_month: slip.period_month,
        period_year: slip.period_year, status_at_deletion: slip.status,
        net_salary: slip.net_salary, reason, deleted_by: authUser.id,
        deleted_at: new Date().toISOString(),
      })
      // Clear roster + deductions before delete
      await adminClient.from('duty_roster').update({ payslip_id: null }).eq('payslip_id', payslipId)
      await adminClient.from('pending_deductions')
        .update({ applied_at: null, applied_payslip_id: null }).eq('applied_payslip_id', payslipId)
      await adminClient.from('payslips').delete().eq('id', payslipId)
      return NextResponse.json({ success: true })
    }

    // All other actions: business_ops only
    if (!['business_ops'].includes(currentUser.role)) {
      return NextResponse.json({ error: 'Forbidden — business_ops only' }, { status: 403 })
    }

    // ── Delete draft ──────────────────────────────────────────
    if (action === 'delete') {
      if (!payslipId) return NextResponse.json({ error: 'payslipId required' }, { status: 400 })
      await adminClient.from('duty_roster').update({ payslip_id: null }).eq('payslip_id', payslipId)
      await adminClient.from('pending_deductions')
        .update({ applied_at: null, applied_payslip_id: null }).eq('applied_payslip_id', payslipId)
      await adminClient.from('payslips').delete().eq('id', payslipId).eq('status', 'draft')
      return NextResponse.json({ success: true })
    }

    // ── Approve ───────────────────────────────────────────────
    if (action === 'approve') {
      if (!payslipId) return NextResponse.json({ error: 'payslipId required' }, { status: 400 })
      await adminClient.from('payslips').update({
        status: 'approved', approved_by: authUser.id, approved_at: new Date().toISOString(),
      }).eq('id', payslipId).eq('status', 'draft')
      return NextResponse.json({ success: true })
    }

    // ── Mark paid ─────────────────────────────────────────────
    if (action === 'mark_paid') {
      if (!payslipId) return NextResponse.json({ error: 'payslipId required' }, { status: 400 })
      await adminClient.from('payslips').update({
        status: 'paid', paid_at: new Date().toISOString(),
      }).eq('id', payslipId).eq('status', 'approved')
      return NextResponse.json({ success: true })
    }

    // ── Generate ──────────────────────────────────────────────
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })
    const { period_month: pMonth, period_year: pYear, notes } = body
    if (!pMonth || !pYear) return NextResponse.json({ error: 'period_month and period_year required' }, { status: 400 })

    // Block future months
    const now = nowSGT()
    if (pYear > now.getUTCFullYear() || (pYear === now.getUTCFullYear() && pMonth > now.getUTCMonth() + 1)) {
      return NextResponse.json({ error: 'Cannot generate a payslip for a future month' }, { status: 400 })
    }

    // Block if approved/paid already exists
    const { data: existing } = await adminClient.from('payslips')
      .select('id, status').eq('user_id', userId)
      .eq('period_month', pMonth).eq('period_year', pYear)
      .eq('payment_type', 'salary')
      .in('status', ['approved', 'paid']).maybeSingle()
    if (existing) {
      return NextResponse.json(
        { error: `A ${existing.status} payslip already exists for this period` },
        { status: 409 }
      )
    }

    // Load staff profile
    const { data: staff } = await adminClient.from('users')
      .select('*, staff_payroll(*), trainer_gyms(gym_id)')
      .eq('id', userId).maybeSingle()
    if (!staff) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })

    const isPartTime = staff.employment_type === 'part_time'
    const gymId = staff.trainer_gyms?.[0]?.gym_id || staff.manager_gym_id || null
    const isCpf = staff.staff_payroll?.is_cpf_liable ?? !isPartTime

    // Load CPF config
    const brackets = await loadCpfBrackets(adminClient)
    const { owCeiling, annualAWCeiling } = getCpfCeilings(brackets, pYear)
    const rates = getCpfBracketRates(brackets, staff.date_of_birth, pYear, pMonth)

    // Part-timer: load unpaid roster shifts
    let totalHours = 0, totalPay = 0, rosterShiftIds: string[] = []
    if (isPartTime) {
      const monthStart = `${pYear}-${String(pMonth).padStart(2, '0')}-01`
      const monthEnd = new Date(pYear, pMonth, 0).toISOString().split('T')[0]
      const { data: roster } = await adminClient.from('duty_roster')
        .select('id, hours_worked, gross_pay')
        .eq('user_id', userId).gte('shift_date', monthStart).lte('shift_date', monthEnd)
        .eq('status', 'completed').is('payslip_id', null)
      totalHours = roster?.reduce((s: number, r: any) => s + (r.hours_worked || 0), 0) || 0
      totalPay = roster?.reduce((s: number, r: any) => s + (r.gross_pay || 0), 0) || 0
      rosterShiftIds = roster?.map((r: any) => r.id) || []
    }

    const salaryAmount = isPartTime ? totalPay : (staff.staff_payroll?.current_salary || 0)

    // Bonus for this month
    const { data: bonusRows } = await adminClient.from('staff_bonuses')
      .select('amount').eq('user_id', userId)
      .eq('month', pMonth).eq('year', pYear)
    const bonusAmt = bonusRows?.reduce((s: number, b: any) => s + (b.amount || 0), 0) || 0

    // Allowance from staff_payroll
    const allowanceAmount = isPartTime ? 0 : (staff.staff_payroll?.monthly_allowance || 0)
    const othersAmount = isPartTime ? 0 : (staff.staff_payroll?.others_monthly_amount || 0)
    const othersCpfLiable = staff.staff_payroll?.others_cpf_liable ?? false

    // Pending deductions
    let deductionAmount = 0, deductionReason: string | null = null, deductionIds: string[] = []
    if (gymId) {
      const { data: deductions } = await adminClient.from('pending_deductions')
        .select('id, amount, reason').eq('user_id', userId)
        .eq('gym_id', gymId).is('applied_at', null)
      deductions?.forEach((d: any) => {
        deductionAmount += d.amount || 0
        deductionReason = d.reason
        deductionIds.push(d.id)
      })
    }

    // YTD for CPF calculation
    const { ytdOW: ytdOWBefore, ytdAW: ytdAWBefore, allLowIncome } = await loadYtdOW(
      adminClient, userId, pYear, pMonth
    )

    // Compute CPF via shared pure function
    const cpf = computeCpfAmounts({
      salaryAmount, commissionAmount: 0, allowanceAmount,
      bonusAW: bonusAmt, othersAmount, othersCpfLiable,
      deductionAmount,
      isCpf, rates, owCeiling, annualAWCeiling,
      ytdOWBefore, ytdAWBefore, allLowIncome,
      periodMonth: pMonth, periodYear: pYear,
    })

    // Delete existing draft before insert
    await adminClient.from('payslips')
      .delete().eq('user_id', userId)
      .eq('period_month', pMonth).eq('period_year', pYear)
      .eq('payment_type', 'salary').eq('status', 'draft')

    // Insert payslip
    const { data: newPs, error: insertErr } = await adminClient.from('payslips').insert({
      user_id: userId, period_month: pMonth, period_year: pYear,
      payment_type: 'salary', gym_id: gymId,
      employment_type: staff.employment_type || 'full_time',
      salary_amount: salaryAmount, commission_amount: 0,
      allowance_amount: allowanceAmount, bonus_amount: bonusAmt,
      others_amount: othersAmount, others_label: staff.staff_payroll?.others_label || null,
      others_cpf_liable: othersCpfLiable,
      total_hours: isPartTime ? totalHours : null,
      hourly_rate_used: isPartTime ? (staff.hourly_rate || 0) : null,
      is_cpf_liable: isCpf,
      employee_cpf_rate: rates.employee_rate, employer_cpf_rate: rates.employer_rate,
      employee_cpf_amount: cpf.employeeCpf, employer_cpf_amount: cpf.employerCpf,
      gross_salary: cpf.grossSalary, net_salary: cpf.netSalary,
      total_employer_cost: cpf.totalEmployerCost,
      capped_ow: cpf.cappedOW, aw_subject_to_cpf: cpf.awSubject,
      ow_ceiling_used: owCeiling, annual_aw_ceiling_used: annualAWCeiling,
      ytd_ow_before: ytdOWBefore, ytd_aw_before: ytdAWBefore,
      low_income_flag: cpf.lowIncomeFlag,
      cpf_adjustment_note: cpf.decemberAdjNote || null,
      deduction_amount: deductionAmount, deduction_reason: deductionReason,
      notes: notes || null, status: 'draft',
      generated_by: authUser.id, generated_at: new Date().toISOString(),
    }).select('id').single()

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

    // Stamp payslip_id on roster shifts
    if (newPs?.id && rosterShiftIds.length > 0) {
      await adminClient.from('duty_roster')
        .update({ payslip_id: newPs.id }).in('id', rosterShiftIds)
    }

    // Stamp applied_payslip_id on pending deductions
    if (newPs?.id && deductionIds.length > 0) {
      await adminClient.from('pending_deductions')
        .update({ applied_at: new Date().toISOString(), applied_payslip_id: newPs.id })
        .in('id', deductionIds)
    }

    return NextResponse.json({ success: true, payslipId: newPs?.id })
  } catch (err: any) {
    console.error('generate-payslip error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
