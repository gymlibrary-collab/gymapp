// ============================================================
// Shared CPF helpers — used by payroll generation pages.
// ============================================================

// ── getAgeAsOf ───────────────────────────────────────────────
// Returns whole-number age as of a given reference date.
// Returns null if dob is not provided.
export function getAgeAsOf(dob: string | null, refDate: Date): number | null {
  if (!dob) return null
  const birth = new Date(dob)
  let age = refDate.getFullYear() - birth.getFullYear()
  // If birthday has not yet occurred as of refDate, subtract 1
  if (
    refDate.getMonth() < birth.getMonth() ||
    (refDate.getMonth() === birth.getMonth() && refDate.getDate() < birth.getDate())
  ) age--
  return age
}

// ── getCpfBracketRates ───────────────────────────────────────
// Returns the CPF employee and employer rates for a staff member
// based on their date of birth and the payroll month/year.
//
// Rules:
// - Age calculated as of LAST DAY of the payroll month
// - Bracket boundary: staff moves to next bracket the day AFTER
//   their birthday at the upper age of the current bracket.
//   e.g. born 1 Aug 1970, turns 55 on 1 Aug 2025 → Bracket 2
//   from 2 Aug 2025. As of 31 May 2026, they are in Bracket 2.
// - effective_from: picks most recent bracket rates valid for
//   the payroll month start date.
// - Returns { employee_rate: 20, employer_rate: 17 } as fallback
//   if no bracket is found (55-and-below default rates).
export function getCpfBracketRates(
  brackets: any[],
  dob: string | null,
  payrollYear: number,
  payrollMonth: number
): { employee_rate: number; employer_rate: number } {
  const lastDayOfMonth = new Date(payrollYear, payrollMonth, 0)
  const age = getAgeAsOf(dob, lastDayOfMonth)
  if (age === null) return { employee_rate: 20, employer_rate: 17 }

  // Filter to brackets effective on or before the payroll month start
  const payrollDate = new Date(payrollYear, payrollMonth - 1, 1)
  const validBrackets = brackets
    .filter((b: any) => !b.effective_from || new Date(b.effective_from) <= payrollDate)
    .sort((a: any, b: any) => new Date(b.effective_from || 0).getTime() - new Date(a.effective_from || 0).getTime())

  if (dob) {
    const birth = new Date(dob)
    // Sort brackets by age_from ascending to walk bracket boundaries
    const sorted = [...validBrackets].sort((a: any, b: any) => (a.age_from ?? 0) - (b.age_from ?? 0))
    // Find which bracket the staff is in by counting how many upper
    // boundaries they have passed (birthday at age_to occurred before refDate)
    let bracketIndex = 0
    for (let i = 0; i < sorted.length - 1; i++) {
      const upperAge = sorted[i].age_to  // e.g. 55 for Bracket 1
      if (upperAge === null) break
      // Date they turned upperAge — they leave this bracket the day after
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

  // Fallback: whole-number age match (no dob precision)
  const bracket = validBrackets.find(
    (b: any) => age >= b.age_from && (b.age_to === null || age <= b.age_to)
  )
  return bracket
    ? { employee_rate: bracket.employee_rate, employer_rate: bracket.employer_rate }
    : { employee_rate: 20, employer_rate: 17 }
}

/**
 * Load all CPF age brackets from the database.
 * Use this instead of repeating the query in each page.
 * Returns brackets ordered by effective_from descending (most recent first).
 */
export async function loadCpfBrackets(supabase: any): Promise<any[]> {
  const { data } = await supabase
    .from('cpf_age_brackets')
    .select('*')
    .order('effective_from', { ascending: false })
  return data || []
}
