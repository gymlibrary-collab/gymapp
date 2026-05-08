'use client'

// ============================================================
// src/lib/pdf.ts — Shared PDF helpers
//
// ARCHITECTURE NOTE — payroll PDF generation:
// There are three places that generate payslip/commission PDFs:
//
//   hr/[id]/payroll/page.tsx   — biz-ops/manager: individual staff payslip
//   my/payslips/page.tsx       — staff self-service: own payslip + commission
//   payroll/page.tsx           — biz-ops bulk archive: all staff, zipped
//
// All three call renderPayslipPdf() and renderCommissionPdf() from this
// file. Any layout change to the PDFs only needs to happen here.
//
// ROUTING INTENT:
//   /hr/[id]/payroll  — per-person payroll, accessed via HR → Staff → person
//   /payroll/*        — batch financial ops (bulk generate, commission, CPF)
//   /my/payslips      — staff self-service (different audience: own records only)
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
// Renders gym logo + document title in top-left of a jsPDF document.
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
// Resolves logo URL and gym name for a staff member's payslip.
export async function resolvePayslipBranding(
  supabase: any,
  staffData: { role: string; manager_gym_id?: string | null; id: string }
): Promise<{ logoUrl: string | null; gymName: string; companyName: string }> {
  const { data: settings } = await supabase
    .from('app_settings').select('payslip_logo_url, company_name').eq('id', 'global').single()
  const companyName: string = settings?.company_name || 'Gym Operations'

  if (staffData.role === 'business_ops')
    return { logoUrl: settings?.payslip_logo_url || null, gymName: companyName, companyName }

  if (staffData.manager_gym_id) {
    const { data: gym } = await supabase.from('gyms').select('name, logo_url').eq('id', staffData.manager_gym_id).single()
    return { logoUrl: gym?.logo_url || null, gymName: gym?.name || companyName, companyName }
  }

  if (staffData.role === 'trainer' || staffData.role === 'staff') {
    const { data: tg } = await supabase.from('trainer_gyms').select('gyms(name, logo_url)')
      .eq('trainer_id', staffData.id).eq('is_primary', true).single()
    return { logoUrl: (tg as any)?.gyms?.logo_url || null, gymName: (tg as any)?.gyms?.name || companyName, companyName }
  }

  return { logoUrl: null, gymName: companyName, companyName }
}

// ── renderPayslipPdf ──────────────────────────────────────────
// Renders a complete payslip into a jsPDF document.
// Called by all three payslip download paths.
//
// Parameters:
//   doc        — jsPDF instance (caller imports jsPDF)
//   autoTable  — jspdf-autotable (caller imports)
//   slip       — payslip record from DB
//   staff      — { full_name, employment_type, nric, date_of_joining }
//   branding   — { logoUrl, gymName } from resolvePayslipBranding or gym map
//   allSlips   — all payslips for this staff this year (YTD calc). Pass [] if unavailable.
export async function renderPayslipPdf(
  doc: any,
  autoTable: any,
  slip: any,
  staff: { full_name: string; employment_type?: string | null; nric?: string | null; date_of_joining?: string | null },
  branding: { logoUrl: string | null; gymName: string },
  allSlips: any[] = [],
  allPayouts: any[] = []
): Promise<void> {
  const isPartTime = (slip.employment_type || staff.employment_type) === 'part_time'
  let yPos = await addLogoHeader(doc, branding.logoUrl, 'PAYSLIP')

  // ── Gym + period ─────────────────────────────────────────
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10); doc.setTextColor(100)
  doc.text(branding.gymName, 14, yPos); yPos += 6
  doc.text(`${getMonthName(slip.month)} ${slip.year}`, 14, yPos); yPos += 10
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

  // ── Earnings & CPF table ──────────────────────────────────
  const rows: any[] = []
  if (isPartTime && (slip.total_hours || 0) > 0) {
    rows.push([`Hours Worked (${slip.total_hours}h @ ${formatSGD(slip.hourly_rate_used || 0)}/h)`, formatSGD(slip.basic_salary)])
  } else {
    rows.push(['Basic Salary', formatSGD(slip.basic_salary)])
  }
  if (slip.bonus_amount > 0) rows.push(['Bonus', formatSGD(slip.bonus_amount)])
  rows.push(['Gross Salary', formatSGD(slip.gross_salary)])
  rows.push(['', ''])
  if (slip.is_cpf_liable) {
    if (slip.low_income_flag) {
      rows.push(['CPF', 'Exempt (low income threshold)'])
    } else {
      rows.push([`Employee CPF (${slip.employee_cpf_rate}%)`, `- ${formatSGD(slip.employee_cpf_amount)}`])
      rows.push([`Employer CPF (${slip.employer_cpf_rate}%)`, formatSGD(slip.employer_cpf_amount)])
    }
  } else {
    rows.push(['CPF', 'Not applicable'])
  }
  rows.push(['', ''])
  rows.push(['Net Pay', formatSGD(slip.net_salary)])
  const netPayIdx = rows.length - 1

  autoTable(doc, {
    startY: yPos, head: [['Description', 'Amount (SGD)']], body: rows, ...PDF_TABLE_STYLE,
    didParseCell: (data: any) => {
      if (data.row.index === netPayIdx) {
        data.cell.styles.fillColor = [234, 243, 222]
        data.cell.styles.textColor = [39, 80, 10]
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })

  // ── Status ────────────────────────────────────────────────
  const fy = (doc as any).lastAutoTable.finalY + 8
  doc.setFontSize(10); doc.setTextColor(0)
  doc.text(`Status: ${slip.status.charAt(0).toUpperCase() + slip.status.slice(1)}`, 14, fy)
  if (slip.paid_at) doc.text(`Paid on: ${new Date(slip.paid_at).toLocaleDateString('en-SG')}`, 14, fy + 6)

  // ── YTD summary ───────────────────────────────────────────
  // Salary: Jan–[month] same year, status approved/paid
  // Commission: Jan–[month-1] same year, status approved/paid
  //   (commission for month M is paid in month M+1, so excluded from same month)
  //   January edge case: no prior month in same year → commission = $0
  const ytdY = fy + 22
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(0)
  doc.text(`Year to Date (Jan – ${getMonthName(slip.month)} ${slip.year})`, 14, ytdY)
  doc.setFont('helvetica', 'normal')

  const ytdSlips = allSlips.filter((p: any) =>
    p.year === slip.year && p.month <= slip.month && ['approved', 'paid'].includes(p.status)
  )
  const ytdSalary = ytdSlips.reduce((acc: any, s: any) => ({
    gross:  acc.gross  + (s.gross_salary || 0),
    bonus:  acc.bonus  + (s.bonus_amount || 0),
    empCpf: acc.empCpf + (s.employee_cpf_amount || 0),
    erCpf:  acc.erCpf  + (s.employer_cpf_amount || 0),
  }), { gross: 0, bonus: 0, empCpf: 0, erCpf: 0 })

  // Commission YTD: period_start year = payslip year, month(period_start) < payslip month
  // January payslip → no prior month in same year → commission = $0
  const ytdPayouts = slip.month > 1
    ? allPayouts.filter((p: any) => {
        const pMonth = parseInt((p.period_start || '').split('-')[1] || '0')
        const pYear  = parseInt((p.period_start || '').split('-')[0] || '0')
        return pYear === slip.year && pMonth < slip.month && ['approved', 'paid'].includes(p.status)
      })
    : []
  const ytdComm = ytdPayouts.reduce((acc: any, p: any) => ({
    gross:  acc.gross  + (p.total_commission_sgd || 0),
    empCpf: acc.empCpf + (p.employee_cpf_amount || 0),
    erCpf:  acc.erCpf  + (p.employer_cpf_amount || 0),
  }), { gross: 0, empCpf: 0, erCpf: 0 })

  // Commission label: shows the range it covers e.g. "Jan – Apr" for a May payslip
  const commLabel = slip.month > 1
    ? `Gross Commission (Jan – ${getMonthName(slip.month - 1)})`
    : 'Gross Commission'

  // gross_salary in DB already includes bonus (basic_salary + bonus_amount)
  // so totalGross = ytdSalary.gross (salary+bonus) + ytdComm.gross — no double-count
  const totalGross  = ytdSalary.gross + ytdComm.gross
  const totalEmpCpf = ytdSalary.empCpf + ytdComm.empCpf
  const totalErCpf  = ytdSalary.erCpf  + ytdComm.erCpf

  const ytdBody = [
    ['Gross Salary', formatSGD(ytdSalary.gross)],
    ['Bonus', formatSGD(ytdSalary.bonus)],
    [commLabel, formatSGD(ytdComm.gross)],
    ['Total Gross (Salary + Bonus + Commission)', formatSGD(totalGross)],
    ['', ''],
    ['Employee CPF', formatSGD(totalEmpCpf)],
    ['Employer CPF', formatSGD(totalErCpf)],
  ]
  const totalGrossRowIdx = ytdBody.findIndex(r => r[0] === 'Total Gross (Salary + Bonus + Commission)')
  autoTable(doc, {
    startY: ytdY + 4,
    head: [['', 'Amount (SGD)']],
    body: ytdBody,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [100, 100, 100] },
    columnStyles: { 1: { halign: 'right' } },
    didParseCell: (data: any) => {
      if (data.row.index === totalGrossRowIdx) {
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })
}

// ── renderCommissionPdf ───────────────────────────────────────
// Renders a complete commission statement into a jsPDF document.
// Called by all commission download paths.
//
// Parameters:
//   doc       — jsPDF instance
//   autoTable — jspdf-autotable
//   payout    — commission_payout record from DB
//   staff     — { full_name, employment_type, nric, date_of_joining }
//   branding  — { logoUrl, gymName }
export async function renderCommissionPdf(
  doc: any,
  autoTable: any,
  payout: any,
  staff: { full_name: string; employment_type?: string | null; nric?: string | null; date_of_joining?: string | null },
  branding: { logoUrl: string | null; gymName: string }
): Promise<void> {
  let yPos = await addLogoHeader(doc, branding.logoUrl, 'COMMISSION STATEMENT', 16)

  // ── Gym + period ─────────────────────────────────────────
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10); doc.setTextColor(100)
  doc.text(branding.gymName, 14, yPos); yPos += 6
  doc.text(`Period: ${payout.period_start} to ${payout.period_end}`, 14, yPos); yPos += 10
  doc.setTextColor(0)

  // ── Employee section ──────────────────────────────────────
  doc.setFontSize(10); doc.setFont('helvetica', 'bold')
  doc.text('Employee', 14, yPos); yPos += 6
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(80)
  doc.text(`Name: ${staff.full_name}`, 14, yPos); yPos += 6
  doc.text(`Employment: ${staff.employment_type === 'part_time' ? 'Part-time' : 'Full-time'}`, 14, yPos); yPos += 6
  if (staff.nric) { doc.text(`NRIC/FIN/Passport: ${staff.nric}`, 14, yPos); yPos += 6 }
  if (staff.date_of_joining) { doc.text(`Date of Joining: ${staff.date_of_joining}`, 14, yPos); yPos += 6 }
  doc.setTextColor(0); yPos += 4

  // ── Commission table ──────────────────────────────────────
  const cpfBody: any[] = [
    ['PT Package Sign-up Commissions', payout.pt_signups_count || 0, formatSGD(payout.pt_signup_commission_sgd)],
    ['PT Session Commissions', payout.pt_sessions_count || 0, formatSGD(payout.pt_session_commission_sgd)],
    ['Membership Sale Commissions', payout.membership_sales_count || 0, formatSGD(payout.membership_commission_sgd)],
    ['', '', ''],
    ['Gross Commission', '', formatSGD(payout.total_commission_sgd)],
    ['', '', ''],
  ]
  if (payout.is_cpf_liable && payout.employee_cpf_amount > 0) {
    cpfBody.push([`Employee CPF (${payout.employee_cpf_rate}%)`, '', `- ${formatSGD(payout.employee_cpf_amount)}`])
    cpfBody.push([`Employer CPF (${payout.employer_cpf_rate}%)`, '', formatSGD(payout.employer_cpf_amount)])
    cpfBody.push(['', '', ''])
    cpfBody.push(['Net Commission', '', formatSGD(payout.net_commission_sgd ?? (payout.total_commission_sgd - payout.employee_cpf_amount))])
  } else if (!payout.is_cpf_liable) {
    cpfBody.push(['CPF', '', 'Not applicable'])
  }
  const netCommRowIdx = cpfBody.length - 1

  autoTable(doc, {
    startY: yPos,
    head: [['Description', 'Count', 'Amount (SGD)']],
    body: cpfBody,
    ...PDF_TABLE_STYLE,
    columnStyles: { 1: { halign: 'center' as const }, 2: { halign: 'right' as const, fontStyle: 'bold' as const } },
    didParseCell: (data: any) => {
      if (payout.is_cpf_liable && payout.employee_cpf_amount > 0 && data.row.index === netCommRowIdx) {
        data.cell.styles.fillColor = [234, 243, 222]
        data.cell.styles.textColor = [39, 80, 10]
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })

  // ── Status ────────────────────────────────────────────────
  const finalY = (doc as any).lastAutoTable.finalY + 8
  doc.setFontSize(10); doc.setTextColor(0)
  doc.text(`Status: ${payout.status.charAt(0).toUpperCase() + payout.status.slice(1)}`, 14, finalY)
  if (payout.paid_at) doc.text(`Paid on: ${new Date(payout.paid_at).toLocaleDateString('en-SG')}`, 14, finalY + 6)
}

// ── renderAnnualStatementPdf ──────────────────────────────────
// Renders an annual income statement for income tax reporting.
// One PDF per staff per gym, covering a full calendar year.
//
// Parameters:
//   doc        — jsPDF instance
//   autoTable  — jspdf-autotable
//   year       — statement year (e.g. 2026)
//   staff      — { full_name, nric, employment_type, date_of_joining }
//   branding   — { logoUrl, gymName, gymAddress }
//   payslips   — all approved/paid payslips for this staff+gym+year
//   payouts    — all approved/paid commission payouts for this staff+gym+year
export async function renderAnnualStatementPdf(
  doc: any,
  autoTable: any,
  year: number,
  staff: { full_name: string; nric?: string | null; employment_type?: string | null; date_of_joining?: string | null },
  branding: { logoUrl: string | null; gymName: string; gymAddress?: string | null },
  payslips: any[],
  payouts: any[]
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
  const metaParts = []
  if (staff.nric) metaParts.push(`NRIC/FIN: ${staff.nric}`)
  metaParts.push(staff.employment_type === 'part_time' ? 'Part-time' : 'Full-time')
  if (staff.date_of_joining) metaParts.push(`Joined: ${staff.date_of_joining}`)
  doc.text(metaParts.join('  ·  '), 18, yPos + 13)
  yPos += (staff.nric && staff.date_of_joining ? 22 : 16) + 6
  doc.setTextColor(0)

  // ── Aggregate salary data ────────────────────────────────
  const sal = payslips.reduce((acc, s) => ({
    basic:   acc.basic   + (s.basic_salary || 0),
    bonus:   acc.bonus   + (s.bonus_amount || 0),
    gross:   acc.gross   + (s.gross_salary || 0),
    empCpf:  acc.empCpf  + (s.employee_cpf_amount || 0),
    erCpf:   acc.erCpf   + (s.employer_cpf_amount || 0),
  }), { basic: 0, bonus: 0, gross: 0, empCpf: 0, erCpf: 0 })

  // ── Aggregate commission data ────────────────────────────
  const com = payouts.reduce((acc, p) => ({
    ptSignup:    acc.ptSignup    + (p.pt_signup_commission_sgd || 0),
    ptSession:   acc.ptSession   + (p.pt_session_commission_sgd || 0),
    membership:  acc.membership  + (p.membership_commission_sgd || 0),
    gross:       acc.gross       + (p.total_commission_sgd || 0),
    empCpf:      acc.empCpf      + (p.employee_cpf_amount || 0),
    erCpf:       acc.erCpf       + (p.employer_cpf_amount || 0),
  }), { ptSignup: 0, ptSession: 0, membership: 0, gross: 0, empCpf: 0, erCpf: 0 })

  const totalGross  = sal.gross + com.gross
  const totalEmpCpf = sal.empCpf + com.empCpf
  const totalErCpf  = sal.erCpf  + com.erCpf

  // ── Statement table ───────────────────────────────────────
  const rows: any[] = [
    [{ content: 'Salary & Wages', styles: { fillColor: [245, 245, 245], textColor: [80, 80, 80], fontStyle: 'bold', fontSize: 8 } }, ''],
    ['Basic Salary', formatSGD(sal.basic)],
    ['Bonus', formatSGD(sal.bonus)],
    ['Gross Salary', formatSGD(sal.gross)],
    ['', ''],
    [{ content: 'Commission', styles: { fillColor: [245, 245, 245], textColor: [80, 80, 80], fontStyle: 'bold', fontSize: 8 } }, ''],
    ['PT Package Sign-up', formatSGD(com.ptSignup)],
    ['PT Session', formatSGD(com.ptSession)],
    ['Membership Sales', formatSGD(com.membership)],
    ['Gross Commission', formatSGD(com.gross)],
    ['', ''],
  ]

  const totalGrossIdx = rows.length
  rows.push(['Total Gross Income', formatSGD(totalGross)])
  rows.push(['', ''])
  rows.push([{ content: 'CPF Contributions', styles: { fillColor: [245, 245, 245], textColor: [80, 80, 80], fontStyle: 'bold', fontSize: 8 } }, ''])
  rows.push(['Employee CPF', formatSGD(totalEmpCpf)])
  rows.push(['Employer CPF Contribution', formatSGD(totalErCpf)])

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
    `This statement is for income tax reference purposes only. Generated on ${new Date().toLocaleDateString('en-SG')}.`,
    14, finalY
  )
}
