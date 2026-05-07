'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { formatSGD, formatDate, getMonthName , getRoleLabel } from '@/lib/utils'
import { getCpfBracketRates, loadCpfBrackets } from '@/lib/cpf'
import {
  TrendingUp, Plus, CheckCircle, AlertCircle, X,
  Download, Users, DollarSign, Calendar, Search
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { StatusBanner } from '@/components/StatusBanner'
import { useCurrentUser } from '@/hooks/useCurrentUser'

export default function CommissionPayoutsPage() {
  const { user, loading } = useCurrentUser({ allowedRoles: ['business_ops', 'manager'] })


  const { logActivity } = useActivityLog()
  const [payouts, setPayouts] = useState<any[]>([])
  const [staff, setStaff] = useState<any[]>([])
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [showGenerateForm, setShowGenerateForm] = useState(false)
  const [genForm, setGenForm] = useState({
    period_month: new Date().getMonth() === 0 ? 12 : new Date().getMonth(), // previous month
    period_year: new Date().getMonth() === 0 ? new Date().getFullYear() - 1 : new Date().getFullYear(),
    user_ids: [] as string[], gym_id: '',
  })
  const [preview, setPreview] = useState<any[]>([])
  const [cpfBrackets, setCpfBrackets] = useState<any[]>([])
  const [existingDrafts, setExistingDrafts] = useState<string[]>([]) // user names with existing drafts
  const [showDraftWarning, setShowDraftWarning] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const { success, error, showMsg, showError, setError } = useToast()



  const loadData = async () => {
    if (!user) return

    // Load payouts
    let q = supabase.from('commission_payouts')
      .select('*, user:users!commission_payouts_user_id_fkey(full_name, role), gym:gyms(name)')
      .order('period_end', { ascending: false })
    if (user!.role === 'manager' && user!.manager_gym_id) q = q.eq('gym_id', user!.manager_gym_id)
    const { data: payoutData } = await q
    setPayouts(payoutData || [])

    // Load staff for generation (business_ops)
    if (user!.role === 'business_ops') {
      const { data: staffData } = await supabase.from('users')
        .select('*, trainer_gyms(gym_id), staff_payroll(is_cpf_liable)')
        .eq('is_archived', false).neq('role', 'admin').order('full_name')
      setStaff(staffData || [])

      // Load CPF brackets for AW calculation
      const brackets = await loadCpfBrackets(supabase)
      setCpfBrackets(brackets || [])
    }
  }

  useEffect(() => { loadData() }, [])

  if (loading) return <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600" /></div>
  if (!user) return null


  const generatePreview = async () => {
    if (!genForm.period_month || !genForm.period_year) { setError('Please select a period'); return }
    // Derive period_start and period_end from month/year
    const daysInMonth = new Date(genForm.period_year, genForm.period_month, 0).getDate()
    const period_start = `${genForm.period_year}-${String(genForm.period_month).padStart(2, '0')}-01`
    const period_end = `${genForm.period_year}-${String(genForm.period_month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`
    setGenerating(true); setError('')

    const results: any[] = []
    const targetStaff = genForm.user_ids.length > 0
      ? staff.filter(s => genForm.user_ids.includes(s.id))
      : staff

    for (const member of targetStaff) {
      // PT signup commissions (from packages created in period)
      // Packages eligible: manager_confirmed = true AND not yet paid
      // Confirmed by either manager or Biz Ops (escalated items)
      const { data: packages } = await supabase.from('packages')
        .select('signup_commission_sgd, gym_id')
        .eq('trainer_id', member.id)
        .eq('manager_confirmed', true)
        .eq('signup_commission_paid', false)
        .gte('created_at', period_start)
        .lte('created_at', period_end + 'T23:59:59')

      // PT session commissions: notes submitted AND manager_confirmed = true AND not yet paid
      // Confirmed by either manager or Biz Ops (escalated items)
      const { data: sessions } = await supabase.from('sessions')
        .select('session_commission_sgd, gym_id')
        .eq('trainer_id', member.id)
        .eq('status', 'completed')
        .eq('is_notes_complete', true)
        .eq('manager_confirmed', true)
        .eq('commission_paid', false)
        .gte('marked_complete_at', period_start)
        .lte('marked_complete_at', period_end + 'T23:59:59')

      // Membership sale commissions (confirmed in period) — from gym_memberships table
      const { data: memSales } = await supabase.from('gym_memberships')
        .select('commission_sgd, gym_id')
        .eq('sold_by_user_id', member.id)
        .eq('sale_status', 'confirmed')
        .eq('commission_paid', false)
        .gte('created_at', period_start)
        .lte('created_at', period_end + 'T23:59:59')

      const ptSignup = packages?.reduce((s, p) => s + (p.signup_commission_sgd || 0), 0) || 0
      const ptSession = sessions?.reduce((s, s2) => s + (s2.session_commission_sgd || 0), 0) || 0
      const membership = memSales?.reduce((s, m) => s + (m.commission_sgd || 0), 0) || 0
      const total = ptSignup + ptSession + membership

      if (total > 0) {
        const gymId = packages?.[0]?.gym_id || sessions?.[0]?.gym_id || memSales?.[0]?.gym_id || member.manager_gym_id || (member.trainer_gyms?.[0]?.gym_id)

        // ── CPF on commission (Additional Wages) ──────────────
        const isCpfLiable = !!member.staff_payroll?.is_cpf_liable
        let empCpfRate = 0, erCpfRate = 0, awSubject = 0, empCpf = 0, erCpf = 0

        if (isCpfLiable && cpfBrackets.length > 0) {
          const rates = getCpfBracketRates(cpfBrackets, member.date_of_birth, genForm.period_year, genForm.period_month)
          empCpfRate = rates.employee_rate
          erCpfRate = rates.employer_rate

          // Load YTD ordinary wages to compute remaining AW ceiling
          // AW ceiling = $102,000 - projected full-year OW
          // Also load low_income_flag to check CPF exemption
          const { data: ytdSlips } = await supabase.from('payslips')
            .select('basic_salary, employee_cpf_rate, low_income_flag')
            .eq('user_id', member.id).eq('year', genForm.period_year)
            .in('status', ['approved', 'paid'])
          // If ALL payslips this year are low-income exempt, skip commission CPF
          // (staff earning below $50/month total are fully exempt)
          const slips = ytdSlips ?? []
          const allLowIncome = slips.length > 0 && slips.every((p: any) => p.low_income_flag)
          if (allLowIncome) {
            empCpfRate = 0; erCpfRate = 0; awSubject = 0; empCpf = 0; erCpf = 0
          } else {
          const ytdOW = slips.reduce((s: number, p: any) => s + (p.basic_salary || 0), 0)
          const remainingMonths = 12 - (genForm.period_month - 1)
          const estMonthlyOW = slips.length > 0 ? ytdOW / slips.length : 0
          const projectedOW = ytdOW + (estMonthlyOW * remainingMonths)
          const awCeiling = Math.max(0, 102000 - projectedOW)

          // Load YTD AW already subjected to CPF from prior commission payouts
          const { data: priorPayouts } = await supabase.from('commission_payouts')
            .select('aw_subject_to_cpf')
            .eq('user_id', member.id).eq('is_cpf_liable', true)
            .in('status', ['approved', 'paid'])
            .gte('period_start', `${genForm.period_year}-01-01`)
            .lt('period_start', period_start)
          const ytdAWCpf = priorPayouts?.reduce((s: number, p: any) => s + (p.aw_subject_to_cpf || 0), 0) || 0
          const awRemaining = Math.max(0, awCeiling - ytdAWCpf)
          awSubject = Math.min(total, awRemaining)
          empCpf = Math.floor(awSubject * empCpfRate / 100)
          erCpf = Math.round(awSubject * erCpfRate / 100)
          } // end else (not all low income)
        }

        results.push({
          user_id: member.id, user_name: member.full_name, user_role: member.role,
          gym_id: gymId,
          pt_signup_commission_sgd: ptSignup, pt_session_commission_sgd: ptSession,
          membership_commission_sgd: membership, total_commission_sgd: total,
          pt_signups_count: packages?.length || 0,
          pt_sessions_count: sessions?.length || 0,
          membership_sales_count: memSales?.length || 0,
          is_cpf_liable: isCpfLiable,
          employee_cpf_rate: empCpfRate, employer_cpf_rate: erCpfRate,
          aw_subject_to_cpf: awSubject,
          employee_cpf_amount: empCpf, employer_cpf_amount: erCpf,
          net_commission_sgd: total - empCpf,
        })
      }
    }

    // Check for existing draft payouts for this period
    if (results.length > 0) {
      const userIds = results.map(r => r.user_id)
      // Derive period dates for draft check
      const dcDays = new Date(genForm.period_year, genForm.period_month, 0).getDate()
      const dc_start = `${genForm.period_year}-${String(genForm.period_month).padStart(2, '0')}-01`
      const dc_end = `${genForm.period_year}-${String(genForm.period_month).padStart(2, '0')}-${String(dcDays).padStart(2, '0')}`
      const { data: drafts } = await supabase.from('commission_payouts')
        .select('user_id, user:users!commission_payouts_user_id_fkey(full_name)')
        .in('user_id', userIds)
        .eq('period_start', dc_start)
        .eq('period_end', dc_end)
        .eq('status', 'draft')
      const draftNames = (drafts || []).map((d: any) => d.user?.full_name).filter(Boolean)
      setExistingDrafts(draftNames)
      if (draftNames.length > 0) setShowDraftWarning(true)
    } else {
      setExistingDrafts([])
      setShowDraftWarning(false)
    }
    setPreview(results)
    setGenerating(false)
    if (results.length === 0) setError('No commissions found for this period with unpaid items.')
  }

  const handleSavePayouts = async () => {
    if (preview.length === 0) return
    setSaving(true); setError('')
    // Derive period dates from month/year selection
    const daysInMonth = new Date(genForm.period_year, genForm.period_month, 0).getDate()
    const period_start = `${genForm.period_year}-${String(genForm.period_month).padStart(2, '0')}-01`
    const period_end = `${genForm.period_year}-${String(genForm.period_month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

    // Block: check for any approved/paid payouts in this period — never overwrite finalised records
    const userIds = preview.map(i => i.user_id)
    const { data: finalised } = await supabase.from('commission_payouts')
      .select('user_id, user:users!commission_payouts_user_id_fkey(full_name), status')
      .in('user_id', userIds)
      .eq('period_start', period_start).eq('period_end', period_end)
      .in('status', ['approved', 'paid'])
    if (finalised && finalised.length > 0) {
      const names = finalised.map((p: any) => `${p.user?.full_name} (${p.status})`).join(', ')
      showError(`Cannot overwrite finalised payouts: ${names}. Void them first before regenerating.`)
      setSaving(false)
      return
    }

    for (const item of preview) {
      await supabase.from('commission_payouts').upsert({
        user_id: item.user_id, gym_id: item.gym_id,
        period_start: period_start, period_end: period_end,
        pt_signup_commission_sgd: item.pt_signup_commission_sgd,
        pt_session_commission_sgd: item.pt_session_commission_sgd,
        membership_commission_sgd: item.membership_commission_sgd,
        pt_signups_count: item.pt_signups_count,
        pt_sessions_count: item.pt_sessions_count,
        membership_sales_count: item.membership_sales_count,
        is_cpf_liable: item.is_cpf_liable,
        employee_cpf_rate: item.employee_cpf_rate,
        employer_cpf_rate: item.employer_cpf_rate,
        aw_subject_to_cpf: item.aw_subject_to_cpf,
        employee_cpf_amount: item.employee_cpf_amount,
        employer_cpf_amount: item.employer_cpf_amount,
        status: 'draft',
        generated_by: user!.id,
        generated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,period_start,period_end' })
    }
    setShowDraftWarning(false)
    setExistingDrafts([])

    await loadData()
    setPreview([])
    setShowGenerateForm(false)
    setSaving(false)
    logActivity('create', 'Commission Payouts', `Generated ${preview.length} commission payout(s) as draft`)
    logActivity('create', 'Commission Payouts', `Generated ${preview.length} payout draft(s) for ${getMonthName(genForm.period_month)} ${genForm.period_year}`)
    showMsg(`${preview.length} commission payout(s) generated as draft`)
  }

  const handleStatusChange = async (payoutId: string, newStatus: 'approved' | 'paid') => {
    const update: any = { status: newStatus }
    if (newStatus === 'approved') { update.approved_by = user!.id; update.approved_at = new Date().toISOString() }
    if (newStatus === 'paid') {
      update.paid_at = new Date().toISOString()
      // Mark related items as paid
      const payout = payouts.find(p => p.id === payoutId)
      if (payout) {
        await supabase.from('sessions').update({ commission_paid: true })
          .eq('trainer_id', payout.user_id).eq('status', 'completed')
          .eq('is_notes_complete', true)
          .eq('manager_confirmed', true)
          .gte('marked_complete_at', payout.period_start)
          .lte('marked_complete_at', payout.period_end + 'T23:59:59')
        await supabase.from('packages').update({ signup_commission_paid: true })
          .eq('trainer_id', payout.user_id)
          .eq('manager_confirmed', true)
          .eq('signup_commission_paid', false)
          .gte('created_at', payout.period_start)
          .lte('created_at', payout.period_end + 'T23:59:59')
        await supabase.from('gym_memberships').update({ commission_paid: true, commission_payout_id: payoutId })
          .eq('sold_by_user_id', payout.user_id).eq('sale_status', 'confirmed')
          .gte('created_at', payout.period_start)
          .lte('created_at', payout.period_end + 'T23:59:59')
      }
    }
    await supabase.from('commission_payouts').update(update).eq('id', payoutId)
    const payout = payouts.find(p => p.id === payoutId)
    const staffName = payout?.user?.full_name || ''
    const period = payout?.period_start ? `${getMonthName(new Date(payout.period_start).getMonth() + 1)} ${new Date(payout.period_start).getFullYear()}` : ''
    logActivity(newStatus === 'approved' ? 'approve' : 'update', 'Commission Payouts', `${newStatus === 'approved' ? 'Approved' : 'Marked paid'}: ${staffName} — ${period}`)
    await loadData()
    showMsg(`Payout ${newStatus}`)
  }

  const isBizOps = user?.role === 'business_ops'
  const totalPending = payouts.filter(p => p.status === 'draft').reduce((s, p) => s + p.total_commission_sgd, 0)
  const totalPaid = payouts.filter(p => p.status === 'paid').reduce((s, p) => s + p.total_commission_sgd, 0)

  const filtered = payouts.filter(p => {
    const matchSearch = p.user?.full_name?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = filterStatus === 'all' || p.status === filterStatus
    return matchSearch && matchStatus
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Commission Payouts</h1>
          <p className="text-sm text-gray-500">PT package, session and membership sale commissions</p>
        </div>
        {isBizOps && (
          <button onClick={() => setShowGenerateForm(!showGenerateForm)} className="btn-primary flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Generate Payouts
          </button>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="stat-card"><p className="text-xs text-gray-500 mb-1">Total Payouts</p><p className="text-2xl font-bold text-gray-900">{payouts.length}</p></div>
        <div className="stat-card"><p className="text-xs text-gray-500 mb-1">Draft / Pending</p><p className="text-xl font-bold text-amber-600">{formatSGD(totalPending)}</p></div>
        <div className="stat-card"><p className="text-xs text-gray-500 mb-1">Paid Out</p><p className="text-xl font-bold text-green-700">{formatSGD(totalPaid)}</p></div>
      </div>

      <StatusBanner success={success} error={error} onDismissError={() => setError('')} />

      {/* Generate form */}
      {showGenerateForm && isBizOps && (
        <div className="card p-4 space-y-4 border-red-200">
          <div className="flex items-center justify-between"><h2 className="font-semibold text-gray-900 text-sm">Generate Commission Payouts</h2><button onClick={() => { setShowGenerateForm(false); setPreview([]) }}><X className="w-4 h-4 text-gray-400" /></button></div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Month *</label>
              <select className="input" value={genForm.period_month}
                onChange={e => setGenForm(f => ({ ...f, period_month: parseInt(e.target.value) }))}>
                {['January','February','March','April','May','June','July','August','September','October','November','December']
                  .map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Year *</label>
              <select className="input" value={genForm.period_year}
                onChange={e => setGenForm(f => ({ ...f, period_year: parseInt(e.target.value) }))}>
                {Array.from({ length: 3 }, (_, i) => new Date().getFullYear() - i)
                  .map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          <p className="text-xs text-gray-400 -mt-2">
            Period: 1–{new Date(genForm.period_year, genForm.period_month, 0).getDate()} {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][genForm.period_month - 1]} {genForm.period_year}
          </p>

          <div>
            <label className="label">Staff (leave empty for all)</label>
            <div className="space-y-1.5 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2">
              {staff.map(s => (
                <label key={s.id} className="flex items-center gap-2 cursor-pointer py-1">
                  <input type="checkbox" checked={genForm.user_ids.includes(s.id)}
                    onChange={() => setGenForm(f => ({ ...f, user_ids: f.user_ids.includes(s.id) ? f.user_ids.filter(id => id !== s.id) : [...f.user_ids, s.id] }))}
                    className="rounded border-gray-300 text-red-600" />
                  <span className="text-sm text-gray-700">{s.full_name}</span>
                  <span className="text-xs text-gray-400 ml-auto">{getRoleLabel(s.role)}</span>
                </label>
              ))}
            </div>
          </div>

          <button onClick={generatePreview} disabled={generating} className="btn-primary w-full disabled:opacity-50">
            {generating ? 'Calculating...' : 'Calculate Preview'}
          </button>

          {/* Preview */}
          {preview.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-900">Preview — {preview.length} staff with commissions</p>

              {/* Draft overwrite warning */}
              {showDraftWarning && existingDrafts.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-amber-800">Existing draft payouts will be overwritten</p>
                      <p className="text-xs text-amber-700 mt-0.5">
                        {existingDrafts.join(', ')} already {existingDrafts.length === 1 ? 'has' : 'have'} a draft payout for {getMonthName(genForm.period_month)} {genForm.period_year}. Saving will replace {existingDrafts.length === 1 ? 'it' : 'them'} with the new figures.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
                {preview.map((item, i) => (
                  <div key={i} className={cn('p-3 flex items-center gap-3', existingDrafts.includes(item.user_name) && 'bg-amber-50')}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900">{item.user_name}</p>
                        {existingDrafts.includes(item.user_name) && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">overwrites draft</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5 flex-wrap">
                        {item.pt_signups_count > 0 && <span>PT Signups: {formatSGD(item.pt_signup_commission_sgd)}</span>}
                        {item.pt_sessions_count > 0 && <span>PT Sessions: {formatSGD(item.pt_session_commission_sgd)}</span>}
                        {item.membership_sales_count > 0 && <span>Membership: {formatSGD(item.membership_commission_sgd)}</span>}
                        {item.is_cpf_liable && item.employee_cpf_amount > 0 && <span className="text-amber-600">Employee CPF ({item.employee_cpf_rate}%): -{formatSGD(item.employee_cpf_amount)}</span>}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-green-700">{formatSGD(item.net_commission_sgd)}</p>
                      {item.is_cpf_liable && item.employee_cpf_amount > 0 && <p className="text-xs text-gray-400">Gross: {formatSGD(item.total_commission_sgd)}</p>}
                    </div>
                  </div>
                ))}
                <div className="p-3 bg-gray-50 flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-900">Total</p>
                  <div className="text-right">
                    <p className="text-sm font-bold text-green-700">{formatSGD(preview.reduce((s, i) => s + i.net_commission_sgd, 0))}</p>
                    {preview.some(i => i.employee_cpf_amount > 0) && <p className="text-xs text-gray-400">Gross: {formatSGD(preview.reduce((s, i) => s + i.total_commission_sgd, 0))}</p>}
                  </div>
                </div>
              </div>
              <button onClick={handleSavePayouts} disabled={saving} className="btn-primary w-full">
                {saving ? 'Saving...' : showDraftWarning ? `Confirm & Overwrite ${existingDrafts.length} Draft(s)` : `Save ${preview.length} Payout Drafts`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="input pl-9" placeholder="Search by staff name..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1">
          {['all', 'draft', 'approved', 'paid'].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={cn('px-3 py-2 rounded-lg text-xs font-medium capitalize transition-colors',
                filterStatus === s ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Payouts list */}
      {filtered.length === 0 ? (
        <div className="card p-8 text-center"><TrendingUp className="w-10 h-10 text-gray-300 mx-auto mb-3" /><p className="text-gray-500 text-sm">No commission payouts found</p></div>
      ) : (
        <div className="space-y-2">
          {filtered.map(payout => (
            <div key={payout.id} className="card p-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-green-700 font-semibold text-sm">{payout.user?.full_name?.charAt(0)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900 text-sm">{payout.user?.full_name}</p>
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
                      payout.status === 'paid' ? 'bg-green-100 text-green-700' :
                      payout.status === 'approved' ? 'bg-blue-100 text-blue-700' : 'badge-pending')}>
                      {payout.status.charAt(0).toUpperCase() + payout.status.slice(1)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">{payout.period_start} — {payout.period_end} · {payout.gym?.name}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                    {payout.pt_signups_count > 0 && <span>PT Sign-ups: {formatSGD(payout.pt_signup_commission_sgd)}</span>}
                    {payout.pt_sessions_count > 0 && <span>Sessions: {formatSGD(payout.pt_session_commission_sgd)}</span>}
                    {payout.membership_sales_count > 0 && <span>Memberships: {formatSGD(payout.membership_commission_sgd)}</span>}
                    <span className="font-bold text-green-700">Total: {formatSGD(payout.total_commission_sgd)}</span>
                  </div>
                  {payout.paid_at && <p className="text-xs text-green-600 mt-0.5">Paid {formatDate(payout.paid_at)}</p>}
                </div>
                {isBizOps && (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {payout.status === 'draft' && (
                      <button onClick={() => handleStatusChange(payout.id, 'approved')} className="btn-primary text-xs py-1.5">Approve</button>
                    )}
                    {payout.status === 'approved' && (
                      <button onClick={() => handleStatusChange(payout.id, 'paid')} className="btn-primary text-xs py-1.5">Mark Paid</button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
