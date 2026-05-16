'use client'

// ============================================================
// src/lib/pdf.ts — Shared PDF helpers
//
// Single unified payslip template for all payment types:
//   payment_type = 'salary'     → salary rows populated, commission = 0.00
//   payment_type = 'commission' → commission rows populated, salary = 0.00
//   payment_type = 'combined'   → all rows populated
//
// All three payslip download paths call renderUnifiedPayslipPdf():
//   hr/[id]/payroll/page.tsx   — biz-ops: individual staff payslip
//   my/payslips/page.tsx       — staff self-service: own payslips
//   payroll/page.tsx           — biz-ops bulk archive: zipped PDFs
//
// Annual statement: renderAnnualStatementPdf() — reads payslips table only
// (one source of truth, no commission_payouts join needed)
// ============================================================

import { formatSGD, getMonthName } from '@/lib/utils'

// ── Standard table style ──────────────────────────────────────
export const PDF_TABLE_STYLE = {
  styles: { fontSize: 10 },
  headStyles: { fillColor: [220, 38, 38] as [number, number, number] },
  columnStyles: { 1: { halign: 'right' as const, fontStyle: 'bold' as const } },
}

// ── loadLogoAsBase64 ─────────────────────────────────────────
export async function loadLogoAsBase64(url: string): Promise<string | null> {
  try {
    const blob = await fetch(url).then(r => r.blob())
    return await new Promise<string>((res, rej) => {
      const fr = new FileReader()
      fr.onload = () => res(fr.result as string)
      fr.onerror = rej
      fr.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// ── getImageDimensions ───────────────────────────────────────
export async function getImageDimensions(src: string): Promise<{ w: number; h: number }> {
  return new Promise(res => {
    const img = new Image()
    img.onload = () => res({ w: img.width, h: img.height })
    img.onerror = () => res({ w: 1, h: 1 })
    img.src = src
  })
}

// ── addLogoHeader ────────────────────────────────────────────
// Renders gym logo + document title in top-left.
// Returns Y position after the header block.
export async function addLogoHeader(
  doc: any,
  logoUrl: string | null,
  title: string,
  fontSize = 18
): Promise<number> {
  if (logoUrl) {
    const dataUrl = await loadLogoAsBase64(logoUrl)
    if (dataUrl) {
      try {
        const { w: nW, h: nH } = await getImageDimensions(dataUrl)
        const maxH = 25; const maxW = 60
        let w = (nW / nH) * maxH
        if (w > maxW) w = maxW
        doc.addImage(dataUrl, 'PNG', 14, 8, w, maxH)
        doc.setFontSize(fontSize); doc.setFont('helvetica', 'bold')
        doc.text(title, 14 + w + 4, 22)
        doc.setFont('helvetica', 'normal')
        return 38
      } catch { /* fall through */ }
    }
  }
  doc.setFontSize(fontSize); doc.setFont('helvetica', 'bold')
  doc.text(title, 14, 22)
  doc.setFont('helvetica', 'normal')
  return 30
}

// ── resolvePayslipBranding ───────────────────────────────────
// Resolves logo URL, gym name and company name for a payslip.
// Uses the gym associated with the payslip's gym_id.
export async function resolvePayslipBranding(
  supabase: any,
  staffData: { role: string; manager_gym_id?: string | null; id: string }
): Promise<{ logoUrl: string | null; gymName: string; companyName: string }> {
  const { data: settings } = await supabase
    .from('app_settings')
    .select('payslip_logo_url, company_name')
    .eq('id', 'global')
    .maybeSingle()
  const companyName: string = settings?.company_name || 'Gym Operations'

  if (staffData.role === 'business_ops') {
    return { logoUrl: settings?.payslip_logo_url || null, gymName: companyName, companyName }
  }

  if (staffData.manager_gym_id) {
    const { data: gym } = await supabase
      .from('gyms').select('name, logo_url')
      .eq('id', staffData.manager_gym_id).maybeSingle()
    return { logoUrl: gym?.logo_url || null, gymName: gym?.name || companyName, companyName }
  }

  if (staffData.role === 'trainer' || staffData.role === 'staff') {
    const { data: tg } = await supabase
      .from('trainer_gyms').select('gyms(name, logo_url)')
      .eq('trainer_id', staffData.id).eq('is_primary', true).maybeSingle()
    return {
      logoUrl: (tg as any)?.gyms?.logo_url || null,
      gymName: (tg as any)?.gyms?.name || companyName,
      companyName,
    }
  }

  return { logoUrl: null, gymName: companyName, companyName }
}

// ── renderUnifiedPayslipPdf ──────────────────────────────────
// Single template for all payment types (salary / commission / combined).
// Fields with nothing show 0.00 — not hidden — for template consistency.
//
// Parameters:
//   doc        — jsPDF instance (caller imports jsPDF)
//   autoTable  — jspdf-autotable (caller imports)
//   slip       — payslip record from DB (unified schema)
//   staff      — { full_name, employment_type, nric, date_of_joining }
//   branding   — { logoUrl, gymName } from resolvePayslipBranding or gym map
//   allSlips   — all payslips for this staff this year (YTD calc)
export async function renderUnifiedPayslipPdf(
  doc: any,
  autoTable: any,
  slip: any,
  staff: {
    full_name: string
    employment_type?: string | null
    nric?: string | null
    date_of_joining?: string | null
  },
  branding: { logoUrl: string | null; gymName: string },
  allSlips: any[] = []
): Promise<void> {
  const isPartTime = (slip.employment_type || staff.employment_type) === 'part_time'
  const paymentType: string = slip.payment_type || 'salary'
  const isSalary = paymentType === 'salary' || paymentType === 'combined'
  const isCommission = paymentType === 'commission' || paymentType === 'combined'

  let yPos = await addLogoHeader(doc, branding.logoUrl, 'PAYSLIP')

  // ── Gym + period ─────────────────────────────────────────
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10); doc.setTextColor(100)
  doc.text(branding.gymName, 14, yPos); yPos += 6
  doc.text(`${getMonthName(slip.period_month)} ${slip.period_year}`, 14, yPos); yPos += 6

  // Commission period note (when different from salary period)
  if (
    isCommission &&
    slip.commission_period_month &&
    (slip.commission_period_month !== slip.period_month ||
      slip.commission_period_year !== slip.period_year)
  ) {
    doc.setFontSize(9); doc.setTextColor(120)
    doc.text(
      `Commission period: ${getMonthName(slip.commission_period_month)} ${slip.commission_period_year}`,
      14, yPos
    ); yPos += 5
  }
  yPos += 4
  doc.setTextColor(0)

  // ── Employee section ──────────────────────────────────────
  doc.setFontSize(10); doc.setFont('helvetica', 'bold')
  doc.text('Employee', 14, yPos); yPos += 6
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(80)
  doc.text(`Name: ${staff.full_name}`, 14, yPos); yPos += 6
  doc.text(`Employment: ${isPartTime ? 'Part-time' : 'Full-time'}`, 14, yPos); yPos += 6
  if (staff.nric) { doc.text(`NRIC/FIN/Passport: ${staff.nric}`, 14, yPos); yPos += 6 }
  if (staff.date_of_joining) { doc.text(`Date of Joining: ${staff.date_of_joining}`, 14, yPos); yPos += 6 }
  doc.setTextColor(0); yPos += 4

  // ── Earnings table ────────────────────────────────────────
  // All rows shown regardless of payment_type — 0.00 when not applicable.
  // This ensures the template is consistent and immediately combined-ready.
  const salaryLabel = isPartTime && (slip.total_hours || 0) > 0
    ? `Salary (${slip.total_hours}h @ ${formatSGD(slip.hourly_rate_used || 0)}/h)`
    : 'Salary'

  const earningsRows: any[] = [
    [salaryLabel, formatSGD(isSalary ? (slip.salary_amount || 0) : 0)],
    ['Commission', formatSGD(isCommission ? (slip.commission_amount || 0) : 0)],
  ]

  if ((slip.allowance_amount || 0) > 0 || paymentType === 'combined') {
    const allowanceLabel = slip.allowance_label
      ? `Allowance (${slip.allowance_label})`
      : 'Allowance'
    earningsRows.push([allowanceLabel, formatSGD(slip.allowance_amount || 0)])
  }

  earningsRows.push(['Bonus', formatSGD(slip.bonus_amount || 0)])

  if ((slip.others_amount || 0) > 0) {
    const othersLabel = slip.others_label || 'Others'
    const othersNote = slip.others_cpf_liable ? '' : ' (non-CPF)'
    earningsRows.push([`${othersLabel}${othersNote}`, formatSGD(slip.others_amount || 0)])
  }

  earningsRows.push(['', ''])
  earningsRows.push(['Gross Earnings', formatSGD(slip.gross_salary || 0)])
  const grossIdx = earningsRows.length - 1

  // ── Deductions ────────────────────────────────────────────
  earningsRows.push(['', ''])
  if (slip.is_cpf_liable) {
    if (slip.low_income_flag) {
      earningsRows.push(['CPF', 'Exempt (low income threshold)'])
    } else {
      earningsRows.push([
        `Employee CPF (${slip.employee_cpf_rate}%)`,
        `- ${formatSGD(slip.employee_cpf_amount || 0)}`,
      ])
      earningsRows.push([
        `Employer CPF (${slip.employer_cpf_rate}%) — for records`,
        formatSGD(slip.employer_cpf_amount || 0),
      ])
    }
  } else {
    earningsRows.push(['CPF', 'Not applicable'])
  }

  if ((slip.deduction_amount || 0) > 0) {
    earningsRows.push([
      `Deduction${slip.deduction_reason ? ` — ${slip.deduction_reason}` : ''}`,
      `- ${formatSGD(slip.deduction_amount)}`,
    ])
  }

  earningsRows.push(['', ''])
  earningsRows.push(['Net Pay', formatSGD(slip.net_salary || 0)])
  const netPayIdx = earningsRows.length - 1

  autoTable(doc, {
    startY: yPos,
    head: [['Description', 'Amount (SGD)']],
    body: earningsRows,
    ...PDF_TABLE_STYLE,
    didParseCell: (data: any) => {
      if (data.row.index === grossIdx) {
        data.cell.styles.fillColor = [240, 240, 240]
        data.cell.styles.fontStyle = 'bold'
      }
      if (data.row.index === netPayIdx) {
        data.cell.styles.fillColor = [234, 243, 222]
        data.cell.styles.textColor = [39, 80, 10]
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })

  // ── CPF detail box ────────────────────────────────────────
  const fy = (doc as any).lastAutoTable.finalY + 6
  if (slip.is_cpf_liable && !slip.low_income_flag) {
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(0)
    doc.text('CPF Detail', 14, fy)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(80)
    const cpfLines = [
      `OW subject to CPF: ${formatSGD(slip.capped_ow || 0)}  (ceiling used: ${formatSGD(slip.ow_ceiling_used || 0)})`,
      slip.aw_subject_to_cpf > 0
        ? `AW (bonus) subject to CPF: ${formatSGD(slip.aw_subject_to_cpf)}`
        : null,
      slip.cpf_adjustment_note || null,
    ].filter(Boolean)
    cpfLines.forEach((line: any, i: number) => {
      doc.text(line, 14, fy + 6 + i * 5)
    })
  }

  // ── Status + paid date ────────────────────────────────────
  const statusY = slip.is_cpf_liable && !slip.low_income_flag ? fy + 30 : fy + 6
  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(0)
  doc.text(
    `Status: ${slip.status.charAt(0).toUpperCase() + slip.status.slice(1)}`,
    14, statusY
  )
  if (slip.paid_at) {
    const paidDate = new Date(slip.paid_at).toLocaleDateString('en-SG', {
      timeZone: 'Asia/Singapore',
      day: 'numeric', month: 'short', year: 'numeric',
    })
    doc.text(`Paid on: ${paidDate}`, 14, statusY + 6)
  }

  // ── YTD summary ───────────────────────────────────────────
  // Reads from payslips table only — single source of truth.
  // Commission period payslips (payment_type='commission') are included.
  // Groups into columns: Salary | Commission | Total
  const ytdY = statusY + (slip.paid_at ? 18 : 12)
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(0)
  doc.text(`Year to Date — Jan to ${getMonthName(slip.period_month)} ${slip.period_year}`, 14, ytdY)
  doc.setFont('helvetica', 'normal')

  // All approved/paid payslips for this staff this year up to this month
  const ytdSlips = allSlips.filter((p: any) =>
    p.period_year === slip.period_year &&
    p.period_month <= slip.period_month &&
    ['approved', 'paid'].includes(p.status)
  )

  const ytd = ytdSlips.reduce(
    (acc: any, p: any) => ({
      salary: acc.salary + (p.salary_amount || 0),
      commission: acc.commission + (p.commission_amount || 0),
      allowance: acc.allowance + (p.allowance_amount || 0),
      bonus: acc.bonus + (p.bonus_amount || 0),
      others: acc.others + (p.others_amount || 0),
      gross: acc.gross + (p.gross_salary || 0),
      empCpf: acc.empCpf + (p.employee_cpf_amount || 0),
      erCpf: acc.erCpf + (p.employer_cpf_amount || 0),
    }),
    { salary: 0, commission: 0, allowance: 0, bonus: 0, others: 0,
      gross: 0, empCpf: 0, erCpf: 0 }
  )

  const ytdBody = [
    ['Salary', formatSGD(ytd.salary)],
    ['Commission', formatSGD(ytd.commission)],
    ['Allowance', formatSGD(ytd.allowance)],
    ['Bonus (AW)', formatSGD(ytd.bonus)],
    ...(ytd.others > 0 ? [['Others', formatSGD(ytd.others)]] : []),
    ['Total Gross', formatSGD(ytd.gross)],
    ['', ''],
    ['Employee CPF', formatSGD(ytd.empCpf)],
    ['Employer CPF', formatSGD(ytd.erCpf)],
  ]
  const ytdGrossIdx = ytdBody.findIndex(r => r[0] === 'Total Gross')

  autoTable(doc, {
    startY: ytdY + 4,
    head: [['Component', 'Amount (SGD)']],
    body: ytdBody,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [100, 100, 100] },
    columnStyles: { 1: { halign: 'right' } },
    didParseCell: (data: any) => {
      if (data.row.index === ytdGrossIdx) {
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })
}

// ── renderAnnualStatementPdf ──────────────────────────────────
// Renders an annual income statement for income tax reporting.
// One PDF per staff per gym, covering a full calendar year.
// Reads from payslips table only — single source of truth.
// Aggregates salary, commission, allowance, bonus and others separately.
export async function renderAnnualStatementPdf(
  doc: any,
  autoTable: any,
  year: number,
  staff: {
    full_name: string
    nric?: string | null
    employment_type?: string | null
    date_of_joining?: string | null
  },
  branding: { logoUrl: string | null; gymName: string; gymAddress?: string | null },
  payslips: any[]
): Promise<void> {
  let yPos = await addLogoHeader(doc, branding.logoUrl, 'Annual Income Statement', 14)

  // ── Gym details ──────────────────────────────────────────
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10); doc.setTextColor(80)
  doc.text(branding.gymName, 14, yPos); yPos += 5
  if (branding.gymAddress) { doc.text(branding.gymAddress, 14, yPos); yPos += 5 }
  doc.setFontSize(9); doc.setTextColor(120)
  doc.text(`Year of Assessment ${year} (1 Jan ${year} – 31 Dec ${year})`, 14, yPos); yPos += 10
  doc.setTextColor(0)

  // ── Staff details block ───────────────────────────────────
  doc.setFillColor(249, 249, 249)
  doc.rect(14, yPos, 182, staff.nric && staff.date_of_joining ? 22 : 16, 'F')
  doc.setFontSize(10); doc.setFont('helvetica', 'bold')
  doc.text(staff.full_name, 18, yPos + 6)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(80)
  const metaParts: string[] = []
  if (staff.nric) metaParts.push(`NRIC/FIN: ${staff.nric}`)
  metaParts.push(staff.employment_type === 'part_time' ? 'Part-time' : 'Full-time')
  if (staff.date_of_joining) metaParts.push(`Joined: ${staff.date_of_joining}`)
  doc.text(metaParts.join('  ·  '), 18, yPos + 13)
  yPos += (staff.nric && staff.date_of_joining ? 22 : 16) + 6
  doc.setTextColor(0)

  // ── Aggregate from payslips (single source) ───────────────
  const agg = payslips.reduce(
    (acc, p) => ({
      salary:     acc.salary     + (p.salary_amount || 0),
      commission: acc.commission + (p.commission_amount || 0),
      allowance:  acc.allowance  + (p.allowance_amount || 0),
      bonus:      acc.bonus      + (p.bonus_amount || 0),
      others:     acc.others     + (p.others_amount || 0),
      gross:      acc.gross      + (p.gross_salary || 0),
      empCpf:     acc.empCpf     + (p.employee_cpf_amount || 0),
      erCpf:      acc.erCpf      + (p.employer_cpf_amount || 0),
    }),
    { salary: 0, commission: 0, allowance: 0, bonus: 0, others: 0,
      gross: 0, empCpf: 0, erCpf: 0 }
  )

  const rows: any[] = [
    [{ content: 'Earnings', styles: { fillColor: [245, 245, 245], textColor: [80, 80, 80], fontStyle: 'bold', fontSize: 8 } }, ''],
    ['Salary', formatSGD(agg.salary)],
    ['Commission', formatSGD(agg.commission)],
    ['Allowance', formatSGD(agg.allowance)],
    ['Bonus (AW)', formatSGD(agg.bonus)],
    ...(agg.others > 0 ? [['Others', formatSGD(agg.others)]] : []),
    ['', ''],
  ]

  const totalGrossIdx = rows.length
  rows.push(['Total Gross Income', formatSGD(agg.gross)])
  rows.push(['', ''])
  rows.push([{ content: 'CPF Contributions', styles: { fillColor: [245, 245, 245], textColor: [80, 80, 80], fontStyle: 'bold', fontSize: 8 } }, ''])
  rows.push(['Employee CPF', formatSGD(agg.empCpf)])
  rows.push(['Employer CPF Contribution', formatSGD(agg.erCpf)])

  autoTable(doc, {
    startY: yPos,
    head: [['Component', 'Amount (SGD)']],
    body: rows,
    ...PDF_TABLE_STYLE,
    didParseCell: (data: any) => {
      if (data.row.index === totalGrossIdx) {
        data.cell.styles.fillColor = [234, 243, 222]
        data.cell.styles.textColor = [39, 80, 10]
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })

  // ── Footer note ───────────────────────────────────────────
  const finalY = (doc as any).lastAutoTable.finalY + 10
  doc.setFontSize(8); doc.setTextColor(150)
  doc.text(
    `This statement is for income tax reference purposes only. Generated on ${
      new Date().toLocaleDateString('en-SG', { timeZone: 'Asia/Singapore' })
    }.`,
    14, finalY
  )
}
