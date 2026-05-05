'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { formatSGD, formatDate, getMonthName , getRoleLabel } from '@/lib/utils'
import {
  TrendingUp, Plus, CheckCircle, AlertCircle, X,
  Download, Users, DollarSign, Calendar, Search
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { StatusBanner } from '@/components/StatusBanner'

export default function CommissionPayoutsPage() {
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [payouts, setPayouts] = useState<any[]>([])
  const [staff, setStaff] = useState<any[]>([])
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [showGenerateForm, setShowGenerateForm] = useState(false)
  const [genForm, setGenForm] = useState({
    period_start: '', period_end: '',
    user_ids: [] as string[], gym_id: '',
  })
  const [preview, setPreview] = useState<any[]>([])
  const router = useRouter()
  const supabase = createClient()

  const { success, error, showMsg, showError, setError } = useToast()

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    // Route guard
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) { router.replace('/dashboard'); return }
    const { data: me } = await supabase.from('users').select('role').eq('id', authUser.id).single()
    if (!me || me.role !== 'business_ops') { router.replace('/dashboard'); return }

    const { data: userData } = await supabase.from('users').select('*').eq('id', authUser.id).single()
    setCurrentUser(userData)

    // Load payouts
    let q = supabase.from('commission_payouts')
      .select('*, user:users(full_name, role), gym:gyms(name)')
      .order('period_end', { ascending: false })
    if (userData.role === 'manager' && userData.manager_gym_id) q = q.eq('gym_id', userData.manager_gym_id)
    const { data: payoutData } = await q
    setPayouts(payoutData || [])

    // Load staff for generation (business_ops)
    if (userData.role === 'business_ops') {
      const { data: staffData } = await supabase.from('users').select('*, trainer_gyms(gym_id)')
        .eq('is_archived', false).neq('role', 'admin').order('full_name')
      setStaff(staffData || [])
    }
  }

  const generatePreview = async () => {
    if (!genForm.period_start || !genForm.period_end) { setError('Please select a period'); return }
    setGenerating(true); setError('')

    const results: any[] = []
    const targetStaff = genForm.user_ids.length > 0
      ? staff.filter(s => genForm.user_ids.includes(s.id))
      : staff

    for (const member of targetStaff) {
      // PT signup commissions (from packages created in period)
      const { data: packages } = await supabase.from('packages')
        .select('signup_commission_sgd, gym_id')
        .eq('trainer_id', member.id)
        .eq('signup_commission_paid', false)
        .gte('created_at', genForm.period_start)
        .lte('created_at', genForm.period_end + 'T23:59:59')

      // PT session commissions (completed sessions in period)
      const { data: sessions } = await supabase.from('sessions')
        .select('session_commission_sgd, gym_id')
        .eq('trainer_id', member.id)
        .eq('status', 'completed')
        .eq('commission_paid', false)
        .gte('marked_complete_at', genForm.period_start)
        .lte('marked_complete_at', genForm.period_end + 'T23:59:59')

      // Membership sale commissions (confirmed in period) — from gym_memberships table
      const { data: memSales } = await supabase.from('gym_memberships')
        .select('commission_sgd, gym_id')
        .eq('sold_by_user_id', member.id)
        .eq('sale_status', 'confirmed')
        .eq('commission_paid', false)
        .gte('created_at', genForm.period_start)
        .lte('created_at', genForm.period_end + 'T23:59:59')

      const ptSignup = packages?.reduce((s, p) => s + (p.signup_commission_sgd || 0), 0) || 0
      const ptSession = sessions?.reduce((s, s2) => s + (s2.session_commission_sgd || 0), 0) || 0
      const membership = memSales?.reduce((s, m) => s + (m.commission_sgd || 0), 0) || 0
      const total = ptSignup + ptSession + membership

      if (total > 0) {
        // Determine gym_id (use most common gym from transactions)
        const gymId = packages?.[0]?.gym_id || sessions?.[0]?.gym_id || memSales?.[0]?.gym_id || member.manager_gym_id || (member.trainer_gyms?.[0]?.gym_id)

        results.push({
          user_id: member.id, user_name: member.full_name, user_role: member.role,
          gym_id: gymId,
          pt_signup_commission_sgd: ptSignup, pt_session_commission_sgd: ptSession,
          membership_commission_sgd: membership, total_commission_sgd: total,
          pt_signups_count: packages?.length || 0,
          pt_sessions_count: sessions?.length || 0,
          membership_sales_count: memSales?.length || 0,
        })
      }
    }

    setPreview(results)
    setGenerating(false)
    if (results.length === 0) setError('No commissions found for this period with unpaid items.')
  }

  const handleSavePayouts = async () => {
    if (preview.length === 0) return
    setSaving(true); setError('')
    const { data: { user: authUser } } = await supabase.auth.getUser()

    for (const item of preview) {
      await supabase.from('commission_payouts').upsert({
        user_id: item.user_id, gym_id: item.gym_id,
        period_start: genForm.period_start, period_end: genForm.period_end,
        pt_signup_commission_sgd: item.pt_signup_commission_sgd,
        pt_session_commission_sgd: item.pt_session_commission_sgd,
        membership_commission_sgd: item.membership_commission_sgd,
        pt_signups_count: item.pt_signups_count,
        pt_sessions_count: item.pt_sessions_count,
        membership_sales_count: item.membership_sales_count,
        status: 'draft',
        generated_by: authUser!.id,
        generated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,period_start,period_end' })
    }

    await loadData()
    setPreview([])
    setShowGenerateForm(false)
    setSaving(false)
    showMsg(`${preview.length} commission payout(s) generated as draft`)
  }

  const handleStatusChange = async (payoutId: string, newStatus: 'approved' | 'paid') => {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    const update: any = { status: newStatus }
    if (newStatus === 'approved') { update.approved_by = authUser!.id; update.approved_at = new Date().toISOString() }
    if (newStatus === 'paid') {
      update.paid_at = new Date().toISOString()
      // Mark related items as paid
      const payout = payouts.find(p => p.id === payoutId)
      if (payout) {
        await supabase.from('sessions').update({ commission_paid: true })
          .eq('trainer_id', payout.user_id).eq('status', 'completed')
          .gte('marked_complete_at', payout.period_start)
          .lte('marked_complete_at', payout.period_end + 'T23:59:59')
        await supabase.from('packages').update({ signup_commission_paid: true })
          .eq('trainer_id', payout.user_id)
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
    await loadData()
    showMsg(`Payout ${newStatus}`)
  }

  const isBizOps = currentUser?.role === 'business_ops'
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
            <div><label className="label">Period Start *</label><input className="input" type="date" value={genForm.period_start} onChange={e => setGenForm(f => ({ ...f, period_start: e.target.value }))} /></div>
            <div><label className="label">Period End *</label><input className="input" type="date" value={genForm.period_end} onChange={e => setGenForm(f => ({ ...f, period_end: e.target.value }))} /></div>
          </div>

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

          <button onClick={generatePreview} disabled={generating} className="btn-secondary w-full">
            {generating ? 'Calculating...' : 'Calculate Preview'}
          </button>

          {/* Preview */}
          {preview.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-900">Preview — {preview.length} staff with commissions</p>
              <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
                {preview.map((item, i) => (
                  <div key={i} className="p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{item.user_name}</p>
                      <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5 flex-wrap">
                        {item.pt_signups_count > 0 && <span>PT Signups: {formatSGD(item.pt_signup_commission_sgd)}</span>}
                        {item.pt_sessions_count > 0 && <span>PT Sessions: {formatSGD(item.pt_session_commission_sgd)}</span>}
                        {item.membership_sales_count > 0 && <span>Membership ({item.membership_sales_count} sales): {formatSGD(item.membership_commission_sgd)}</span>}
                      </div>
                    </div>
                    <p className="text-sm font-bold text-green-700 flex-shrink-0">{formatSGD(item.total_commission_sgd)}</p>
                  </div>
                ))}
                <div className="p-3 bg-gray-50 flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-900">Total</p>
                  <p className="text-sm font-bold text-green-700">{formatSGD(preview.reduce((s, i) => s + i.total_commission_sgd, 0))}</p>
                </div>
              </div>
              <button onClick={handleSavePayouts} disabled={saving} className="btn-primary w-full">
                {saving ? 'Saving...' : `Save ${preview.length} Payout Drafts`}
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
