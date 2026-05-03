'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { formatSGD, getMonthName } from '@/lib/utils'
import { FileText, Download, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function MyPayslipsPage() {
  const [payslips, setPayslips] = useState<any[]>([])
  const [commissionPayouts, setCommissionPayouts] = useState<any[]>([])
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'salary' | 'commission'>('salary')
  const supabase = createClient()

  // Branding state declared before useEffect so setPayslipBranding is in scope
  const [payslipBranding, setPayslipBranding] = useState<{logoUrl: string|null, companyName: string, gymName: string}>({
    logoUrl: null, companyName: 'Gym Operations Suite', gymName: 'Gym Operations Suite'
  })

  useEffect(() => {
    const load = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return
      const { data: userData } = await supabase.from('users').select('*').eq('id', authUser.id).single()
      setUser(userData)

      // Load payslip branding
      const { data: settings } = await supabase.from('app_settings')
        .select('payslip_logo_url, company_name').eq('id', 'global').single()
      const payslipLogoUrl = (settings as any)?.payslip_logo_url || null
      const companyName = (settings as any)?.company_name || 'Gym Operations Suite'

      // Get gym name for this user
      let gymName = companyName
      if (userData.manager_gym_id) {
        const { data: gym } = await supabase.from('gyms').select('name').eq('id', userData.manager_gym_id).single()
        if (gym) gymName = gym.name
      } else if (userData.role === 'trainer') {
        const { data: tg } = await supabase.from('trainer_gyms').select('gyms(name)').eq('trainer_id', authUser.id).eq('is_primary', true).single()
        if (tg && (tg as any).gyms) gymName = (tg as any).gyms.name
      }
      setPayslipBranding({ logoUrl: payslipLogoUrl, companyName, gymName })

      // Load last 13 months of salary payslips
      const cutoff = new Date()
      cutoff.setMonth(cutoff.getMonth() - 13)

      const { data: slips } = await supabase.from('payslips')
        .select('*').eq('user_id', authUser.id)
        .in('status', ['approved', 'paid'])  // drafts not visible to staff
        .order('year', { ascending: false }).order('month', { ascending: false })
        .limit(13)
      setPayslips(slips || [])

      // Load commission payouts — approved and paid only (drafts not visible to staff)
      const { data: payouts } = await supabase.from('commission_payouts')
        .select('*, gym:gyms(name)')
        .eq('user_id', authUser.id)
        .in('status', ['approved', 'paid'])
        .order('period_end', { ascending: false })
        .limit(13)
      setCommissionPayouts(payouts || [])

      setLoading(false)
    }
    load()
  }, [])

  const downloadPayslip = async (slip: any) => {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF()

    const { logoUrl, companyName, gymName } = payslipBranding
    let yPos = 22

    // Logo
    if (logoUrl) {
      try {
        const img = await fetch(logoUrl).then(r => r.blob()).then(b => new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.onerror = rej; fr.readAsDataURL(b) }))
        doc.addImage(img, 'PNG', 14, 10, 20, 20)
        doc.setFontSize(18); doc.setFont('helvetica', 'bold')
        doc.text('PAYSLIP', 38, 20)
        yPos = 36
      } catch { doc.setFontSize(20); doc.text('PAYSLIP', 14, 22); yPos = 30 }
    } else {
      doc.setFontSize(20); doc.text('PAYSLIP', 14, 22); yPos = 30
    }

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11); doc.setTextColor(100)
    doc.text(companyName, 14, yPos)
    yPos += 6
    doc.text(gymName, 14, yPos)
    yPos += 6
    doc.text(`${getMonthName(slip.month)} ${slip.year}`, 14, yPos)
    yPos += 14
    doc.setTextColor(0)

    doc.setFontSize(11); doc.text('Employee', 14, yPos); yPos += 8
    doc.setFontSize(10); doc.setTextColor(80)
    doc.text(`Name: ${user?.full_name}`, 14, yPos); yPos += 6
    doc.text(`Email: ${user?.email}`, 14, yPos); yPos += 6
    if (user?.date_of_joining) { doc.text(`Date of Joining: ${user.date_of_joining}`, 14, yPos); yPos += 6 }
    if (user?.nric) { doc.text(`NRIC/FIN: ${user.nric}`, 14, yPos); yPos += 6 }
    doc.setTextColor(0); yPos += 4

    const rows: any[] = []
    if (slip.total_hours > 0) {
      // Part-timer: show hours row only — basic_salary IS the hours calculation
      rows.push([`Hours Worked (${slip.total_hours}h @ ${formatSGD(slip.hourly_rate_used)}/h)`, formatSGD(slip.basic_salary)])
    } else {
      rows.push(['Basic Salary', formatSGD(slip.basic_salary)])
    }
    if (slip.bonus_amount > 0) rows.push(['Bonus', formatSGD(slip.bonus_amount)])
    rows.push(['Gross Salary', formatSGD(slip.gross_salary)])
    rows.push(['', ''])
    if (slip.is_cpf_liable) {
      rows.push([`Employee CPF (${slip.employee_cpf_rate}%)`, `- ${formatSGD(slip.employee_cpf_amount)}`])
    } else {
      rows.push(['CPF', 'Not applicable'])
    }
    rows.push(['', ''])
    rows.push(['Net Pay', formatSGD(slip.net_salary)])

    autoTable(doc, {
      startY: yPos, head: [['Description', 'Amount (SGD)']], body: rows,
      styles: { fontSize: 10 },
      headStyles: { fillColor: [220, 38, 38] },
      columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
    })

    const finalY = (doc as any).lastAutoTable.finalY + 10
    if (slip.is_cpf_liable) {
      doc.setFontSize(9); doc.setTextColor(100)
      doc.text(`Employer CPF (${slip.employer_cpf_rate}%): ${formatSGD(slip.employer_cpf_amount)}`, 14, finalY)
    }
    doc.setFontSize(10); doc.setTextColor(0)
    doc.text(`Status: ${slip.status.charAt(0).toUpperCase() + slip.status.slice(1)}`, 14, finalY + 14)
    if (slip.paid_at) doc.text(`Paid on: ${new Date(slip.paid_at).toLocaleDateString('en-SG')}`, 14, finalY + 20)

    doc.save(`payslip_${getMonthName(slip.month)}_${slip.year}.pdf`)
  }

  const downloadCommissionSlip = async (payout: any) => {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF()

    // Issue 2: Apply same branding as salary payslip
    const { logoUrl, companyName, gymName } = payslipBranding
    let yPos = 22

    if (logoUrl) {
      try {
        const img = await fetch(logoUrl).then(r => r.blob()).then(b => new Promise<string>((res, rej) => {
          const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.onerror = rej; fr.readAsDataURL(b)
        }))
        doc.addImage(img, 'PNG', 14, 10, 20, 20)
        doc.setFontSize(18); doc.setFont('helvetica', 'bold')
        doc.text('COMMISSION STATEMENT', 38, 20)
        yPos = 36
      } catch { doc.setFontSize(18); doc.text('COMMISSION STATEMENT', 14, 22); yPos = 30 }
    } else {
      doc.setFontSize(18); doc.text('COMMISSION STATEMENT', 14, 22); yPos = 30
    }

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10); doc.setTextColor(100)
    doc.text(companyName, 14, yPos); yPos += 6
    doc.text(gymName, 14, yPos); yPos += 6
    doc.text(`Period: ${payout.period_start} to ${payout.period_end}`, 14, yPos); yPos += 10
    doc.setTextColor(0)
    doc.text(`${user?.full_name}`, 14, yPos); yPos += 6

    autoTable(doc, {
      startY: yPos + 2,
      head: [['Description', 'Count', 'Amount (SGD)']],
      body: [
        ['PT Package Sign-up Commissions', payout.pt_signups_count, formatSGD(payout.pt_signup_commission_sgd)],
        ['PT Session Commissions', payout.pt_sessions_count, formatSGD(payout.pt_session_commission_sgd)],
        ['Membership Sale Commissions', payout.membership_sales_count, formatSGD(payout.membership_commission_sgd)],
        ['', '', ''],
        ['Total Commission', '', formatSGD(payout.total_commission_sgd)],
      ],
      styles: { fontSize: 10 },
      headStyles: { fillColor: [220, 38, 38] },
      columnStyles: { 2: { halign: 'right', fontStyle: 'bold' } },
    })

    const finalY = (doc as any).lastAutoTable.finalY + 10
    doc.setFontSize(10)
    doc.text(`Status: ${payout.status.charAt(0).toUpperCase() + payout.status.slice(1)}`, 14, finalY)
    if (payout.paid_at) doc.text(`Paid on: ${new Date(payout.paid_at).toLocaleDateString('en-SG')}`, 14, finalY + 6)

    doc.save(`commission_${payout.period_start}_${payout.period_end}.pdf`)
  }

  if (loading) return <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600" /></div>

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">My Payslips</h1>
        <p className="text-sm text-gray-500">Your last 13 months of salary and commission statements</p>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        <button onClick={() => setActiveTab('salary')}
          className={cn('flex-1 py-1.5 rounded-md text-xs font-medium transition-colors',
            activeTab === 'salary' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600')}>
          Salary Payslips ({payslips.length})
        </button>
        <button onClick={() => setActiveTab('commission')}
          className={cn('flex-1 py-1.5 rounded-md text-xs font-medium transition-colors',
            activeTab === 'commission' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600')}>
          Commission ({commissionPayouts.length})
        </button>
      </div>

      {activeTab === 'salary' && (
        <div className="space-y-2">
          {payslips.length === 0 ? (
            <div className="card p-8 text-center">
              <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No payslips yet</p>
            </div>
          ) : payslips.map(slip => (
            <div key={slip.id} className="card p-4 flex items-center gap-4">
              <div className="bg-red-50 p-2.5 rounded-lg flex-shrink-0">
                <FileText className="w-5 h-5 text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm">{getMonthName(slip.month)} {slip.year}</p>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 flex-wrap">
                  {slip.total_hours > 0
                    ? <span>{slip.total_hours}h roster pay</span>
                    : <span>Basic: {formatSGD(slip.basic_salary)}</span>
                  }
                  {slip.bonus_amount > 0 && <span>Bonus: {formatSGD(slip.bonus_amount)}</span>}
                  <span className="font-medium text-gray-900">Net: {formatSGD(slip.net_salary)}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  {slip.status === 'paid'
                    ? <><CheckCircle className="w-3 h-3 text-green-600" /><span className="text-xs text-green-600">Paid</span></>
                    : <><CheckCircle className="w-3 h-3 text-blue-600" /><span className="text-xs text-blue-600">Approved</span></>
                  }
                </div>
              </div>
              {slip.status !== 'draft' && (
                <button onClick={() => downloadPayslip(slip)}
                  className="btn-secondary text-xs py-1.5 flex items-center gap-1 flex-shrink-0">
                  <Download className="w-3.5 h-3.5" /> PDF
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {activeTab === 'commission' && (
        <div className="space-y-2">
          {commissionPayouts.length === 0 ? (
            <div className="card p-8 text-center">
              <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No commission payouts yet</p>
            </div>
          ) : commissionPayouts.map(p => (
            <div key={p.id} className="card p-4 flex items-center gap-4">
              <div className="bg-green-50 p-2.5 rounded-lg flex-shrink-0">
                <FileText className="w-5 h-5 text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm">
                  {p.period_start} — {p.period_end}
                </p>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 flex-wrap">
                  <span>PT: {formatSGD(p.pt_signup_commission_sgd + p.pt_session_commission_sgd)}</span>
                  <span>Membership: {formatSGD(p.membership_commission_sgd)}</span>
                  <span className="font-medium text-green-700">Total: {formatSGD(p.total_commission_sgd)}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  {p.status === 'paid'
                    ? <><CheckCircle className="w-3 h-3 text-green-600" /><span className="text-xs text-green-600">Paid</span></>
                    : <><CheckCircle className="w-3 h-3 text-blue-600" /><span className="text-xs text-blue-600">Approved</span></>
                  }
                </div>
              </div>
              {p.status !== 'draft' && (
                <button onClick={() => downloadCommissionSlip(p)}
                  className="btn-secondary text-xs py-1.5 flex items-center gap-1 flex-shrink-0">
                  <Download className="w-3.5 h-3.5" /> PDF
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
