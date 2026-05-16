'use client'

// ============================================================
// src/app/dashboard/_components/StatsRow.tsx
//
// PURPOSE:
//   Renders the summary statistics cards row on the dashboard.
//   Has two modes controlled by isTrainer:
//
//   Trainer mode (isTrainer=true):
//     My Members · Active Packages · Sessions This Month · My Commission
//     Commission card shows session + signup breakdown, month navigator
//
//   Manager/Biz-ops mode (isTrainer=false):
//     Members · Sessions · Membership Sales · Active PT Packages · Commission Earned
//     Commission card shows session + signup + membership, drill-down button
//
// COMMISSION NAVIGATOR:
//   Users can scroll back up to 2 months using the ← → buttons.
//   commissionOffset: 0 = current month, -1 = last month, -2 = 2 months ago.
//   The parent handles data reload when offset changes.
//
// USED BY:
//   dashboard/page.tsx — manager, trainer, staff, biz-ops roles
// ============================================================

import { Users, Package, CheckCircle, CreditCard } from 'lucide-react'
import { formatSGD } from '@/lib/utils'

interface StatsRowProps {
  /** Stats data from the dashboard load */
  stats: {
    members: number
    packages: number
    sessions: number
    commission: number
    ptSessionTotal?: number
    ptSignupTotal?: number
    membershipTotal?: number
    membershipRevenue?: number
    membershipSalesCount?: number
    totalCommissionPayout?: number
  }
  /** Commission stats (may differ from stats.commission if period navigator is used) */
  commissionStats: {
    total: number
    session: number
    signup: number
    membership: number
  }
  /** Whether commission data is loading (period navigator) */
  commissionLoading: boolean
  /** Commission period offset: 0=current, -1=last month, -2=two months ago */
  commissionOffset: number
  /** Called when user changes commission period */
  onCommissionOffsetChange: (offset: number) => void
  /** Period label e.g. "May 2026" */
  commissionPeriodLabel: string
  /** Start of commission period (ISO string) — for drill-down */
  commissionPeriodStart: string
  /** End of commission period (ISO string) — for drill-down */
  commissionPeriodEnd: string
  /** Whether to show trainer layout (true) or manager/biz-ops layout (false) */
  isTrainer: boolean
  /** Whether to show the drill-down button (manager only) */
  showDrillDown?: boolean
  /** Called when drill-down button is clicked */
  onDrillDown?: () => void
}

export default function StatsRow({
  stats,
  commissionStats,
  commissionLoading,
  commissionOffset,
  onCommissionOffsetChange,
  commissionPeriodLabel,
  commissionPeriodStart,
  commissionPeriodEnd,
  isTrainer,
  showDrillDown = false,
  onDrillDown,
}: StatsRowProps) {
  const monthShort = commissionPeriodLabel.split(' ')[0].slice(0, 3)
  const monthYear = commissionPeriodLabel.split(' ')[1]

  if (isTrainer) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">My Members</p>
            <Users className="w-4 h-4 text-red-600" />
          </div>
          <p className="text-2xl font-bold">{stats.members}</p>
          <p className="text-xs text-gray-400 mt-1">Active packages</p>
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">Active Packages</p>
            <Package className="w-4 h-4 text-red-600" />
          </div>
          <p className="text-2xl font-bold">{stats.packages}</p>
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">Sessions This Month</p>
            <CheckCircle className="w-4 h-4 text-green-600" />
          </div>
          <p className="text-2xl font-bold">{stats.sessions}</p>
        </div>

        <div className="stat-card col-span-2 md:col-span-1">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">My Commission</p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onCommissionOffsetChange(Math.max(commissionOffset - 1, -2))}
                disabled={commissionOffset <= -2}
                className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30 px-1"
              >←</button>
              <span className="text-xs text-gray-400 min-w-16 text-center">{monthShort}</span>
              <button
                onClick={() => onCommissionOffsetChange(Math.min(commissionOffset + 1, 0))}
                disabled={commissionOffset >= 0}
                className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30 px-1"
              >→</button>
            </div>
          </div>
          <p className="text-xl font-bold text-green-700 mt-1">
            {commissionLoading ? '...' : formatSGD(commissionStats.total)}
          </p>
          <div className="mt-1 space-y-0.5">
            <p className="text-xs text-gray-400">Sessions: {formatSGD(commissionStats.session)}</p>
            <p className="text-xs text-gray-400">Signup: {formatSGD(commissionStats.signup)}</p>
            <p className="text-xs text-gray-400">Membership: {formatSGD(commissionStats.membership)}</p>
          </div>
        </div>
      </div>
    )
  }

  // Manager / Biz-ops layout
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      <div className="stat-card">
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">Members</p>
          <Users className="w-4 h-4 text-red-600" />
        </div>
        <p className="text-2xl font-bold">{stats.members}</p>
      </div>

      <div className="stat-card">
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">Sessions This Month</p>
          <CheckCircle className="w-4 h-4 text-green-600" />
        </div>
        <p className="text-2xl font-bold">{stats.sessions}</p>
      </div>

      <div className="stat-card">
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">Membership Sales</p>
          <CreditCard className="w-4 h-4 text-red-600" />
        </div>
        <p className="text-2xl font-bold">{stats.membershipSalesCount ?? 0}</p>
        {stats.membershipRevenue > 0 && (
          <p className="text-xs text-gray-400 mt-1">{formatSGD(stats.membershipRevenue)}</p>
        )}
      </div>

      <div className="stat-card">
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">Active PT Packages</p>
          <Package className="w-4 h-4 text-red-600" />
        </div>
        <p className="text-2xl font-bold">{stats.packages}</p>
      </div>

      <div className="stat-card col-span-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">Commission Earned</p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onCommissionOffsetChange(Math.max(commissionOffset - 1, -2))}
              disabled={commissionOffset <= -2}
              className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30 px-1"
            >←</button>
            <span className="text-xs text-gray-400 min-w-16 text-center">{monthShort} {monthYear}</span>
            <button
              onClick={() => onCommissionOffsetChange(Math.min(commissionOffset + 1, 0))}
              disabled={commissionOffset >= 0}
              className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30 px-1"
            >→</button>
          </div>
        </div>
        <p className="text-xl font-bold text-green-700 mt-1">
          {commissionLoading ? '...' : formatSGD(commissionStats.total)}
        </p>
        <div className="flex gap-4 mt-1">
          <p className="text-xs text-gray-400">Sessions: {formatSGD(commissionStats.session)}</p>
          <p className="text-xs text-gray-400">Signup: {formatSGD(commissionStats.signup)}</p>
          <p className="text-xs text-gray-400">Membership: {formatSGD(commissionStats.membership)}</p>
        </div>
        <p className="text-xs text-gray-400 mt-0.5">Confirmed only — pending manager/Biz Ops ack excluded</p>
        {showDrillDown && onDrillDown && (
          <button onClick={onDrillDown} className="text-xs text-red-600 hover:underline mt-1.5">
            View breakdown →
          </button>
        )}
      </div>
    </div>
  )
}
