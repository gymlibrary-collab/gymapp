'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { formatDate, formatSGD } from '@/lib/utils'
import { Search, CheckCircle, XCircle, Clock, CreditCard, AlertCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'

export default function MembershipSalesPage() {
  const [user, setUser] = useState<any>(null)
  const [sales, setSales] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [loading, setLoading] = useState(true)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const supabase = createClient()
  const router = useRouter()

  const { success, error, showMsg } = useToast()

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return
    const { data: userData } = await supabase.from('users').select('*').eq('id', authUser.id).single()
    // Admin does not manage membership sales
    if (!userData || userData.role === 'admin') { router.replace('/dashboard'); return }
    setUser(userData)

    let q = supabase.from('gym_memberships')
      .select('*, member:members(full_name, phone, membership_number), sold_by:users!gym_memberships_sold_by_user_id_fkey(full_name, role), gym:gyms(name)')
      .order('created_at', { ascending: false })

    if (userData.role === 'trainer' || userData.role === 'staff' || (userData.role === 'manager' && userData.is_also_trainer)) {
      q = q.eq('sold_by_user_id', authUser.id)
    } else if (userData.role === 'manager' && userData.manager_gym_id) {
      q = q.eq('gym_id', userData.manager_gym_id)
    }

    const { data } = await q
    setSales(data || [])
    setLoading(false)
  }

  const handleConfirm = async (id: string) => {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    await supabase.from('gym_memberships').update({
      sale_status: 'confirmed', status: 'active',
      confirmed_by: authUser!.id, confirmed_at: new Date().toISOString(),
    }).eq('id', id)
    await load(); showMsg('Sale confirmed — commission queued for payout')
  }

  const handleReject = async () => {
    if (!rejectId || !rejectReason.trim()) return
    await supabase.from('gym_memberships').update({ sale_status: 'rejected', status: 'cancelled', rejection_reason: rejectReason }).eq('id', rejectId)
    setRejectId(null); setRejectReason(''); await load(); showMsg('Sale rejected')
  }

  // Confirm logic:
  // - If sold by a manager (including manager-trainer hybrid, role = 'manager') → only biz_ops can confirm
  // - If sold by a trainer → manager or biz_ops can confirm
  // - null/unknown sold_by role → default to biz_ops only (safe fallback)
  const sellerIsManager = (sale: any) => {
    const role = sale.sold_by?.role
    // Manager (incl. manager-trainer) and above → biz ops confirms
    // Trainer and staff → manager confirms
    return role === 'manager' || role === 'business_ops' || role === 'admin' || !role
  }
  const canConfirmSale = (sale: any) => {
    if (sale.sale_status !== 'pending') return false
    if (sellerIsManager(sale)) return user?.role === 'business_ops'
    // Sold by a trainer — manager or biz_ops can confirm
    return user?.role === 'manager' || user?.role === 'business_ops'
  }
  const canConfirmAny = sales.some(s => canConfirmSale(s))
  const pendingCount = sales.filter(s => s.sale_status === 'pending').length
  const confirmedTotal = sales.filter(s => s.sale_status === 'confirmed').reduce((sum, s) => sum + (s.commission_sgd || 0), 0)
  // Biz Ops sees sales activity but not the commission figures — those belong
  // in the payroll workflow, not the sales view.
  const isBizOps = user?.role === 'business_ops'

  const filtered = sales.filter(s => {
    const member = s.member
    const matchSearch = member?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      member?.phone?.includes(search) || member?.membership_number?.includes(search)
    const matchStatus = filterStatus === 'all' || s.sale_status === filterStatus
    return matchSearch && matchStatus
  })

  const statusBadge = (status: string) => {
    if (status === 'confirmed') return 'badge-active'
    if (status === 'pending') return 'badge-pending'
    return 'badge-danger'
  }

  if (loading) return <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600" /></div>

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Membership Sales</h1>
        <p className="text-sm text-gray-500">{isBizOps ? 'Gym membership sales activity across all clubs' : 'Gym membership sales confirmation and commission tracking'}</p>
      </div>

      <div className={cn('grid gap-3', isBizOps ? 'grid-cols-2' : 'grid-cols-3')}>
        <div className="stat-card"><p className="text-xs text-gray-500 mb-1">Total Sales</p><p className="text-2xl font-bold text-gray-900">{sales.length}</p></div>
        <div className="stat-card"><p className="text-xs text-gray-500 mb-1">Pending Review</p><p className="text-2xl font-bold text-amber-600">{pendingCount}</p></div>
        {!isBizOps && (
          <div className="stat-card"><p className="text-xs text-gray-500 mb-1">Confirmed Commission</p><p className="text-lg font-bold text-green-700">{formatSGD(confirmedTotal)}</p></div>
        )}
      </div>

      {success && <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700"><CheckCircle className="w-4 h-4 flex-shrink-0" />{success}</div>}

      {canConfirmAny && pendingCount > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {pendingCount} sale{pendingCount > 1 ? 's' : ''} pending your confirmation.
        </div>
      )}

      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4">
            <h3 className="font-bold text-gray-900">Reject Sale</h3>
            <div><label className="label">Reason *</label><textarea className="input min-h-[80px]" value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="e.g. Duplicate entry, incorrect amount..." /></div>
            <div className="flex gap-2"><button onClick={handleReject} disabled={!rejectReason.trim()} className="btn-danger flex-1">Reject</button><button onClick={() => { setRejectId(null); setRejectReason('') }} className="btn-secondary">Cancel</button></div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><input className="input pl-9" placeholder="Search by name, phone or membership no..." value={search} onChange={e => setSearch(e.target.value)} /></div>
        <div className="flex gap-1">
          {['all', 'pending', 'confirmed', 'rejected'].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)} className={cn('px-3 py-2 rounded-lg text-xs font-medium capitalize transition-colors', filterStatus === s ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>{s}</button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card p-8 text-center"><CreditCard className="w-10 h-10 text-gray-300 mx-auto mb-3" /><p className="text-gray-500 text-sm">No membership sales found</p></div>
      ) : (
        <div className="space-y-2">
          {filtered.map(sale => (
            <div key={sale.id} className="card p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900 text-sm">{isBizOps ? (sale.member?.membership_number ? `Member #${sale.member.membership_number}` : 'Member') : sale.member?.full_name}</p>
                    {!isBizOps && sale.member?.membership_number && <span className="text-xs text-gray-400">#{sale.member.membership_number}</span>}
                    <span className={statusBadge(sale.sale_status)}>{sale.sale_status}</span>
                  </div>
                  <p className="text-xs text-gray-500">{sale.member?.phone}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                    <span>{sale.membership_type_name} · {formatSGD(sale.price_sgd)}</span>
                    <span>{formatDate(sale.start_date)} → {formatDate(sale.end_date)}</span>
                    {!isBizOps && <span className="text-green-600 font-medium">Commission: {formatSGD(sale.commission_sgd)}</span>}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">Sold by: {sale.sold_by?.full_name} · {sale.gym?.name}</p>
                  {sale.rejection_reason && <p className="text-xs text-red-500 mt-0.5">Rejected: {sale.rejection_reason}</p>}
                </div>
                {canConfirmSale(sale) && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => handleConfirm(sale.id)} className="btn-primary text-xs py-1.5 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Confirm</button>
                    <button onClick={() => setRejectId(sale.id)} className="btn-secondary text-xs py-1.5 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /></button>
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
