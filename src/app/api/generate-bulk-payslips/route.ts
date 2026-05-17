import { createAdminClient, createSupabaseServerClient } from '@/lib/supabase-server'
import { rateLimit } from '@/lib/rate-limit'
import { validateAndLoadCurrentUser } from '@/lib/api-auth'
import { NextResponse, NextRequest } from 'next/server'
import {
  loadCpfBrackets, getCpfBracketRates, getCpfCeilings,
  computeCpfAmounts
} from '@/lib/cpf'
import { nowSGT } from '@/lib/utils'

// ── POST /api/generate-bulk-payslips ─────────────────────────
// Generates salary payslips in bulk for all eligible staff.
// Called from payroll/page.tsx.
//
// Also handles:
//   action = 'delete_drafts' → delete all draft payslips for a period
//   action = 'approve'       → approve a single payslip
//   action = 'mark_paid'     → mark a single payslip paid
//   action = 'delete_one'    → delete one draft payslip (clear roster + deductions)
//
// Security:
//   - business_ops only
//   - adminClient for all writes

export async function POST(request: NextRequest) {
  try {
  // Rate limiting — expensive bulk generation
  const { limited } = rateLimit(request, { limit: 10, windowMs: 3600000, keyPrefix: 'gen-bulk' })
  if (limited) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const serverClient = await createSupabaseServerClient()
    const { data: { user: authUser } } = await serverClient.auth.getUser()
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: currentUser } = await serverClient
      .from('users').select('role').eq('id', authUser.id).maybeSingle()
    if (!currentUser || currentUser.role !== 'business_ops') {
      return NextResponse.json({ error: 'Forbidden — business_ops only' }, { status: 403 })
    }

    const body = await request.json()
    const { action = 'generate' } = body
    const adminClient = createAdminClient()

    // ── Simple payslip status actions ─────────────────────────
    if (action === 'approve') {
      const { payslipId } = body
      if (!payslipId) return NextResponse.json({ error: 'payslipId required' }, { status: 400 })
      await adminClient.from('payslips').update({
        status: 'approved', approved_by: authUser.id, approved_at: new Date().toISOString(),
      }).eq('id', payslipId).eq('status', 'draft')
      return NextResponse.json({ success: true })
    }

    if (action === 'mark_paid') {
      const { payslipId } = body
      if (!payslipId) return NextResponse.json({ error: 'payslipId required' }, { status: 400 })
      await adminClient.from('payslips').update({
        status: 'paid', paid_at: new Date().toISOString(),
      }).eq('id', payslipId).eq('status', 'approved')
      return NextResponse.json({ success: true })
    }

    if (action === 'delete_one') {
      const { payslipId } = body
      if (!payslipId) return NextResponse.json({ error: 'payslipId required' }, { status: 400 })
      await adminClient.from('duty_roster').update({ payslip_id: null }).eq('payslip_id', payslipId)
      await adminClient.from('pending_deductions')
        .update({ applied_at: null, applied_payslip_id: null }).eq('applied_payslip_id', payslipId)
      await adminClient.from('payslips').delete().eq('id', payslipId).eq('status', 'draft')
      return NextResponse.json({ success: true })
    }

    if (action === 'delete_drafts') {
      const { period_month, period_year } = body
      if (!period_month || !period_year) {
        return NextResponse.json({ error: 'period_month and period_year required' }, { status: 400 })
      }
      // Get draft IDs first for cleanup
      const { data: drafts } = await adminClient.from('payslips')
        .select('id').eq('period_month', period_month).eq('period_year', period_year)
        .eq('status', 'draft')
      const draftIds = (drafts || []).map((d: any) => d.id)
      if (draftIds.length > 0) {
        await adminClient.from('duty_roster').update({ payslip_id: null }).in('payslip_id', draftIds)
        await adminClient.from('pending_deductions')
          .update({ applied_at: null, applied_payslip_id: null }).in('applied_payslip_id', draftIds)
        await adminClient.from('payslips')
          .delete().eq('period_month', period_month).eq('period_year', period_year).eq('status', 'draft')
      }
      return NextResponse.json({ success: true, deleted: draftIds.length })
    }

    // ── Generate ──────────────────────────────────────────────
    const { period_month: bulkMonth, period_year: bulkYear } = body
    if (!bulkMonth || !bulkYear) {
      return NextResponse.json({ error: 'period_month and period_year required' }, { status: 400 })
    }

    const now = nowSGT()
    if (bulkYear > now.getUTCFullYear() ||
      (bulkYear === now.getUTCFullYear() && bulkMonth > now.getUTCMonth() + 1)) {
      return NextResponse.json({ error: 'Cannot generate payslips for a future month' }, { status: 400 })
    }

    // Check combined payslip mode
    const { data: appSettings } = await adminClient
      .from('app_settings').select('combined_payslip_enabled').eq('id', 'global').maybeSingle()
    const combinedMode = !!(appSettings as any)?.combined_payslip_enabled

    // Load CPF config once for all staff
    const brackets = await loadCpfBrackets(adminClient)
    const { owCeiling, annualAWCeiling } = getCpfCeilings(brackets, bulkYear)

    // Load all active non-admin staff with payroll profiles
    const { data: staffList } = await adminClient.from('users')
      .select('*, staff_payroll(*), trainer_gyms(gym_id)')
      .eq('is_archived', false).neq('role', 'admin')
      .order('employment_type').order('full_name')
    if (!staffList?.length) return NextResponse.json({ generated: 0, skipped: 0, noSalary: [] })

    // Block if any draft/approved/paid exists for this period
    const { data: existingSlips } = await adminClient.from('payslips')
      .select('user_id, gym_id, status, user:users(full_name)')
      .eq('period_month', bulkMonth).eq('period_year', bulkYear)
      .eq('payment_type', 'salary')
    const existingApproved = new Set<string>()
    const existingDraftNames: string[] = []
    ;(existingSlips || []).forEach((s: any) => {
      const key = `${s.user_id}:${s.gym_id || 'null'}`
      existingApproved.add(key)
      if (s.status === 'draft') existingDraftNames.push(s.user?.full_name || s.user_id)
    })

    // Load roster, bonuses, deductions in batch
    const monthStart = `${bulkYear}-${String(bulkMonth).padStart(2, '0')}-01`
    const monthEnd = new Date(bulkYear, bulkMonth, 0).toISOString().split('T')[0]
    const allUserIds = staffList.map((m: any) => m.id)

    const [rosterRes, bonusRes, deductionRes, ytdRes] = await Promise.all([
      adminClient.from('duty_roster').select('user_id, gym_id, hours_worked, gross_pay, id')
        .in('user_id', allUserIds).gte('shift_date', monthStart).lte('shift_date', monthEnd)
        .eq('status', 'completed').is('payslip_id', null),
      adminClient.from('staff_bonuses').select('user_id, amount')
        .in('user_id', allUserIds).eq('month', bulkMonth).eq('year', bulkYear),
      adminClient.from('pending_deductions').select('user_id, gym_id, amount, reason, id')
        .in('user_id', allUserIds).is('applied_at', null),
      adminClient.from('payslips')
        .select('user_id, salary_amount, commission_amount, allowance_amount, others_amount, others_cpf_liable, aw_subject_to_cpf, period_month')
        .in('user_id', allUserIds).eq('period_year', bulkYear)
        .in('status', ['approved', 'paid']).neq('period_month', bulkMonth),
    ])

    // Build lookup maps
    const rosterByUserGym: Record<string, Record<string, { hours: number; pay: number; shiftIds: string[] }>> = {}
    rosterRes.data?.forEach((r: any) => {
      if (!rosterByUserGym[r.user_id]) rosterByUserGym[r.user_id] = {}
      const gk = r.gym_id || 'null'
      if (!rosterByUserGym[r.user_id][gk]) rosterByUserGym[r.user_id][gk] = { hours: 0, pay: 0, shiftIds: [] }
      rosterByUserGym[r.user_id][gk].hours += r.hours_worked || 0
      rosterByUserGym[r.user_id][gk].pay += r.gross_pay || 0
      rosterByUserGym[r.user_id][gk].shiftIds.push(r.id)
    })
    const bonusByUser: Record<string, number> = {}
    bonusRes.data?.forEach((b: any) => { bonusByUser[b.user_id] = (bonusByUser[b.user_id] || 0) + (b.amount || 0) })
    const deductionByUserGym: Record<string, { amount: number; reason: string; ids: string[] }> = {}
    deductionRes.data?.forEach((d: any) => {
      const k = `${d.user_id}:${d.gym_id || 'null'}`
      if (!deductionByUserGym[k]) deductionByUserGym[k] = { amount: 0, reason: '', ids: [] }
      deductionByUserGym[k].amount += d.amount || 0
      deductionByUserGym[k].reason = d.reason
      deductionByUserGym[k].ids.push(d.id)
    })
    // YTD by user_id
    const ytdByUser: Record<string, { ytdOW: number; ytdAW: number }> = {}
    ytdRes.data?.forEach((p: any) => {
      if (!ytdByUser[p.user_id]) ytdByUser[p.user_id] = { ytdOW: 0, ytdAW: 0 }
      const ow = (p.salary_amount || 0) + (p.commission_amount || 0) +
        (p.allowance_amount || 0) + (p.others_cpf_liable ? (p.others_amount || 0) : 0)
      ytdByUser[p.user_id].ytdOW += ow
      ytdByUser[p.user_id].ytdAW += p.aw_subject_to_cpf || 0
    })

    const toInsert: any[] = []
    const rosterStamps: Array<{ payslipIdx: number; shiftIds: string[] }> = []
    const deductionStamps: Array<{ payslipIdx: number; ids: string[] }> = []
    const appliedDeductionIds: string[] = []
    let generated = 0, skipped = 0
    const noSalaryNames: string[] = []

    for (const member of staffList) {
      const isPartTime = member.employment_type === 'part_time'
      const rates = getCpfBracketRates(brackets, member.date_of_birth, bulkYear, bulkMonth)
      const isCpf = member.staff_payroll?.is_cpf_liable ?? !isPartTime
      const ytd = ytdByUser[member.id] || { ytdOW: 0, ytdAW: 0 }
      const allowanceAmount = isPartTime ? 0 : (member.staff_payroll?.monthly_allowance || 0)
      const othersAmount = isPartTime ? 0 : (member.staff_payroll?.others_monthly_amount || 0)
      const othersCpfLiable = member.staff_payroll?.others_cpf_liable ?? false

      if (isPartTime) {
        const gymMap = rosterByUserGym[member.id] || {}
        for (const [gymKey, roster] of Object.entries(gymMap)) {
          if (roster.pay === 0) continue
          const existKey = `${member.id}:${gymKey}`
          if (existingApproved.has(existKey)) { skipped++; continue }
          const actualGymId = gymKey === 'null' ? null : gymKey
          const deductKey = `${member.id}:${gymKey}`
          const deduction = deductionByUserGym[deductKey]
          const deductionAmount = deduction?.amount || 0
          const cpf = computeCpfAmounts({
            salaryAmount: roster.pay, commissionAmount: 0, allowanceAmount: 0,
            bonusAW: 0, othersAmount: 0, othersCpfLiable: false, deductionAmount,
            isCpf, rates, owCeiling, annualAWCeiling,
            ytdOWBefore: ytd.ytdOW, ytdAWBefore: ytd.ytdAW, allLowIncome: false,
            periodMonth: bulkMonth, periodYear: bulkYear,
          })
          const idx = toInsert.length
          toInsert.push({
            user_id: member.id, period_month: bulkMonth, period_year: bulkYear,
            payment_type: combinedMode ? 'combined' : 'salary', gym_id: actualGymId, employment_type: 'part_time',
            salary_amount: roster.pay, commission_amount: 0, allowance_amount: 0,
            bonus_amount: 0, others_amount: 0, others_cpf_liable: false,
            total_hours: roster.hours, hourly_rate_used: member.hourly_rate || 0,
            is_cpf_liable: isCpf,
            employee_cpf_rate: isCpf ? rates.employee_rate : 0,
            employer_cpf_rate: isCpf ? rates.employer_rate : 0,
            employee_cpf_amount: cpf.employeeCpf, employer_cpf_amount: cpf.employerCpf,
            gross_salary: cpf.grossSalary, net_salary: cpf.netSalary,
            total_employer_cost: cpf.totalEmployerCost,
            capped_ow: cpf.cappedOW, aw_subject_to_cpf: cpf.awSubject,
            ow_ceiling_used: owCeiling, annual_aw_ceiling_used: annualAWCeiling,
            ytd_ow_before: ytd.ytdOW, ytd_aw_before: ytd.ytdAW,
            low_income_flag: cpf.lowIncomeFlag, cpf_adjustment_note: cpf.decemberAdjNote || null,
            deduction_amount: deductionAmount, deduction_reason: deduction?.reason || null,
            status: 'draft', generated_by: authUser.id, generated_at: new Date().toISOString(),
          })
          if (roster.shiftIds.length > 0) rosterStamps.push({ payslipIdx: idx, shiftIds: roster.shiftIds })
          if (deduction?.ids.length) {
            deductionStamps.push({ payslipIdx: idx, ids: deduction.ids })
            deduction.ids.forEach(id => appliedDeductionIds.push(id))
          }
          generated++
        }
      } else {
        const gymId = member.trainer_gyms?.[0]?.gym_id || member.manager_gym_id || null
        const existKey = `${member.id}:${gymId || 'null'}`
        if (existingApproved.has(existKey)) { skipped++; continue }
        const basicSalary = member.staff_payroll?.current_salary || 0
        if (basicSalary === 0) { noSalaryNames.push(member.full_name); skipped++; continue }
        const bonusAmt = bonusByUser[member.id] || 0
        const deductKey = `${member.id}:${gymId || 'null'}`
        const deduction = deductionByUserGym[deductKey]
        const deductionAmount = deduction?.amount || 0
        const cpf = computeCpfAmounts({
          salaryAmount: basicSalary, commissionAmount: 0,
          allowanceAmount, bonusAW: bonusAmt, othersAmount, othersCpfLiable, deductionAmount,
          isCpf, rates, owCeiling, annualAWCeiling,
          ytdOWBefore: ytd.ytdOW, ytdAWBefore: ytd.ytdAW, allLowIncome: false,
          periodMonth: bulkMonth, periodYear: bulkYear,
        })
        const idx = toInsert.length
        toInsert.push({
          user_id: member.id, period_month: bulkMonth, period_year: bulkYear,
          payment_type: combinedMode ? 'combined' : 'salary', gym_id: gymId,
          employment_type: member.employment_type || 'full_time',
          salary_amount: basicSalary, commission_amount: 0,
          allowance_amount: allowanceAmount, bonus_amount: bonusAmt,
          others_amount: othersAmount,
          others_label: member.staff_payroll?.others_label || null,
          others_cpf_liable: othersCpfLiable,
          total_hours: null, hourly_rate_used: null,
          is_cpf_liable: isCpf,
          employee_cpf_rate: isCpf ? rates.employee_rate : 0,
          employer_cpf_rate: isCpf ? rates.employer_rate : 0,
          employee_cpf_amount: cpf.employeeCpf, employer_cpf_amount: cpf.employerCpf,
          gross_salary: cpf.grossSalary, net_salary: cpf.netSalary,
          total_employer_cost: cpf.totalEmployerCost,
          capped_ow: cpf.cappedOW, aw_subject_to_cpf: cpf.awSubject,
          ow_ceiling_used: owCeiling, annual_aw_ceiling_used: annualAWCeiling,
          ytd_ow_before: ytd.ytdOW, ytd_aw_before: ytd.ytdAW,
          low_income_flag: cpf.lowIncomeFlag, cpf_adjustment_note: cpf.decemberAdjNote || null,
          deduction_amount: deductionAmount, deduction_reason: deduction?.reason || null,
          status: 'draft', generated_by: authUser.id, generated_at: new Date().toISOString(),
        })
        if (deduction?.ids.length) {
          deductionStamps.push({ payslipIdx: idx, ids: deduction.ids })
          deduction.ids.forEach(id => appliedDeductionIds.push(id))
        }
        generated++
      }
    }

    if (toInsert.length > 0) {
      const { data: inserted, error: insertErr } = await adminClient
        .from('payslips').insert(toInsert).select('id, user_id, gym_id')
      if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

      // Stamp payslip_id on roster shifts
      if (inserted) {
        for (let i = 0; i < inserted.length; i++) {
          const ps = inserted[i]
          const stamp = rosterStamps.find(s => s.payslipIdx === i)
          if (stamp?.shiftIds.length) {
            await adminClient.from('duty_roster')
              .update({ payslip_id: ps.id }).in('id', stamp.shiftIds)
          }
        }
      }

      // Stamp applied_payslip_id on pending deductions
      if (inserted) {
        for (let i = 0; i < inserted.length; i++) {
          const ps = inserted[i]
          const stamp = deductionStamps.find(s => s.payslipIdx === i)
          if (stamp?.ids.length) {
            await adminClient.from('pending_deductions')
              .update({ applied_at: new Date().toISOString(), applied_payslip_id: ps.id })
              .in('id', stamp.ids)
          }
        }
      }
    }

    return NextResponse.json({
      success: true, generated, skipped,
      noSalary: noSalaryNames,
      existingDrafts: existingDraftNames,
    })
  } catch (err: any) {
    console.error('generate-bulk-payslips error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
