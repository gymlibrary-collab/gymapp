'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { formatSGD, getMonthName } from '@/lib/utils'
import { getGymStaffIds } from '@/lib/dashboard'
import { CreditCard, Package, Banknote, Download, Users, Building2 } from 'lucide-react'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { PageSpinner } from '@/components/PageSpinner'

interface TrainerRow {
  id: string; name: string; nickname: string
  members: number; packages: number; sessionsCompleted: number; sessionsScheduled: number
  commissionEarned: number; commissionPaid: number
}
interface Stats {
  memCount: number; memNewCount: number; memRenewalCount: number
  memRevenue: number; memCommission: number
  activeMembersTotal: number; activeMembershipOnly: number; activePtOnly: number; activeBoth: number
  ptCount: number; sessionCount: number; sessionScheduled: number
  ptRevenue: number; ptSignupComm: number; ptSessionComm: number
  totalCommission: number
  salaryCost: number; employerCPF: number; totalPayrollCost: number
  trainers: TrainerRow[]
}
interface GymCard {
  id: string; name: string
  activeMembers: number; memRevenue: number; ptRevenue: number
  payrollCost: number; totalCommission: number
}
const EMPTY: Stats = {
  memCount:0,memNewCount:0,memRenewalCount:0,memRevenue:0,memCommission:0,
  activeMembersTotal:0,activeMembershipOnly:0,activePtOnly:0,activeBoth:0,
  ptCount:0,sessionCount:0,sessionScheduled:0,ptRevenue:0,ptSignupComm:0,ptSessionComm:0,
  totalCommission:0,salaryCost:0,employerCPF:0,totalPayrollCost:0,trainers:[]
}

export default function ReportsPage() {
  const { user, loading } = useCurrentUser({ allowedRoles: ['manager', 'business_ops'] })
  const { logActivity } = useActivityLog()
  const supabase = createClient()
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear]   = useState(now.getFullYear())
  const [gyms, setGyms]   = useState<any[]>([])
  const [selectedGym, setSelectedGym] = useState<string>('all')
  const [stats, setStats]     = useState<Stats>(EMPTY)
  const [gymCards, setGymCards] = useState<GymCard[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [pdfLoading, setPdfLoading]   = useState(false)
  const isBizOps = user?.role === 'business_ops'

  const monthOptions: { month: number; year: number; label: string }[] = []
  for (let i = 0; i < 36; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    monthOptions.push({ month: d.getMonth()+1, year: d.getFullYear(), label: `${getMonthName(d.getMonth()+1)} ${d.getFullYear()}` })
  }

  useEffect(() => {
    if (!user || !isBizOps) return
    supabase.from('gyms').select('id, name').eq('is_active', true).order('name')
      .then(({ data }) => setGyms(data || []))
  }, [user])

  const load = async () => {
    if (!user) return
    logActivity('page_view', 'Reports', `Viewed reports — ${getMonthName(month)} ${year}`)
    const monthStart = `${year}-${String(month).padStart(2,'0')}-01`
    const monthEnd   = new Date(year, month, 0).toISOString().split('T')[0]
    const gymId = isBizOps ? (selectedGym === 'all' ? null : selectedGym) : user.manager_gym_id

    // Per-gym cards for Biz Ops all gyms
    if (isBizOps && selectedGym === 'all') {
      const { data: allGyms } = await supabase.from('gyms').select('id, name').eq('is_active', true).order('name')
      const cards: GymCard[] = []
      for (const g of allGyms || []) {
        const { data: mem } = await supabase.from('gym_memberships').select('price_sgd,commission_sgd').eq('gym_id',g.id).eq('sale_status','confirmed').gte('created_at',monthStart).lte('created_at',monthEnd+'T23:59:59')
        const { data: pt }  = await supabase.from('packages').select('total_price_sgd,signup_commission_sgd').eq('gym_id',g.id).eq('manager_confirmed',true).neq('status','cancelled').gte('created_at',monthStart).lte('created_at',monthEnd+'T23:59:59')
        const { data: sess }= await supabase.from('sessions').select('session_commission_sgd').eq('gym_id',g.id).eq('status','completed').eq('manager_confirmed',true).eq('is_notes_complete',true).gte('marked_complete_at',monthStart).lte('marked_complete_at',monthEnd+'T23:59:59')
        const { count: activeCnt } = await supabase.from('gym_memberships').select('id',{count:'exact',head:true}).eq('gym_id',g.id).eq('status','active').eq('sale_status','confirmed')
        const sIds = await getGymStaffIds(supabase, g.id)
        let payroll = 0
        if (sIds.length > 0) {
          const { data: pays } = await supabase.from('payslips').select('gross_salary,employer_cpf_amount').eq('month',month).eq('year',year).in('status',['approved','paid']).in('user_id',sIds)
          payroll = (pays||[]).reduce((s:number,p:any)=>s+(p.gross_salary||0)+(p.employer_cpf_amount||0),0)
        }
        const memRev = (mem||[]).reduce((s:number,m:any)=>s+(m.price_sgd||0),0)
        const ptRev  = (pt||[]).reduce((s:number,p:any)=>s+(p.total_price_sgd||0),0)
        const comm   = (mem||[]).reduce((s:number,m:any)=>s+(m.commission_sgd||0),0)+(pt||[]).reduce((s:number,p:any)=>s+(p.signup_commission_sgd||0),0)+(sess||[]).reduce((s:number,s2:any)=>s+(s2.session_commission_sgd||0),0)
        cards.push({id:g.id,name:g.name,activeMembers:activeCnt||0,memRevenue:memRev,ptRevenue:ptRev,payrollCost:payroll,totalCommission:comm})
      }
      setGymCards(cards)
    } else { setGymCards([]) }

    // Memberships
    let memQ = supabase.from('gym_memberships').select('id,member_id,price_sgd,commission_sgd').eq('sale_status','confirmed').gte('created_at',monthStart).lte('created_at',monthEnd+'T23:59:59')
    if (gymId) memQ = memQ.eq('gym_id', gymId)
    const { data: memSales } = await memQ

    // New vs renewal
    let newCount = 0, renewalCount = 0
    for (const m of memSales || []) {
      const { count } = await supabase.from('gym_memberships').select('id',{count:'exact',head:true}).eq('member_id',m.member_id).eq('sale_status','confirmed').lt('created_at',monthStart)
      if ((count||0) === 0) newCount++; else renewalCount++
    }

    // Active members breakdown
    let actMemQ = supabase.from('gym_memberships').select('member_id').eq('status','active').eq('sale_status','confirmed')
    if (gymId) actMemQ = actMemQ.eq('gym_id',gymId)
    const { data: activeMem } = await actMemQ
    const activeMemberIds: Set<string> = new Set((activeMem||[]).map((m:any)=>m.member_id))

    let actPkgQ = supabase.from('packages').select('member_id,secondary_member_id').eq('status','active').eq('manager_confirmed',true)
    if (gymId) actPkgQ = actPkgQ.eq('gym_id',gymId)
    const { data: activePkgs } = await actPkgQ
    const activePkgIds: Set<string> = new Set()
    ;(activePkgs||[]).forEach((p:any)=>{ if(p.member_id) activePkgIds.add(p.member_id); if(p.secondary_member_id) activePkgIds.add(p.secondary_member_id) })

    const bothIds    = Array.from(activeMemberIds).filter((id:string)=>activePkgIds.has(id))
    const memOnlyIds = Array.from(activeMemberIds).filter((id:string)=>!activePkgIds.has(id))
    const pkgOnlyIds = Array.from(activePkgIds).filter((id:string)=>!activeMemberIds.has(id))
    const totalActive = new Set([...Array.from(activeMemberIds),...Array.from(activePkgIds)]).size

    // PT packages
    let ptQ = supabase.from('packages').select('id,trainer_id,member_id,secondary_member_id,total_price_sgd,signup_commission_sgd,signup_commission_paid').eq('manager_confirmed',true).neq('status','cancelled').gte('created_at',monthStart).lte('created_at',monthEnd+'T23:59:59')
    if (gymId) ptQ = ptQ.eq('gym_id',gymId)
    const { data: ptSales } = await ptQ

    // Sessions completed
    let sessQ = supabase.from('sessions').select('trainer_id,session_commission_sgd,commission_paid').eq('status','completed').eq('manager_confirmed',true).eq('is_notes_complete',true).gte('marked_complete_at',monthStart).lte('marked_complete_at',monthEnd+'T23:59:59')
    if (gymId) sessQ = sessQ.eq('gym_id',gymId)
    const { data: ptSessions } = await sessQ

    // Sessions scheduled
    // Sessions scheduled — current month + next month
    const nextMonth = month === 12 ? 1 : month + 1
    const nextMonthYear = month === 12 ? year + 1 : year
    const nextMonthEnd = new Date(nextMonthYear, nextMonth, 0).toISOString().split('T')[0]
    let schedQ = supabase.from('sessions').select('trainer_id').eq('status','scheduled').gte('scheduled_at',new Date().toISOString()).lte('scheduled_at',nextMonthEnd+'T23:59:59')
    if (gymId) schedQ = schedQ.eq('gym_id',gymId)
    const { data: scheduled } = await schedQ

    // Trainers
    let trainerQ = supabase.from('users').select('id,full_name,nickname').eq('role','trainer').eq('is_archived',false)
    if (gymId) {
      const { data: tgRows } = await supabase.from('trainer_gyms').select('trainer_id').eq('gym_id',gymId)
      const tIds = (tgRows||[]).map((r:any)=>r.trainer_id)
      if (tIds.length > 0) trainerQ = trainerQ.in('id',tIds)
    }
    const { data: trainers } = await trainerQ
    // Active packages per trainer (all time — for member count)
    let activePkgQ = supabase.from('packages').select('trainer_id,member_id,secondary_member_id').eq('status','active').eq('manager_confirmed',true)
    if (gymId) activePkgQ = activePkgQ.eq('gym_id',gymId)
    const { data: activePkgsForTrainer } = await activePkgQ

    const trainerRows: TrainerRow[] = (trainers||[]).map((t:any) => {
      const myPkgs  = (ptSales||[]).filter((p:any)=>p.trainer_id===t.id)
      const mySess  = (ptSessions||[]).filter((s:any)=>s.trainer_id===t.id)
      const mySched = (scheduled||[]).filter((s:any)=>s.trainer_id===t.id)
      // Members = all active package members (not just this month)
      const mIds = new Set<string>()
      ;(activePkgsForTrainer||[]).filter((p:any)=>p.trainer_id===t.id).forEach((p:any)=>{ if(p.member_id) mIds.add(p.member_id); if(p.secondary_member_id) mIds.add(p.secondary_member_id) })
      const signupComm = myPkgs.reduce((s:number,p:any)=>s+(p.signup_commission_sgd||0),0)
      const sessComm   = mySess.reduce((s:number,s2:any)=>s+(s2.session_commission_sgd||0),0)
      const signupPaid = myPkgs.filter((p:any)=>p.signup_commission_paid).reduce((s:number,p:any)=>s+(p.signup_commission_sgd||0),0)
      const sessPaid   = mySess.filter((s:any)=>s.commission_paid).reduce((s:number,s2:any)=>s+(s2.session_commission_sgd||0),0)
      return { id:t.id, name:t.full_name, nickname:t.nickname||t.full_name.split(' ')[0], members:mIds.size, packages:myPkgs.length, sessionsCompleted:mySess.length, sessionsScheduled:mySched.length, commissionEarned:signupComm+sessComm, commissionPaid:signupPaid+sessPaid }
    })

    // Payroll — Biz Ops only
    let payslips: any[] = []
    if (isBizOps) {
      const sIds = gymId ? await getGymStaffIds(supabase, gymId) : []
      let payQ = supabase.from('payslips').select('gross_salary,employee_cpf_amount,employer_cpf_amount').eq('month',month).eq('year',year).in('status',['approved','paid'])
      if (sIds.length > 0) payQ = payQ.in('user_id',sIds)
      const { data: pays } = await payQ
      payslips = pays || []
    }

    const memRevenue    = (memSales||[]).reduce((s:number,m:any)=>s+(m.price_sgd||0),0)
    const memCommission = (memSales||[]).reduce((s:number,m:any)=>s+(m.commission_sgd||0),0)
    const ptRevenue     = (ptSales||[]).reduce((s:number,p:any)=>s+(p.total_price_sgd||0),0)
    const ptSignupComm  = (ptSales||[]).reduce((s:number,p:any)=>s+(p.signup_commission_sgd||0),0)
    const ptSessionComm = (ptSessions||[]).reduce((s:number,p:any)=>s+(p.session_commission_sgd||0),0)
    const salaryCost    = (payslips||[]).reduce((s:number,p:any)=>s+(p.gross_salary||0),0)
    const employerCPF   = (payslips||[]).reduce((s:number,p:any)=>s+(p.employer_cpf_amount||0),0)

    setStats({ memCount:(memSales||[]).length, memNewCount:newCount, memRenewalCount:renewalCount, memRevenue, memCommission, activeMembersTotal:totalActive, activeMembershipOnly:memOnlyIds.length, activePtOnly:pkgOnlyIds.length, activeBoth:bothIds.length, ptCount:(ptSales||[]).length, sessionCount:(ptSessions||[]).length, sessionScheduled:(scheduled||[]).length, ptRevenue, ptSignupComm, ptSessionComm, totalCommission:memCommission+ptSignupComm+ptSessionComm, salaryCost, employerCPF, totalPayrollCost:salaryCost+employerCPF, trainers:trainerRows })
  }

  useEffect(() => {
    if (!user) return
    load().finally(() => setDataLoading(false))
  }, [user, month, year, selectedGym])

  const handlePdf = async () => {
    setPdfLoading(true)
    try {
      const { default: jsPDF } = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const periodLabel = `${getMonthName(month)} ${year}`
      const gymLabel = isBizOps ? (selectedGym === 'all' ? 'All Gyms' : gyms.find((g:any)=>g.id===selectedGym)?.name||''): ''
      let y = 20
      doc.setFontSize(18); doc.setFont('helvetica','bold')
      doc.text('Summary Report', 14, y); y += 8
      doc.setFontSize(11); doc.setFont('helvetica','normal')
      doc.text(`Period: ${periodLabel}${gymLabel ? '  |  Gym: '+gymLabel : ''}`, 14, y); y += 10

      if (gymCards.length > 0) {
        doc.setFontSize(13); doc.setFont('helvetica','bold'); doc.text('Per-Gym Summary', 14, y); y += 6
        autoTable(doc, { startY:y, head:[['Gym','Active Members','Mem Revenue','PT Revenue','Payroll Cost','Total Commission']], body:gymCards.map(g=>[g.name,g.activeMembers,formatSGD(g.memRevenue),formatSGD(g.ptRevenue),formatSGD(g.payrollCost),formatSGD(g.totalCommission)]), styles:{fontSize:9}, headStyles:{fillColor:[204,0,0]}, margin:{left:14} })
        y = (doc as any).lastAutoTable.finalY + 10
      }
      doc.setFontSize(13); doc.setFont('helvetica','bold'); doc.text('Gym Membership', 14, y); y += 6
      autoTable(doc, { startY:y, body:[['Total Sales',stats.memCount,'New Members',stats.memNewCount],['Renewals',stats.memRenewalCount,'Revenue',formatSGD(stats.memRevenue)],['Staff Commissions',formatSGD(stats.memCommission),'','']], styles:{fontSize:9}, margin:{left:14} })
      y = (doc as any).lastAutoTable.finalY + 6
      doc.setFontSize(13); doc.setFont('helvetica','bold'); doc.text('Active Members (current)', 14, y); y += 6
      autoTable(doc, { startY:y, body:[['Total Active',stats.activeMembersTotal,'Membership only',stats.activeMembershipOnly],['PT Package only',stats.activePtOnly,'Both',stats.activeBoth]], styles:{fontSize:9}, margin:{left:14} })
      y = (doc as any).lastAutoTable.finalY + 6
      doc.setFontSize(13); doc.setFont('helvetica','bold'); doc.text('Personal Training', 14, y); y += 6
      autoTable(doc, { startY:y, body:[['Packages Sold',stats.ptCount,'Sessions Completed',stats.sessionCount],['Sessions Scheduled',stats.sessionScheduled,'PT Revenue',formatSGD(stats.ptRevenue)],['PT Commissions',formatSGD(stats.ptSignupComm+stats.ptSessionComm),'','']], styles:{fontSize:9}, margin:{left:14} })
      y = (doc as any).lastAutoTable.finalY + 6
      if (stats.trainers.length > 0) {
        if (y > 220) { doc.addPage(); y = 20 }
        doc.setFontSize(13); doc.setFont('helvetica','bold'); doc.text('Trainer Breakdown', 14, y); y += 6
        autoTable(doc, { startY:y, head:[['Trainer','Members','Packages','Done','Scheduled','Earned','Paid']], body:stats.trainers.map(t=>[t.nickname,t.members,t.packages,t.sessionsCompleted,t.sessionsScheduled,formatSGD(t.commissionEarned),formatSGD(t.commissionPaid)]), styles:{fontSize:9}, headStyles:{fillColor:[204,0,0]}, margin:{left:14} })
        y = (doc as any).lastAutoTable.finalY + 6
      }
      if (y > 230) { doc.addPage(); y = 20 }
      doc.setFontSize(13); doc.setFont('helvetica','bold'); doc.text('Payroll Costs', 14, y); y += 6
      autoTable(doc, { startY:y, body:[['Gross Salary',formatSGD(stats.salaryCost),'Employer CPF',formatSGD(stats.employerCPF)],['Total Payroll Cost',formatSGD(stats.totalPayrollCost),'Total Commissions',formatSGD(stats.totalCommission)]], styles:{fontSize:9}, margin:{left:14} })
      doc.save(`Report_${periodLabel.replace(' ','_')}${gymLabel?'_'+gymLabel.replace(/\s/g,'_'):''}.pdf`)
    } catch(e) { console.error('PDF error', e) }
    setPdfLoading(false)
  }

  if (loading || !user || dataLoading) return <PageSpinner />

  const periodLabel = `${getMonthName(month)} ${year}`
  const gymLabel = isBizOps && selectedGym !== 'all' ? gyms.find((g:any)=>g.id===selectedGym)?.name||'' : isBizOps ? 'All Gyms' : ''

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Summary Reports</h1>
          <p className="text-sm text-gray-500">{periodLabel}{gymLabel ? ` — ${gymLabel}` : ''}</p>
        </div>
        <button onClick={handlePdf} disabled={pdfLoading} className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-40">
          <Download className="w-4 h-4" />{pdfLoading ? 'Generating...' : 'Download PDF'}
        </button>
      </div>

      <div className="card p-4 flex flex-wrap gap-3">
        <div>
          <label className="label">Period</label>
          <select className="input" value={`${year}-${month}`} onChange={e => { const [y,m] = e.target.value.split('-'); setYear(+y); setMonth(+m) }}>
            {monthOptions.map(o => <option key={`${o.year}-${o.month}`} value={`${o.year}-${o.month}`}>{o.label}</option>)}
          </select>
        </div>
        {isBizOps && (
          <div>
            <label className="label">Gym</label>
            <select className="input" value={selectedGym} onChange={e => setSelectedGym(e.target.value)}>
              <option value="all">All Gyms</option>
              {gyms.map((g:any) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {isBizOps && selectedGym === 'all' && gymCards.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2"><Building2 className="w-4 h-4 text-red-600"/>Per-Gym Overview</h2>
          {gymCards.map(g => (
            <div key={g.id} className="card p-4">
              <p className="font-semibold text-gray-900 text-sm mb-3">{g.name}</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="stat-card"><p className="text-xs text-gray-500">Active Members</p><p className="text-xl font-bold">{g.activeMembers}</p></div>
                <div className="stat-card"><p className="text-xs text-gray-500">Mem Revenue</p><p className="text-lg font-bold">{formatSGD(g.memRevenue)}</p></div>
                <div className="stat-card"><p className="text-xs text-gray-500">PT Revenue</p><p className="text-lg font-bold">{formatSGD(g.ptRevenue)}</p></div>
                <div className="stat-card"><p className="text-xs text-gray-500">Payroll Cost</p><p className="text-lg font-bold">{formatSGD(g.payrollCost)}</p></div>
                <div className="stat-card col-span-2"><p className="text-xs text-gray-500">Total Commissions</p><p className="text-lg font-bold text-green-700">{formatSGD(g.totalCommission)}</p></div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card p-4 space-y-4">
        <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2"><CreditCard className="w-4 h-4 text-red-600"/>Gym Membership</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="stat-card"><p className="text-xs text-gray-500">Total Sales</p><p className="text-2xl font-bold">{stats.memCount}</p></div>
          <div className="stat-card"><p className="text-xs text-gray-500">Revenue</p><p className="text-xl font-bold">{formatSGD(stats.memRevenue)}</p></div>
          <div className="stat-card"><p className="text-xs text-gray-500">New Members</p><p className="text-xl font-bold text-blue-700">{stats.memNewCount}</p></div>
          <div className="stat-card"><p className="text-xs text-gray-500">Renewals</p><p className="text-xl font-bold text-amber-700">{stats.memRenewalCount}</p></div>
          <div className="stat-card col-span-2"><p className="text-xs text-gray-500">Staff Commissions Earned</p><p className="text-xl font-bold text-green-700">{formatSGD(stats.memCommission)}</p></div>
        </div>
      </div>

      <div className="card p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2"><Users className="w-4 h-4 text-red-600"/>Active Members (current)</h2>
          <span className="text-xs text-gray-400">As of today — not historical</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="stat-card col-span-2 bg-blue-50 border-blue-100"><p className="text-xs text-blue-600">Total Active</p><p className="text-2xl font-bold text-blue-800">{stats.activeMembersTotal}</p></div>
          <div className="stat-card"><p className="text-xs text-gray-500">Membership only</p><p className="text-xl font-bold">{stats.activeMembershipOnly}</p></div>
          <div className="stat-card"><p className="text-xs text-gray-500">PT Package only</p><p className="text-xl font-bold">{stats.activePtOnly}</p></div>
          <div className="stat-card col-span-2"><p className="text-xs text-gray-500">Both membership & PT package</p><p className="text-xl font-bold text-green-700">{stats.activeBoth}</p></div>
        </div>
      </div>

      <div className="card p-4 space-y-4">
        <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2"><Package className="w-4 h-4 text-red-600"/>Personal Training</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="stat-card"><p className="text-xs text-gray-500">Packages Sold</p><p className="text-2xl font-bold">{stats.ptCount}</p></div>
          <div className="stat-card"><p className="text-xs text-gray-500">Sessions Completed</p><p className="text-2xl font-bold">{stats.sessionCount}</p></div>
          <div className="stat-card"><p className="text-xs text-gray-500">Sessions Scheduled (now → end next month)</p><p className="text-xl font-bold text-blue-700">{stats.sessionScheduled}</p></div>
          <div className="stat-card"><p className="text-xs text-gray-500">PT Revenue</p><p className="text-xl font-bold">{formatSGD(stats.ptRevenue)}</p></div>
          <div className="stat-card col-span-2"><p className="text-xs text-gray-500">PT Commissions (sign-up + session)</p><p className="text-xl font-bold text-green-700">{formatSGD(stats.ptSignupComm+stats.ptSessionComm)}</p></div>
        </div>
      </div>

      {stats.trainers.length > 0 && (
        <div className="card p-4 space-y-4">
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2"><Users className="w-4 h-4 text-red-600"/>Trainer Breakdown</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-2 text-xs text-gray-500 font-medium">Trainer</th>
                  <th className="text-right py-2 px-2 text-xs text-gray-500 font-medium">Members</th>
                  <th className="text-right py-2 px-2 text-xs text-gray-500 font-medium">Pkgs</th>
                  <th className="text-right py-2 px-2 text-xs text-gray-500 font-medium">Done</th>
                  <th className="text-right py-2 px-2 text-xs text-gray-500 font-medium">Sched</th>
                  <th className="text-right py-2 px-2 text-xs text-gray-500 font-medium">Earned</th>
                  <th className="text-right py-2 px-2 text-xs text-gray-500 font-medium">Paid</th>
                </tr>
              </thead>
              <tbody>
                {stats.trainers.map((t,i) => (
                  <tr key={t.id} className={i%2===0?'bg-gray-50':''}>
                    <td className="py-2 px-2 font-medium text-gray-900">{t.nickname}</td>
                    <td className="py-2 px-2 text-right text-gray-700">{t.members}</td>
                    <td className="py-2 px-2 text-right text-gray-700">{t.packages}</td>
                    <td className="py-2 px-2 text-right text-gray-700">{t.sessionsCompleted}</td>
                    <td className="py-2 px-2 text-right text-blue-700">{t.sessionsScheduled}</td>
                    <td className="py-2 px-2 text-right text-green-700 font-medium">{formatSGD(t.commissionEarned)}</td>
                    <td className="py-2 px-2 text-right text-gray-500">{formatSGD(t.commissionPaid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isBizOps && (
        <div className="card p-4 space-y-4">
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2"><Banknote className="w-4 h-4 text-red-600"/>Payroll Costs</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="stat-card"><p className="text-xs text-gray-500">Gross Salary</p><p className="text-xl font-bold">{formatSGD(stats.salaryCost)}</p></div>
            <div className="stat-card"><p className="text-xs text-gray-500">Employer CPF</p><p className="text-xl font-bold">{formatSGD(stats.employerCPF)}</p></div>
            <div className="stat-card col-span-2 bg-red-50 border-red-100"><p className="text-xs text-red-600">Total Payroll Cost (excl. commission)</p><p className="text-xl font-bold text-red-700">{formatSGD(stats.totalPayrollCost)}</p></div>
          </div>
        </div>
      )}

      <div className="card p-4 bg-gray-50">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">Total Staff Commissions</p>
            <p className="text-xs text-gray-400 mt-0.5">Membership + PT sign-up + PT session</p>
          </div>
          <p className="text-lg font-bold text-green-700">{formatSGD(stats.totalCommission)}</p>
        </div>
      </div>
    </div>
  )
}
