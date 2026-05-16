import { createAdminClient, createSupabaseServerClient } from '@/lib/supabase-server'
import { NextResponse, NextRequest } from 'next/server'
import {
  loadCpfBrackets, getCpfBracketRates, getCpfCeilings,
  computeCpfAmounts, loadYtdOW
} from '@/lib/cpf'
import { nowSGT } from '@/lib/utils'

// ── POST /api/generate-commission-payslips ────────────────────
// Generates commission payslips from commission_items.
// Called from payroll/commission/page.tsx.
//
// Sweeps ALL unpaid commission_items up to the selected period
// so late-confirmed items from prior months are included.
//
// Also handles:
//   action = 'approve'   → approve a commission payslip
//   action = 'mark_paid' → mark paid + stamp commission_items.payslip_id
//   action = 'delete'    → delete draft (commission_items cleared by ON DELETE SET NULL)
//
// Security:
//   - business_ops only
//   - adminClient for all writes

export async function POST(request: NextRequest) {
  try {
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

    // ── Approve ───────────────────────────────────────────────
    if (action === 'approve') {
      const { payslipId } = body
      if (!payslipId) return NextResponse.json({ error: 'payslipId required' }, { status: 400 })
      await adminClient.from('payslips').update({
        status: 'approved', approved_by: authUser.id, approved_at: new Date().toISOString(),
      }).eq('id', payslipId).eq('status', 'draft')
      return NextResponse.json({ success: true })
    }

    // ── Mark paid — stamps commission_items.payslip_id ────────
    if (action === 'mark_paid') {
      const { payslipId } = body
      if (!payslipId) return NextResponse.json({ error: 'payslipId required' }, { status: 400 })

      const { data: slip } = await adminClient.from('payslips')
        .select('user_id, commission_period_month, commission_period_year, period_month, period_year')
        .eq('id', payslipId).maybeSingle()
      if (!slip) return NextResponse.json({ error: 'Payslip not found' }, { status: 404 })

      // Mark payslip paid
      const { error: updateErr } = await adminClient.from('payslips').update({
        status: 'paid', paid_at: new Date().toISOString(),
      }).eq('id', payslipId).eq('status', 'approved')
      if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

      // Stamp payslip_id on all unpaid commission_items up to this period
      const commYear = slip.commission_period_year || slip.period_year
      const commMonth = slip.commission_period_month || slip.period_month
      await adminClient.from('commission_items')
        .update({ payslip_id: payslipId })
        .eq('user_id', slip.user_id)
        .is('payslip_id', null)
        .or(`period_year.lt.${commYear},and(period_year.eq.${commYear},period_month.lte.${commMonth})`)

      return NextResponse.json({ success: true })
    }

    // ── Delete draft ──────────────────────────────────────────
    if (action === 'delete') {
      const { payslipId } = body
      if (!payslipId) return NextResponse.json({ error: 'payslipId required' }, { status: 400 })
      // commission_items.payslip_id cleared by ON DELETE SET NULL automatically
      await adminClient.from('payslips').delete().eq('id', payslipId).eq('status', 'draft')
      return NextResponse.json({ success: true })
    }

    // ── Generate ──────────────────────────────────────────────
    const { period_month, period_year, user_ids = [] } = body
    if (!period_month || !period_year) {
      return NextResponse.json({ error: 'period_month and period_year required' }, { status: 400 })
    }

    // Load CPF config
    const brackets = await loadCpfBrackets(adminClient)
    const { owCeiling, annualAWCeiling } = getCpfCeilings(brackets, period_year)

    // Load staff — filter to specified user_ids or all
    let staffQ = adminClient.from('users')
      .select('*, staff_payroll(is_cpf_liable), trainer_gyms(gym_id)')
      .eq('is_archived', false).neq('role', 'admin')
    if (user_ids.length > 0) staffQ = staffQ.in('id', user_ids)
    const { data: staffList } = await staffQ
    if (!staffList?.length) return NextResponse.json({ success: true, generated: 0 })

    const allUserIds = staffList.map((s: any) => s.id)

    // Load all unpaid commission_items up to selected period — one batch query
    const { data: allItems } = await adminClient.from('commission_items')
      .select('id, user_id, gym_id, source_type, amount, period_month, period_year')
      .in('user_id', allUserIds)
      .is('payslip_id', null)
      .or(`period_year.lt.${period_year},and(period_year.eq.${period_year},period_month.lte.${period_month})`)

    // Group items by user_id + gym_id
    const itemsByUserGym: Record<string, any[]> = {}
    ;(allItems || []).forEach((item: any) => {
      const key = `${item.user_id}:${item.gym_id || 'null'}`
      if (!itemsByUserGym[key]) itemsByUserGym[key] = []
      itemsByUserGym[key].push(item)
    })

    // Check for existing payslips for this period
    const { data: existing } = await adminClient.from('payslips')
      .select('user_id, gym_id, status, user:users(full_name)')
      .in('user_id', allUserIds)
      .eq('period_month', period_month).eq('period_year', period_year)
      .eq('payment_type', 'commission')
    const existingMap = new Set<string>()
    const existingDraftNames: string[] = []
    ;(existing || []).forEach((s: any) => {
      const key = `${s.user_id}:${s.gym_id || 'null'}`
      existingMap.add(key)
      if (s.status === 'draft') existingDraftNames.push(s.user?.full_name || s.user_id)
    })

    const toInsert: any[] = []
    const lateItems: any[] = []

    for (const member of staffList) {
      const gymKeys = new Set<string>()
      // Collect gym_ids from their commission items
      Object.keys(itemsByUserGym).forEach(key => {
        if (key.startsWith(member.id + ':')) gymKeys.add(key.split(':')[1])
      })
      if (gymKeys.size === 0) continue

      for (const gymKey of Array.from(gymKeys)) {
        const key = `${member.id}:${gymKey}`
        if (existingMap.has(key)) continue

        const items = itemsByUserGym[key] || []
        if (items.length === 0) continue

        const total = items.reduce((s: number, i: any) => s + (i.amount || 0), 0)
        if (total === 0) continue

        // Identify late items (from prior periods)
        items.filter((i: any) => !(i.period_month === period_month && i.period_year === period_year))
          .forEach((i: any) => lateItems.push({ ...i, staff_name: member.full_name }))

        const actualGymId = gymKey === 'null' ? null : gymKey
        const isCpf = member.staff_payroll?.is_cpf_liable ?? false
        const rates = getCpfBracketRates(brackets, member.date_of_birth, period_year, period_month)

        // YTD for CPF
        const { ytdOW: ytdOWBefore, ytdAW: ytdAWBefore, allLowIncome } = await loadYtdOW(
          adminClient, member.id, period_year, period_month
        )

        const cpf = computeCpfAmounts({
          salaryAmount: 0, commissionAmount: total, allowanceAmount: 0,
          bonusAW: 0, othersAmount: 0, othersCpfLiable: false, deductionAmount: 0,
          isCpf, rates, owCeiling, annualAWCeiling,
          ytdOWBefore, ytdAWBefore, allLowIncome,
          periodMonth: period_month, periodYear: period_year,
        })

        toInsert.push({
          user_id: member.id, gym_id: actualGymId,
          period_month, period_year,
          payment_type: 'commission',
          commission_period_month: period_month,
          commission_period_year: period_year,
          salary_amount: 0, commission_amount: total,
          allowance_amount: 0, bonus_amount: 0, others_amount: 0,
          is_cpf_liable: isCpf,
          employee_cpf_rate: rates.employee_rate,
          employer_cpf_rate: rates.employer_rate,
          employee_cpf_amount: cpf.employeeCpf,
          employer_cpf_amount: cpf.employerCpf,
          gross_salary: cpf.grossSalary, net_salary: cpf.netSalary,
          total_employer_cost: cpf.totalEmployerCost,
          capped_ow: cpf.cappedOW, aw_subject_to_cpf: cpf.awSubject,
          ow_ceiling_used: owCeiling, annual_aw_ceiling_used: annualAWCeiling,
          ytd_ow_before: ytdOWBefore, ytd_aw_before: ytdAWBefore,
          low_income_flag: cpf.lowIncomeFlag,
          cpf_adjustment_note: cpf.decemberAdjNote || null,
          deduction_amount: 0, status: 'draft',
          generated_by: authUser.id, generated_at: new Date().toISOString(),
        })
      }
    }

    if (toInsert.length > 0) {
      const { error: insertErr } = await adminClient.from('payslips').insert(toInsert)
      if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      generated: toInsert.length,
      existingDrafts: existingDraftNames,
      lateItemCount: lateItems.length,
      lateItems: lateItems.map(i => ({
        staff_name: i.staff_name,
        period: `${i.period_month}/${i.period_year}`,
        amount: i.amount,
      })),
    })
  } catch (err: any) {
    console.error('generate-commission-payslips error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
