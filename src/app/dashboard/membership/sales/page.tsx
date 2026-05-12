'use client'

import { useActivityLog } from '@/hooks/useActivityLog'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { formatDate, formatSGD } from '@/lib/utils'
import { Search, CheckCircle, XCircle, Clock, CreditCard, AlertCircle, X, ChevronUp, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { StatusBanner } from '@/components/StatusBanner'
import { useCurrentUser } from '@/hooks/useCurrentUser'

export default function MembershipSalesPage() {
  const { user, loading } = useCurrentUser({ allowedRoles: ['manager', 'business_ops', 'trainer', 'staff'] })


  const [allGymSales, setAllGymSales] = useState<any[]>([]) // manager: all gym sales for confirmation
  const [mySales, setMySales] = useState<any[]>([])
  const [dataLoading, setDataLoading] = useState(true)          // personal sales history
  const [tab, setTab] = useState<'confirm' | 'my'>('confirm')
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const { logActivity } = useActivityLog()
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [memberPackages, setMemberPackages] = useState<Record<string, any[]>>({})
  const supabase = createClient()
  const router = useRouter()
  const { success, error, showMsg } = useToast()



  const load = async () => {
    logActivity('page_view', 'Membership Sales', 'Viewed membership sales')

    const baseSelect = '*, member:members(full_name, phone, membership_number), sold_by:users!gym_memberships_sold_by_user_id_fkey(full_name, role), gym:gyms(name)'

    if (user!.role === 'manager') {
      // Manager sees non-escalated pending gym sales for confirmation
      const { data: gymSales } = await supabase.from('gym_memberships')
        .select(baseSelect)
        .eq('gym_id', user!.manager_gym_id)
        .order('created_at', { ascending: false })
      setAllGymSales(gymSales || [])
      setTab('confirm')
    } else if (user!.role === 'business_ops') {
      // Biz Ops sees:
      // 1. Escalated pending sales from trainer/staff (manager not actioned within threshold)
      // 2. Pending sales from managers (manager cannot confirm own sales)
      const { data: pendingSales } = await supabase.from('gym_memberships')
        .select(baseSelect)
        .eq('sale_status', 'pending')
        .order('created_at', { ascending: false })
      // Recent confirmed/rejected for audit trail (last 90 days)
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
      const { data: recentSales } = await supabase.from('gym_memberships')
        .select(baseSelect)
        .neq('sale_status', 'pending')
        .gte('created_at', ninetyDaysAgo)
        .order('created_at', { ascending: false })
      // Biz Ops sees: manager-sold sales + escalated trainer/staff sales
      const allSales = [...(pendingSales || []), ...(recentSales || [])]
      const bizOpsSales = allSales.filter((s: any) => {
        const role = s.sold_by?.role
        const isManagerSold = role === 'manager' || role === 'business_ops' || role === 'admin' || !role
        const isEscalated = s.escalated_to_biz_ops === true
        return isManagerSold || isEscalated
      })
      setAllGymSales(bizOpsSales)
      setTab('confirm')
    } else {
      // Trainer / Staff — own sales only
      const { data: ownSales } = await supabase.from('gym_memberships')
        .select(baseSelect)
        .eq('sold_by_user_id', user!.id)
        .order('created_at', { ascending: false })
      setMySales(ownSales || [])
    setDataLoading(false)
    }

  }

  useEffect(() => { if (!user) return; load().finally(() => setDataLoading(false)) }, [user])

  if (loading || dataLoading) return <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600" /></div>
  if (!user) return null


  const fetchMemberPackages = async (memberId: string) => {
    if (memberPackages[memberId]) return // already loaded
    const { data } = await supabase.from('packages')
      .select('package_name, status, total_sessions, sessions_used, start_date, end_date_calculated, trainer:users!packages_trainer_id_fkey(full_name)')
      .eq('member_id', memberId)
      .in('status', ['active', 'completed', 'expired'])
      .order('created_at', { ascending: false })
      .limit(3)
    setMemberPackages(prev => ({ ...prev, [memberId]: data || [] }))
  }

  const handleConfirm = async (id: string) => {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    await supabase.from('gym_memberships').update({
      sale_status: 'confirmed', status: 'active',
      confirmed_by: authUser!.id, confirmed_at: new Date().toISOString(),
    }).eq('id', id)
    await load(); showMsg('Sale confirmed')
    logActivity('confirm', 'Membership Sales', 'Confirmed membership sale')
  }

  const handleReject = async () => {
    if (!rejectId || !rejectReason.trim()) return
    const sale = [...allGymSales, ...mySales].find((s: any) => s.id === rejectId)
    if (!sale) return

    const { data: { user: authUser } } = await supabase.auth.getUser()
    const { data: me } = await supabase.from('users').select('full_name').eq('id', authUser!.id).single()

    // Check if this is the member's only ever membership (new member scenario)
    const { data: otherMems } = await supabase.from('gym_memberships')
      .select('id').eq('member_id', sale.member_id)
      .eq('sale_status', 'confirmed').neq('id', rejectId)
    const isNewMember = !otherMems || otherMems.length === 0

    // Write rejection notification to seller
    await supabase.from('mem_rejection_notif').insert({
      seller_id: sale.sold_by_user_id || sale.sold_by?.id,
      member_name: sale.member?.full_name || 'Unknown',
      membership_type_name: sale.membership_type_name || '',
      rejection_reason: rejectReason,
      was_new_member: isNewMember,
      rejected_by: authUser!.id,
      rejected_by_name: (me as any)?.full_name || 'Manager',
    })

    if (isNewMember) {
      // New member — delete member record entirely (cascade deletes membership)
      await supabase.from('members').delete().eq('id', sale.member_id)
    } else {
      // Renewal/existing member — soft reject, keep member record
      await supabase.from('gym_memberships').update({
        sale_status: 'rejected', status: 'cancelled', rejection_reason: rejectReason,
      }).eq('id', rejectId)
    }

    setRejectId(null); setRejectReason(''); await load()
    logActivity('reject', 'Membership Sales', 'Rejected membership sale')
    showMsg(isNewMember ? 'Sale rejected — member record removed' : 'Sale rejected — existing membership unaffected')
  }

  const sellerIsManager = (sale: any) => {
    const role = sale.sold_by?.role
    return role === 'manager' || role === 'business_ops' || role === 'admin' || !role
  }
  const canConfirmSale = (sale: any) => {
    if (sale.sale_status !== 'pending') return false
    if (sellerIsManager(sale)) return user?.role === 'business_ops'
    return user?.role === 'manager' || user?.role === 'business_ops'
  }

  const isManager = user?.role === 'manager'
  const isBizOps = user?.role === 'business_ops'

  // Active dataset based on tab/role
  const activeSales = (isManager || isBizOps) ? (tab === 'confirm' ? allGymSales : mySales) : mySales

  const filtered = activeSales.filter((s: any) => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      s.member?.full_name?.toLowerCase().includes(q) ||
      s.member?.phone?.includes(q) ||
      s.member?.membership_number?.includes(q) ||
      s.gym?.name?.toLowerCase().includes(q) ||
      s.sold_by?.full_name?.toLowerCase().includes(q) ||
      s.membership_type_name?.toLowerCase().includes(q)
    const matchStatus = filterStatus === 'all' || s.sale_status === filterStatus
    return matchSearch && matchStatus
  })

  const pendingCount = isManager
    ? allGymSales.filter((s: any) => canConfirmSale(s) && !s.escalated_to_biz_ops).length
    : allGymSales.filter((s: any) => canConfirmSale(s)).length
  const myConfirmedTotal = mySales.filter((s: any) => s.sale_status === 'confirmed')
    .reduce((sum: number, s: any) => sum + (s.sale_status === 'confirmed' ? (s.commission_sgd || 0) : 0), 0)
  const myPendingCount = mySales.filter((s: any) => s.sale_status === 'pending').length

  const statusBadge = (status: string) => {
    if (status === 'confirmed') return 'badge-active'
    if (status === 'pending') return 'badge-pending'
    return 'badge-danger'
  }

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600" />
    </div>
  )

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">
          {isBizOps ? 'Confirm Manager Sales' : 'Membership Sales'}
        </h1>
        <p className="text-sm text-gray-500">
          {isBizOps ? 'Confirm or reject membership sales logged by managers across all gyms' :
           isManager ? 'Confirm staff sales and track your own membership sales' :
           'Your membership sales history and commission earned'}
        </p>
      </div>

      <StatusBanner success={success} error={error} />

      {/* Biz Ops confirm tab — always shown, no My Sales tab */}
      {isBizOps && pendingCount > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {pendingCount} manager sale{pendingCount > 1 ? 's' : ''} pending your confirmation
        </div>
      )}

      {/* Manager: no tabs — confirm sales only. Own pending sales shown on dashboard. */}

      {/* Stats */}
      {isBizOps && (
        <div className="grid grid-cols-2 gap-3">
          <div className="stat-card">
            <p className="text-xs text-gray-500 mb-1">Manager Sales (90 days)</p>
            <p className="text-2xl font-bold text-gray-900">{allGymSales.length}</p>
          </div>
          <div className="stat-card">
            <p className="text-xs text-gray-500 mb-1">Pending Confirmation</p>
            <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
          </div>
        </div>
      )}

      {isManager && (
        <div className="grid grid-cols-2 gap-3">
          <div className="stat-card">
            <p className="text-xs text-gray-500 mb-1">Total Gym Sales</p>
            <p className="text-2xl font-bold text-gray-900">{allGymSales.length}</p>
          </div>
          <div className="stat-card">
            <p className="text-xs text-gray-500 mb-1">Pending Confirmation</p>
            <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
          </div>
        </div>
      )}

      {(!isManager && !isBizOps) && (
        <div className="grid grid-cols-3 gap-3">
          <div className="stat-card">
            <p className="text-xs text-gray-500 mb-1">My Sales</p>
            <p className="text-2xl font-bold text-gray-900">{mySales.length}</p>
          </div>
          <div className="stat-card">
            <p className="text-xs text-gray-500 mb-1">Pending</p>
            <p className="text-2xl font-bold text-amber-600">{myPendingCount}</p>
          </div>
          {!isBizOps && (
            <div className="stat-card">
              <p className="text-xs text-gray-500 mb-1">Commission Earned</p>
              <p className="text-lg font-bold text-green-700">{formatSGD(myConfirmedTotal)}</p>
            </div>
          )}
        </div>
      )}

      {/* Pending alert for manager confirm tab */}
      {isManager && tab === 'confirm' && pendingCount > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {pendingCount} sale{pendingCount > 1 ? 's' : ''} pending your confirmation
        </div>
      )}

      {/* Reject modal */}
      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4">
            <h3 className="font-bold text-gray-900">Reject Sale</h3>
            <div>
              <label className="label">Reason *</label>
              <textarea className="input min-h-[80px]" value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="e.g. Duplicate entry, incorrect amount..." />
            </div>
            <div className="flex gap-2">
              <button onClick={handleReject} disabled={!rejectReason.trim()} className="btn-danger flex-1">Reject</button>
              <button onClick={() => { setRejectId(null); setRejectReason('') }} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="input pl-9"
            placeholder={isBizOps ? 'Search by name, phone, membership no., gym or manager...' : 'Search by name, phone or membership no...'}
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1">
          {['all', 'pending', 'confirmed', 'rejected'].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={cn('px-3 py-2 rounded-lg text-xs font-medium capitalize transition-colors',
                filterStatus === s ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Sales list */}
      {filtered.length === 0 ? (
        <div className="card p-8 text-center">
          <CreditCard className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No membership sales found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((sale: any) => {
            const isExpanded = expandedId === sale.id
            const pkgs = memberPackages[sale.member_id] || []
            return (
            <div key={sale.id} className="card overflow-hidden">
              {/* Summary row — always visible */}
              <div className="flex items-start gap-3 p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => {
                  const next = isExpanded ? null : sale.id
                  setExpandedId(next)
                  if (next && sale.member_id) fetchMemberPackages(sale.member_id)
                }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900 text-sm">{sale.member?.full_name}</p>
                    {sale.member?.membership_number && (
                      <span className="text-xs text-gray-400">#{sale.member.membership_number}</span>
                    )}
                    <span className={statusBadge(sale.sale_status)}>{sale.sale_status}</span>
                  </div>
                  <p className="text-xs text-gray-500">{sale.member?.phone}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                    <span>{sale.membership_type_name} · {formatSGD(sale.price_sgd)}</span>
                    <span>{formatDate(sale.start_date)} → {formatDate(sale.end_date)}</span>
                    {!isBizOps && (
                      <span className="text-green-600 font-medium">
                        Commission: {formatSGD(sale.commission_sgd)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Sold by: {sale.sold_by?.full_name} · {sale.gym?.name}
                  </p>
                  {sale.rejection_reason && (
                    <p className="text-xs text-red-500 mt-0.5">Rejected: {sale.rejection_reason}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {canConfirmSale(sale) && (
                    <>
                      <button onClick={e => { e.stopPropagation(); handleConfirm(sale.id) }}
                        className="btn-primary text-xs py-1.5 flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5" /> Confirm
                      </button>
                      <button onClick={e => { e.stopPropagation(); setRejectId(sale.id) }}
                        className="btn-secondary text-xs py-1.5 flex items-center gap-1">
                        <XCircle className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  {isExpanded
                    ? <ChevronUp className="w-4 h-4 text-gray-400 ml-1" />
                    : <ChevronDown className="w-4 h-4 text-gray-400 ml-1" />}
                </div>
              </div>

              {/* Expanded member details */}
              {isExpanded && (
                <div className="border-t border-gray-100 bg-gray-50 p-4 space-y-3">
                  <p className="text-xs font-semibold text-gray-700">Member Details</p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                    <div><p className="text-xs text-gray-400">Full Name</p><p className="text-xs font-medium text-gray-900">{sale.member?.full_name}</p></div>
                    <div><p className="text-xs text-gray-400">Phone</p><p className="text-xs font-medium text-gray-900">{sale.member?.phone || '—'}</p></div>
                    <div><p className="text-xs text-gray-400">Membership No.</p><p className="text-xs font-medium text-gray-900">{sale.member?.membership_number || '—'}</p></div>
                    <div><p className="text-xs text-gray-400">Gym</p><p className="text-xs font-medium text-gray-900">{sale.gym?.name || '—'}</p></div>
                  </div>
                  <div className="divider" style={{height:'0.5px', background:'var(--color-border-tertiary)'}} />
                  <p className="text-xs font-semibold text-gray-700">Membership</p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                    <div><p className="text-xs text-gray-400">Type</p><p className="text-xs font-medium text-gray-900">{sale.membership_type_name}</p></div>
                    <div><p className="text-xs text-gray-400">Price</p><p className="text-xs font-medium text-gray-900">{formatSGD(sale.price_sgd)}</p></div>
                    <div><p className="text-xs text-gray-400">Start Date</p><p className="text-xs font-medium text-gray-900">{formatDate(sale.start_date)}</p></div>
                    <div><p className="text-xs text-gray-400">End Date</p><p className="text-xs font-medium text-gray-900">{formatDate(sale.end_date)}</p></div>
                    <div><p className="text-xs text-gray-400">Sold By</p><p className="text-xs font-medium text-gray-900">{sale.sold_by?.full_name || '—'}</p></div>
                    <div><p className="text-xs text-gray-400">Status</p><p className="text-xs font-medium text-gray-900">{sale.sale_status}</p></div>
                  </div>
                  {pkgs.length > 0 && (
                    <>
                      <div className="divider" style={{height:'0.5px', background:'var(--color-border-tertiary)'}} />
                      <p className="text-xs font-semibold text-gray-700">PT Packages</p>
                      {pkgs.map((pkg: any, i: number) => (
                        <div key={i} className="text-xs space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{pkg.package_name}</span>
                            <span className={cn('px-1.5 py-0.5 rounded-full text-xs font-medium',
                              pkg.status === 'active' ? 'bg-green-100 text-green-700' :
                              pkg.status === 'completed' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600')}>
                              {pkg.status}
                            </span>
                          </div>
                          <p className="text-gray-500">Sessions: {pkg.sessions_used}/{pkg.total_sessions} · {formatDate(pkg.start_date)}{pkg.end_date_calculated ? ` → ${formatDate(pkg.end_date_calculated)}` : ''}</p>
                          {pkg.trainer && <p className="text-gray-500">Trainer: {pkg.trainer?.full_name}</p>}
                        </div>
                      ))}
                    </>
                  )}
                  {pkgs.length === 0 && memberPackages[sale.member_id] !== undefined && (
                    <>
                      <div className="divider" style={{height:'0.5px', background:'var(--color-border-tertiary)'}} />
                      <p className="text-xs text-gray-400">No PT packages found for this member</p>
                    </>
                  )}
                </div>
              )}
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
