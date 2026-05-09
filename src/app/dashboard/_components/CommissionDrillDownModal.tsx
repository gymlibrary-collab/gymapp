'use client'

// ============================================================
// src/app/dashboard/_components/CommissionDrillDownModal.tsx
//
// PURPOSE:
//   Modal showing a detailed breakdown of commission earned in
//   a given period, grouped by staff member or by commission type.
//   Triggered from the commission stats card on the manager dashboard.
//
// GROUP BY MODES:
//   'staff' — one row per staff member with session/signup/membership breakdown
//   'type'  — one row per commission type with transaction count
//
// USED BY:
//   dashboard/page.tsx — manager role only
// ============================================================

import { X } from 'lucide-react'
import { cn, formatSGD } from '@/lib/utils'

interface CommissionDrillDownModalProps {
  /** Whether the modal is open */
  open: boolean
  /** Period label e.g. "May 2026" */
  periodLabel: string
  /** Current grouping mode */
  groupBy: 'staff' | 'type'
  /** Called when user toggles group by — also triggers data reload */
  onGroupByChange: (groupBy: 'staff' | 'type') => void
  /** Whether drill-down data is loading */
  loading: boolean
  /** Drill-down rows — shape depends on groupBy mode */
  data: any[]
  /** Called when modal is closed */
  onClose: () => void
}

export default function CommissionDrillDownModal({
  open,
  periodLabel,
  groupBy,
  onGroupByChange,
  loading,
  data,
  onClose,
}: CommissionDrillDownModalProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-16 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Commission Breakdown</h3>
            <p className="text-xs text-gray-400">{periodLabel} · My Gym</p>
          </div>
          <button onClick={onClose}>
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Group by toggle */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {(['staff', 'type'] as const).map(opt => (
            <button
              key={opt}
              onClick={() => onGroupByChange(opt)}
              className={cn(
                'flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors',
                groupBy === opt ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              )}
            >
              By {opt === 'staff' ? 'Staff' : 'Commission Type'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-6">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-600" />
          </div>
        ) : data.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No commission data for this period</p>
        ) : groupBy === 'staff' ? (
          <div className="divide-y divide-gray-100">
            {data.map((row: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-medium text-gray-900">{row.name}</p>
                  <p className="text-xs text-gray-400">
                    {row.session > 0 && `Sessions: ${formatSGD(row.session)} `}
                    {row.signup > 0 && `Signup: ${formatSGD(row.signup)} `}
                    {row.membership > 0 && `Membership: ${formatSGD(row.membership)}`}
                  </p>
                </div>
                <p className="text-sm font-bold text-green-700">{formatSGD(row.total)}</p>
              </div>
            ))}
            <div className="flex justify-between pt-2.5">
              <p className="text-sm font-semibold text-gray-900">Total</p>
              <p className="text-sm font-bold text-green-700">
                {formatSGD(data.reduce((s: number, r: any) => s + r.total, 0))}
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {data.map((row: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-medium text-gray-900">{row.name}</p>
                  <p className="text-xs text-gray-400">{row.count} transaction{row.count !== 1 ? 's' : ''}</p>
                </div>
                <p className="text-sm font-bold text-green-700">{formatSGD(row.amount)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
