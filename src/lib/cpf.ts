// ============================================================
// src/lib/cpf.ts — Shared CPF helpers
//
// All CPF calculations for payslip generation go through
// this file. Never duplicate CPF logic in page components.
//
// Key design decisions:
// - Commission is OW (paid monthly, regular)
// - Bonus is AW (paid irregularly, annual)
// - Allowance is OW (fixed monthly, CPF-liable)
// - Others: CPF-liable flag per staff (others_cpf_liable)
// - computeCpfAmounts is a pure function — caller loads YTD
//   data and passes numbers in. This allows bulk payroll to
//   batch-load YTD for all staff upfront (efficient), while
//   individual payslip uses loadYtdOW() helper.
// ============================================================

import { nowSGT } from '@/lib/utils'

// ── CPF Liability from Residency Status ─────────────────────
// Single source of truth for which residency statuses are CPF liable.
// Singapore Citizens and PRs are CPF liable.
// All other pass types are not CPF liable.
export const CPF_LIABLE_STATUSES = ['singapore_citizen', 'singapore_pr'] as const

export function cpfLiableFromResidency(residencyStatus: string | null | undefined): boolean {
  if (!residencyStatus) return false
  return CPF_LIABLE_STATUSES.includes(residencyStatus as any)
}

// ── Residency Status Options ─────────────────────────────────
export const RESIDENCY_STATUS_OPTIONS = [
  { value: 'singapore_citizen',    label: 'Singapore Citizen',      cpfLiable: true  },
  { value: 'singapore_pr',         label: 'Singapore PR',           cpfLiable: true  },
  { value: 'employment_pass',      label: 'Employment Pass (EP)',    cpfLiable: false },
  { value: 's_pass',               label: 'S Pass',                 cpfLiable: false },
  { value: 'work_permit',          label: 'Work Permit (WP)',        cpfLiable: false },
  { value: 'dependants_pass',      label: "Dependant's Pass",       cpfLiable: false },
  { value: 'long_term_visit_pass', label: 'Long-Term Visit Pass',   cpfLiable: false },
  { value: 'other',                label: 'Other',                  cpfLiable: false },
] as const

export function residencyLabel(status: string | null | undefined): string {
  if (!status) return 'Not set'
  return RESIDENCY_STATUS_OPTIONS.find(o => o.value === status)?.label || status
}

// ── getAgeAsOf ───────────────────────────────────────────────
// Returns whole-number age as of a given reference date.
// Reference date uses UTC methods (pass a SGT-adjusted Date).
// Returns null if dob is not provided.
export function getAgeAsOf(dob: string | null, refDate: Date): number | null {
  if (!dob) return null
  const birth = new Date(dob)
  let age = refDate.getUTCFullYear() - birth.getUTCFullYear()
  if (
    refDate.getUTCMonth() < birth.getUTCMonth() ||
    (refDate.getUTCMonth() === birth.getUTCMonth() &&
      refDate.getUTCDate() < birth.getUTCDate())
  ) age--
  return age
}

// ── getCpfBracketRates ───────────────────────────────────────
// Returns the CPF employee and employer rates for a staff member
// based on their date of birth and the payroll month/year.
//
// Rules:
// - Age calculated as of LAST DAY of the payroll month (SGT)
// - Bracket boundary: staff moves to next bracket the day AFTER
//   their birthday at the upper age of the current bracket.
// - effective_from: picks most recent bracket rates valid for
//   the payroll month start date.
// - Returns { employee_rate: 20, employer_rate: 17 } as fallback.
export function getCpfBracketRates(
  brackets: any[],
  dob: string | null,
  payrollYear: number,
  payrollMonth: number
): { employee_rate: number; employer_rate: number } {
  // Last day of payroll month in SGT (local date constructor is fine here
  // since we only need the date boundary, not a timestamp)
  const lastDayOfMonth = new Date(payrollYear, payrollMonth, 0)
  const age = getAgeAsOf(dob, lastDayOfMonth)
  if (age === null) return { employee_rate: 20, employer_rate: 17 }

  // Filter to brackets effective on or before payroll month start
  const payrollDate = new Date(payrollYear, payrollMonth - 1, 1)
  const validBrackets = brackets
    .filter((b: any) => !b.effective_from || new Date(b.effective_from) <= payrollDate)
    .sort((a: any, b: any) =>
      new Date(b.effective_from || 0).getTime() - new Date(a.effective_from || 0).getTime()
    )

  if (dob) {
    const birth = new Date(dob)
    const sorted = [...validBrackets].sort(
      (a: any, b: any) => (a.age_min ?? 0) - (b.age_min ?? 0)
    )
    let bracketIndex = 0
    for (let i = 0; i < sorted.length - 1; i++) {
      const upperAge = sorted[i].age_max
      if (upperAge === null || upperAge === undefined) break
      const birthdayAtUpperAge = new Date(
        birth.getFullYear() + upperAge,
        birth.getMonth(),
        birth.getDate()
      )
      if (lastDayOfMonth > birthdayAtUpperAge) {
        bracketIndex = i + 1
      } else {
        break
      }
    }
    const bracket = sorted[bracketIndex]
    return bracket
      ? { employee_rate: bracket.employee_rate, employer_rate: bracket.employer_rate }
      : { employee_rate: 20, employer_rate: 17 }
  }

  const bracket = validBrackets.find(
    (b: any) => age >= b.age_min && (b.age_max === null || b.age_max === undefined || age <= b.age_max)
  )
  return bracket
    ? { employee_rate: bracket.employee_rate, employer_rate: bracket.employer_rate }
    : { employee_rate: 20, employer_rate: 17 }
}


// ── getCpfPeriods ─────────────────────────────────────────────
// Returns all distinct effective_from periods in the brackets,
// sorted newest first. Used for changeover detection.
export function getCpfPeriods(brackets: any[]): string[] {
  const keys = new Set<string>()
  brackets.forEach((b: any) => {
    const key = b.effective_from ? b.effective_from.split('T')[0] : 'default'
    keys.add(key)
  })
  return Array.from(keys).sort((a, b) => b.localeCompare(a))
}

// ── needsCpfChangeover ────────────────────────────────────────
// Returns the pending period key if the payroll period month has
// reached or passed a pending bracket's effective_from date.
// Returns null if no changeover is needed.
export function needsCpfChangeover(
  brackets: any[],
  payrollYear: number,
  payrollMonth: number
): { pendingPeriod: string; oldestPeriod: string | null } | null {
  const periods = getCpfPeriods(brackets)
  if (periods.length < 2) return null // only one period — no changeover possible

  const payrollDate = new Date(payrollYear, payrollMonth - 1, 1)

  // Active period = most recent effective_from <= payroll date
  const activePeriod = periods.find(p => {
    if (p === 'default') return true
    return new Date(p) <= payrollDate
  }) ?? null

  // Pending period = effective_from > today's date (not yet active in calendar)
  // but <= payroll date (meaning the payroll period has passed the boundary)
  const today = new Date()
  const pendingPeriod = periods.find(p => {
    if (p === 'default') return false
    const d = new Date(p)
    return d <= payrollDate && d > today
  }) ?? null

  if (!pendingPeriod) return null

  // Oldest period = the one to delete if there are 3 periods
  const oldest = periods[periods.length - 1]
  const oldestPeriod = periods.length >= 3 ? oldest : null

  return { pendingPeriod, oldestPeriod }
}

// ── loadCpfBrackets ──────────────────────────────────────────
// Load all CPF age brackets from the database.
// Returns brackets with ow_ceiling and annual_aw_ceiling included.
// Use instead of repeating the query in each page.
export async function loadCpfBrackets(supabase: any): Promise<any[]> {
  const { data } = await supabase
    .from('cpf_age_brackets')
    .select('*')
    .order('effective_from', { ascending: false })
  return data || []
}

// ── getCpfCeilings ───────────────────────────────────────────
// Extract OW and AW ceilings for a given payroll year from brackets.
// Ceilings are stored once per year (same value across all age brackets).
// Matches on effective_from year (consistent with getCpfBracketRates).
// Falls back to Singapore defaults if not configured in DB.
export function getCpfCeilings(
  brackets: any[],
  year: number
): { owCeiling: number; annualAWCeiling: number } {
  // Find the most recent bracket effective on or before Jan 1 of the payroll year
  // that has ow_ceiling set — ceilings are stored once per effective period
  const payrollYearStart = new Date(year, 0, 1)
  const eligible = brackets
    .filter((b: any) =>
      b.ow_ceiling != null &&
      (!b.effective_from || new Date(b.effective_from) <= payrollYearStart)
    )
    .sort((a: any, b: any) =>
      new Date(b.effective_from || 0).getTime() - new Date(a.effective_from || 0).getTime()
    )
  const yearBracket = eligible[0] ?? null
  return {
    owCeiling: yearBracket?.ow_ceiling ?? 6800,
    annualAWCeiling: yearBracket?.annual_aw_ceiling ?? 102000,
  }
}

// ── loadYtdOW ────────────────────────────────────────────────
// Load year-to-date OW and AW figures for a staff member.
// Used by individual payslip generation.
// For bulk payroll, load YTD for all staff in one batch query instead.
//
// OW includes: salary_amount + commission_amount + allowance_amount
//              + others_amount (where others_cpf_liable = true)
// AW includes: bonus_amount
//
// Excludes the current payslip month (pass excludeMonth = payroll month).
export async function loadYtdOW(
  supabase: any,
  userId: string,
  year: number,
  excludeMonth: number
): Promise<{
  ytdOW: number
  ytdAW: number
  allLowIncome: boolean
}> {
  const { data: slips } = await supabase
    .from('payslips')
    .select(
      'salary_amount, commission_amount, allowance_amount, others_amount, ' +
      'others_cpf_liable, bonus_amount, aw_subject_to_cpf, low_income_flag, period_month'
    )
    .eq('user_id', userId)
    .eq('period_year', year)
    .neq('period_month', excludeMonth)
    .in('status', ['approved', 'paid'])

  if (!slips || slips.length === 0) {
    return { ytdOW: 0, ytdAW: 0, allLowIncome: false }
  }

  const ytdOW = slips.reduce((sum: number, p: any) => {
    const ow =
      (p.salary_amount || 0) +
      (p.commission_amount || 0) +
      (p.allowance_amount || 0) +
      (p.others_cpf_liable ? (p.others_amount || 0) : 0)
    return sum + ow
  }, 0)

  const ytdAW = slips.reduce(
    (sum: number, p: any) => sum + (p.aw_subject_to_cpf || 0),
    0
  )

  const allLowIncome =
    slips.length > 0 && slips.every((p: any) => p.low_income_flag)

  return { ytdOW, ytdAW, allLowIncome }
}

// ── CpfResult ────────────────────────────────────────────────
export interface CpfResult {
  cappedOW: number          // OW after monthly ceiling
  awSubject: number         // bonus AW after annual ceiling
  employeeCpf: number       // total employee CPF (OW + AW)
  employerCpf: number       // total employer CPF (OW + AW)
  grossSalary: number       // totalOW + bonusAW (all earnings)
  netSalary: number         // grossSalary - deductions - employeeCpf
  totalEmployerCost: number // grossSalary + employerCpf
  lowIncomeFlag: boolean    // true if below $50/month threshold
  decemberAdjNote: string | null // non-null if year-end AW correction needed
}

// ── computeCpfAmounts ────────────────────────────────────────
// Pure function — computes all CPF amounts from inputs.
// Caller is responsible for loading YTD data and passing numbers in.
//
// CPF classification:
//   OW (Ordinary Wages): salary + commission + allowance + others_if_liable
//   AW (Additional Wages): bonus only (irregular, annual)
//
// For bulk payroll: load YTD for all staff upfront, pass per-staff.
// For individual payslip: use loadYtdOW() then call this.
export function computeCpfAmounts(params: {
  // Earnings components
  salaryAmount: number      // roster pay or fixed salary
  commissionAmount: number  // from commission_items (OW)
  allowanceAmount: number   // monthly fixed allowance (OW)
  bonusAW: number           // bonus (AW — annual/irregular)
  othersAmount: number      // director's fee etc
  othersCpfLiable: boolean  // whether others is OW
  deductionAmount: number   // pending deductions
  // CPF parameters
  isCpf: boolean
  rates: { employee_rate: number; employer_rate: number }
  owCeiling: number         // monthly OW ceiling (from getCpfCeilings)
  annualAWCeiling: number   // annual AW ceiling (from getCpfCeilings)
  // YTD (prior payslips in same year, excluding current month)
  ytdOWBefore: number       // sum of capped OW from prior payslips
  ytdAWBefore: number       // sum of aw_subject_to_cpf from prior payslips
  allLowIncome: boolean     // all prior payslips were low-income exempt
  // Payroll period
  periodMonth: number
  periodYear: number
}): CpfResult {
  const {
    salaryAmount, commissionAmount, allowanceAmount,
    bonusAW, othersAmount, othersCpfLiable, deductionAmount,
    isCpf, rates, owCeiling, annualAWCeiling,
    ytdOWBefore, ytdAWBefore, allLowIncome,
    periodMonth,
  } = params

  // Total OW = all monthly earnings that are CPF-liable
  const totalOW =
    salaryAmount +
    commissionAmount +
    allowanceAmount +
    (othersCpfLiable ? othersAmount : 0)

  // Gross salary = all earnings (CPF-liable + non-CPF)
  const grossSalary = salaryAmount + commissionAmount + allowanceAmount + bonusAW + othersAmount

  if (!isCpf || grossSalary === 0) {
    return {
      cappedOW: 0, awSubject: 0,
      employeeCpf: 0, employerCpf: 0,
      grossSalary,
      netSalary: grossSalary - deductionAmount,
      totalEmployerCost: grossSalary,
      lowIncomeFlag: false,
      decemberAdjNote: null,
    }
  }

  // Low-income threshold: age ≤55 earning ≤$50/month OW — no CPF
  // Also skip if ALL prior payslips this year were low-income exempt
  if (totalOW <= 50 || allLowIncome) {
    return {
      cappedOW: 0, awSubject: 0,
      employeeCpf: 0, employerCpf: 0,
      grossSalary,
      netSalary: grossSalary - deductionAmount,
      totalEmployerCost: grossSalary,
      lowIncomeFlag: totalOW <= 50,
      decemberAdjNote: null,
    }
  }

  // ── OW CPF ────────────────────────────────────────────────
  // Check annual ceiling headroom for OW
  const owHeadroom = Math.max(0, annualAWCeiling - ytdOWBefore)
  const cappedOW = Math.min(totalOW, owCeiling, owHeadroom)

  const employerCpfOW = Math.round(cappedOW * rates.employer_rate / 100)
  const employeeCpfOW = Math.floor(cappedOW * rates.employee_rate / 100)

  // ── AW CPF (bonus) ────────────────────────────────────────
  // AW ceiling = annualAWCeiling - projected full-year OW
  // Projection: YTD OW + (capped current OW × remaining months)
  let awSubject = 0
  let employerCpfAW = 0
  let employeeCpfAW = 0

  if (bonusAW > 0) {
    const remainingMonths = 12 - periodMonth + 1
    const projectedOW = ytdOWBefore + (Math.min(totalOW, owCeiling) * remainingMonths)
    const awCeiling = Math.max(0, annualAWCeiling - projectedOW)
    const awRemaining = Math.max(0, awCeiling - ytdAWBefore)
    awSubject = Math.min(bonusAW, awRemaining)

    if (awSubject > 0) {
      employerCpfAW = Math.round(awSubject * rates.employer_rate / 100)
      employeeCpfAW = Math.floor(awSubject * rates.employee_rate / 100)
    }
  }

  const employeeCpf = employeeCpfOW + employeeCpfAW
  const employerCpf = employerCpfOW + employerCpfAW

  // ── December year-end AW reconciliation ──────────────────
  // In December, compare actual full-year OW against projection used
  // when bonus was processed. If projection was wrong, surface adjustment.
  let decemberAdjNote: string | null = null

  if (periodMonth === 12 && ytdAWBefore > 0) {
    const actualFullYearOW = ytdOWBefore + Math.min(totalOW, owCeiling)
    const actualAWCeiling = Math.max(0, annualAWCeiling - actualFullYearOW)
    const awVariance = actualAWCeiling - ytdAWBefore

    if (Math.abs(awVariance) >= 1) {
      const erAdj = Math.round(Math.abs(awVariance) * rates.employer_rate / 100)
      const empAdj = Math.floor(Math.abs(awVariance) * rates.employee_rate / 100)
      const direction = awVariance > 0 ? 'top-up' : 'refund'
      decemberAdjNote =
        `Year-end CPF AW adjustment (${direction}): ` +
        `AW previously subjected: ${ytdAWBefore.toFixed(2)}. ` +
        `Actual AW ceiling: ${actualAWCeiling.toFixed(2)}. ` +
        `Variance: ${Math.abs(awVariance).toFixed(2)}. ` +
        `Employee ${direction}: ${empAdj.toFixed(2)}. ` +
        `Employer ${direction}: ${erAdj.toFixed(2)}.`
    }
  }

  const netSalary = grossSalary - deductionAmount - employeeCpf
  const totalEmployerCost = grossSalary + employerCpf

  return {
    cappedOW,
    awSubject,
    employeeCpf,
    employerCpf,
    grossSalary,
    netSalary,
    totalEmployerCost,
    lowIncomeFlag: false,
    decemberAdjNote,
  }
}
