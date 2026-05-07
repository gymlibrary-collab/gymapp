'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { formatDate, formatSGD } from '@/lib/utils'
import { Package, CheckCircle, Clock, User, DollarSign } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { StatusBanner } from '@/components/StatusBanner'
import { useCurrentUser } from '@/hooks/useCurrentUser'

export default function PackageSalesPage() {

  const { user, loading } = useCurrentUser({ allowedRoles: ['manager', 'business_ops', 'trainer'] })
  const { logActivity } = useActivityLog()
  const supabase = createClient()
  const router = useRouter()
  const { success, error, showMsg, setError } = useToast()

  const [currentUser, setCurrentUser] = useState<any>(null)
  const [pending, setPending] = useState<any[]>([])
  const [confirmed, setConfirmed] = useState<any[]>([])
  const [tab, setTab] = useState<'pending' | 'confirmed'>('pending')
  const [confirming, setConfirming] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<string | null>(null)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
      // Auth guard handled by useCurrentUser hook
  if (loading || !user) return null
    const isBizOps = me.role === 'business_ops'
    const gymId = me.manager_gym_id || ''
    if (!isBizOps && !gymId) { return }

    // Pending: split by role — manager sees non-escalated, Biz Ops sees escalated
    const { data: pendingData } = await supabase.from('packages')
      .select(`
        id, package_name, total_sessions, total_price_sgd,
        signup_commission_pct, signup_commission_sgd,
        trainer_id, start_date, created_at, status,
        escalated_to_biz_ops, escalated_at,
        trainer:users!packages_trainer_id_fkey(id, full_name),
        member:members!packages_member_id_fkey(full_name)
      `)
      .eq('manager_confirmed', false)
      .eq('escalated_to_biz_ops', isBizOps)
      .eq(isBizOps ? 'status' : 'gym_id', isBizOps ? 'active' : gymId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
    setPending(pendingData || [])

    // Confirmed: packages confirmed this month (both roles see their gym's confirmed)
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    let confirmedQ = supabase.from('packages')
      .select(`
        id, package_name, total_sessions, total_price_sgd,
        signup_commission_pct, signup_commission_sgd,
        start_date, created_at, manager_confirmed_at, status,
        trainer:users!packages_trainer_id_fkey(full_name),
        member:members!packages_member_id_fkey(full_name),
        confirmedBy:users!packages_manager_confirmed_by_fkey(full_name)
      `)
      .eq('manager_confirmed', true)
      .gte('manager_confirmed_at', monthStart.toISOString())
      .order('manager_confirmed_at', { ascending: false })
    if (!isBizOps) confirmedQ = confirmedQ.eq('gym_id', gymId)
    const { data: confirmedData } = await confirmedQ
    setConfirmed(confirmedData || [])

  }

  const handleConfirm = async (pkg: any) => {
    setConfirming(pkg.id)
    const { data: { user: authUser } } = await supabase.auth.getUser()
    const { error: err } = await supabase.from('packages').update({
      manager_confirmed: true,
      manager_confirmed_by: authUser!.id,
      manager_confirmed_at: new Date().toISOString(),
    }).eq('id', pkg.id)
    if (err) { setError('Failed to confirm: ' + err.message); setConfirming(null); return }
    showMsg('Package confirmed')
    logActivity('confirm', 'PT Package Sales', 'Confirmed PT package sale')
    setConfirming(null)
    loadData()
  }

  const handleReject = async (pkg: any) => {
    // ── Check 1: Commission already paid ─────────────────────
    if (pkg.signup_commission_paid) {
      setError("Commission has already been paid for this package. Handle as a manual adjustment in next month's payout — rejection is not possible.")
      return
    }

    // ── Check 2: Draft/approved commission payout already generated ──
    const pkgDate = pkg.created_at?.split('T')[0] || ''
    const { data: existingPayouts } = await supabase
      .from('commission_payouts')
      .select('id, status, period_start, period_end')
      .eq('user_id', pkg.trainer_id || pkg.trainer?.id)
      .in('status', ['draft', 'approved'])
      .lte('period_start', pkgDate)
      .gte('period_end', pkgDate)
      .limit(1)

    if (existingPayouts && existingPayouts.length > 0) {
      const payout = existingPayouts[0]
      const proceed = window.confirm(
        `⚠ A commission payout (${payout.status}) has already been generated for the period covering this package.

` +
        `Rejecting will cause a discrepancy in that payout total.

` +
        `Recommended: handle as a manual deduction in next month's payout instead.

` +
        `Proceed with rejection anyway?`
      )
      if (!proceed) return
    } else {
      // ── Check 3: Normal confirmation ─────────────────────────
      if (!window.confirm(`Reject PT package "${pkg.package_name}" for ${pkg.member?.full_name}? The package record will be permanently deleted and the trainer will be notified.`)) return
    }

    setRejecting(pkg.id)
    // Use user from hook — already verified at page load
    const rejectedById = user.id
    const rejectedByName = user.full_name

    // Write rejection notification for the trainer BEFORE deleting
    const { error: notifErr } = await supabase.from('pkg_rejection_notif').insert({
      trainer_id: pkg.trainer?.id || pkg.trainer_id,
      package_name: pkg.package_name,
      member_name: pkg.member?.full_name || 'Unknown member',
      gym_id: user?.manager_gym_id,
      rejected_by: rejectedById,
      rejected_by_name: rejectedByName,
    })
    if (notifErr) { setError('Failed to write notification: ' + notifErr.message); setRejecting(null); return }

    // Hard delete the package — cascade deletes any linked sessions
    const { error: deleteErr } = await supabase.from('packages').delete().eq('id', pkg.id)
    if (deleteErr) { setError('Failed to delete package: ' + deleteErr.message); setRejecting(null); return }

    showMsg('Package rejected — trainer will be notified')
    logActivity('reject', 'PT Package Sales', 'Rejected PT package sale — trainer notified')
    setRejecting(null)
    loadData()
  }

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600" />
    </div>
  )

  const gymName = (user as any)?.gyms?.name || 'Your Gym'

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">PT Package Sales</h1>
        {user?.role === 'business_ops' && (
          <p className="text-xs text-amber-600 mt-0.5">Escalated packages — not acknowledged by manager within 48 hours</p>
        )}
        <p className="text-sm text-gray-500">{gymName} · Confirm package sales for commission payout</p>
      </div>

      <StatusBanner success={success} error={error} />

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">Pending Confirmation</p>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{pending.length}</p>
          {pending.length > 0 && (
            <p className="text-xs text-amber-600 mt-1">
              Commission held: {formatSGD(pending.reduce((s, p) => s + (p.signup_commission_sgd || 0), 0))}
            </p>
          )}
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">Confirmed This Month</p>
            <CheckCircle className="w-4 h-4 text-green-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{confirmed.length}</p>
          {confirmed.length > 0 && (
            <p className="text-xs text-green-600 mt-1">
              Commission released: {formatSGD(confirmed.reduce((s, p) => s + (p.signup_commission_sgd || 0), 0))}
            </p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        {([['pending', `Pending (${pending.length})`], ['confirmed', `Confirmed (${confirmed.length})`]] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('flex-1 py-2 text-sm font-medium rounded-lg transition-colors',
              tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
            {label}
          </button>
        ))}
      </div>

      {/* Pending list */}
      {tab === 'pending' && (
        <div className="space-y-3">
          {pending.length === 0 ? (
            <div className="card p-8 text-center">
              <CheckCircle className="w-10 h-10 text-green-200 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">No pending package sales to confirm</p>
            </div>
          ) : pending.map(pkg => (
            <div key={pkg.id} className="card p-4">
              <div className="flex items-start gap-3">
                <div className="bg-red-50 p-2 rounded-lg flex-shrink-0">
                  <Package className="w-4 h-4 text-red-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm">{pkg.package_name}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" /> {pkg.member?.full_name || '—'}
                    </span>
                    <span>Trainer: {pkg.trainer?.full_name || '—'}</span>
                    <span>{pkg.total_sessions} sessions</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs flex-wrap">
                    <span className="font-medium text-gray-900">{formatSGD(pkg.total_price_sgd)}</span>
                    <span className="flex items-center gap-1 text-green-600">
                      <DollarSign className="w-3 h-3" />
                      Commission: {formatSGD(pkg.signup_commission_sgd)} ({pkg.signup_commission_pct}%)
                    </span>
                    <span className="text-gray-400">Sold {formatDate(pkg.created_at)}</span>
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleConfirm(pkg)}
                    disabled={confirming === pkg.id || rejecting === pkg.id}
                    className="btn-primary text-xs py-1.5 disabled:opacity-50">
                    {confirming === pkg.id ? 'Confirming...' : 'Confirm'}
                  </button>
                  <button
                    onClick={() => handleReject(pkg)}
                    disabled={confirming === pkg.id || rejecting === pkg.id}
                    className="btn-secondary text-xs py-1.5 text-red-600 border-red-200 hover:bg-red-50 disabled:opacity-50">
                    {rejecting === pkg.id ? '...' : 'Reject'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirmed list */}
      {tab === 'confirmed' && (
        <div className="space-y-3">
          {confirmed.length === 0 ? (
            <div className="card p-8 text-center">
              <Package className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">No confirmed packages this month</p>
            </div>
          ) : confirmed.map(pkg => (
            <div key={pkg.id} className="card p-4">
              <div className="flex items-start gap-3">
                <div className="bg-green-50 p-2 rounded-lg flex-shrink-0">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm">{pkg.package_name}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" /> {pkg.member?.full_name || '—'}
                    </span>
                    <span>Trainer: {pkg.trainer?.full_name || '—'}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs flex-wrap">
                    <span className="font-medium text-gray-900">{formatSGD(pkg.total_price_sgd)}</span>
                    <span className="text-green-600">Commission: {formatSGD(pkg.signup_commission_sgd)}</span>
                    <span className="text-gray-400">
                      Confirmed {pkg.manager_confirmed_at ? formatDate(pkg.manager_confirmed_at) : '—'}
                    </span>
                  </div>
                </div>
                <span className="text-xs text-green-600 font-medium flex-shrink-0">✓ Confirmed</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
