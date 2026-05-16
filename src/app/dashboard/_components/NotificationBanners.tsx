'use client'

// ============================================================
// src/app/dashboard/_components/NotificationBanners.tsx
//
// PURPOSE:
//   Renders all notification and alert banners shown on the
//   dashboard for trainer, staff, manager and biz-ops roles.
//   Each banner is conditionally shown based on its data prop.
//
// BANNERS INCLUDED (in display order):
//   1. New payslip available (all roles)
//   2. Commission payout approved (trainer/staff/manager)
//   3. PT package rejection notifications (trainer/staff/manager)
//   4. Leave decision notifications (trainer/staff/manager)
//   5. Annual payroll archive reminder (biz-ops only, Apr onwards)
//   6. Pending membership sales banner (all roles with pending sales)
//   7. Membership rejection notifications (trainer/staff/manager)
//
// DATA FLOW:
//   All data is fetched by the parent dashboard/page.tsx and passed
//   as props. This component is pure presentational — no queries.
//
// DISMISS HANDLERS:
//   Passed as callbacks from parent — dismissal updates parent state
//   so banners disappear without a page reload.
//
// USED BY:
//   dashboard/page.tsx — rendered for all roles except admin
//   (admin has its own simpler notification in AdminDashboard.tsx)
// ============================================================

import { AlertCircle, FileText, DollarSign, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { cn, nowSGT} from '@/lib/utils'
import { formatSGD, formatDate, getMonthName } from '@/lib/utils'

interface NotificationBannersProps {
  // ── Payslip / commission notifications ──────────────────────
  /** Latest approved payslip if newer than user's last seen timestamp, else null */
  newPayslip: any | null
  /** Latest approved commission payout if newer than last seen, else null */
  newCommission: any | null
  /** Called when user clicks a payslip/commission banner — marks as seen */
  onDismissPayslipNotif: () => void

  // ── Rejection notifications ──────────────────────────────────
  /** Unread PT package rejection notifications for this user */
  pkgRejectionNotifs: any[]
  /** Called when user dismisses PT package rejection banners */
  onDismissPkgRejections: () => void

  /** Unread leave decision notifications for this user */
  leaveDecisionNotifs: any[]
  /** Called when user dismisses leave decision banners */
  onDismissLeaveNotifs: () => void

  /** Unread membership rejection notifications for this user */
  memRejectionNotifs: any[]
  /** Called when user dismisses membership rejection banners */
  onDismissMemRejections: () => void

  // ── Pending sales ─────────────────────────────────────────────
  /** Count of own pending membership sales awaiting manager confirmation */
  pendingMemSales: number

  // ── Biz-ops only ─────────────────────────────────────────────
  /** Whether the current user is biz-ops (controls archive reminder visibility) */
  isBizOps: boolean
}

export default function NotificationBanners({
  newPayslip,
  newCommission,
  onDismissPayslipNotif,
  pkgRejectionNotifs,
  onDismissPkgRejections,
  leaveDecisionNotifs,
  onDismissLeaveNotifs,
  memRejectionNotifs,
  onDismissMemRejections,
  pendingMemSales,
  isBizOps,
}: NotificationBannersProps) {
  return (
    <>
      {/* ── New payslip notification ── */}
      {newPayslip && (
        <Link
          href="/dashboard/my/payslips"
          onClick={onDismissPayslipNotif}
          className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-4 hover:bg-green-100 transition-colors"
        >
          <FileText className="w-5 h-5 text-green-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-green-800">
              New payslip available — {getMonthName(newPayslip.period_month)} {newPayslip.period_year}
            </p>
            <p className="text-xs text-green-600 mt-0.5">
              {newPayslip.status === 'paid' ? 'Paid' : 'Approved'} · Net {formatSGD(newPayslip.net_salary)}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-green-400 flex-shrink-0" />
        </Link>
      )}

      {/* ── Commission payslip notification ── */}
      {newCommission && (
        <Link
          href="/dashboard/my/payslips"
          onClick={onDismissPayslipNotif}
          className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-4 hover:bg-green-100 transition-colors"
        >
          <DollarSign className="w-5 h-5 text-green-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-green-800">
              Commission payslip approved —{' '}
              {newCommission.period_month
                ? getMonthName(newCommission.period_month) + ' ' + newCommission.period_year
                : ''}
            </p>
            <p className="text-xs text-green-600 mt-0.5">
              {formatSGD(newCommission.commission_amount)} ready for collection
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-green-400 flex-shrink-0" />
        </Link>
      )}

      {/* ── PT package rejection notifications ── */}
      {pkgRejectionNotifs.length > 0 && (
        <div className="card p-4 bg-red-50 border border-red-200 space-y-2">
          <p className="text-sm font-medium text-red-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {pkgRejectionNotifs.length} PT package sale{pkgRejectionNotifs.length > 1 ? 's were' : ' was'} rejected
          </p>
          {pkgRejectionNotifs.map((n: any) => (
            <p key={n.id} className="text-xs text-red-700">
              · {n.package_name} for {n.member_name} — rejected by {n.rejected_by_name}
            </p>
          ))}
          <button onClick={onDismissPkgRejections} className="text-xs text-red-600 underline mt-1">
            Dismiss
          </button>
        </div>
      )}

      {/* ── Leave decision notifications ── */}
      {leaveDecisionNotifs.length > 0 && (
        <div className={cn('card p-4 space-y-2',
          leaveDecisionNotifs.some(n => n.decision === 'rejected')
            ? 'bg-red-50 border border-red-200'
            : 'bg-green-50 border border-green-200'
        )}>
          <p className={cn('text-sm font-medium flex items-center gap-2',
            leaveDecisionNotifs.some(n => n.decision === 'rejected') ? 'text-red-800' : 'text-green-800'
          )}>
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {leaveDecisionNotifs.length} leave application{leaveDecisionNotifs.length > 1 ? 's' : ''} updated
          </p>
          {leaveDecisionNotifs.map((n: any) => (
            <p key={n.id} className={cn('text-xs', n.decision === 'rejected' ? 'text-red-700' : 'text-green-700')}>
              · {n.decision === 'approved' ? '✓' : '✗'} {n.leave_type} leave{' '}
              {formatDate(n.start_date)}–{formatDate(n.end_date)} ({n.days_applied} days)
              {n.decision === 'rejected' && n.rejection_reason && ` — ${n.rejection_reason}`}
              {n.decided_by_name && ` · by ${n.decided_by_name}`}
            </p>
          ))}
          <button onClick={onDismissLeaveNotifs} className="text-xs underline mt-1">Dismiss</button>
        </div>
      )}

      {/* ── Annual payroll archive reminder (biz-ops, Apr onwards) ── */}
      {isBizOps && (() => {
        const now = nowSGT()
        const isAprilOnwards = now.getUTCMonth() >= 3
        const dismissedYear = typeof window !== 'undefined'
          ? parseInt(localStorage.getItem('payroll_archive_dismissed') || '0')
          : 0
        const alreadyDismissed = dismissedYear >= now.getFullYear()
        if (!isAprilOnwards || alreadyDismissed) return null
        const archiveYear = now.getFullYear() - 1
        return (
          <div className="card p-3 bg-amber-50 border border-amber-200 flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <p className="text-sm text-amber-800 flex-1">
              Annual payroll archive reminder — download and store {archiveYear} payslips and commission payouts offsite.
            </p>
            <Link href="/dashboard/payroll" className="text-xs text-amber-700 font-medium underline flex-shrink-0">
              Download
            </Link>
            <button
              onClick={() => {
                localStorage.setItem('payroll_archive_dismissed', String(now.getFullYear()))
                window.location.reload()
              }}
              className="text-xs text-amber-600 hover:text-amber-800 flex-shrink-0"
            >
              Dismiss
            </button>
          </div>
        )
      })()}

      {/* ── Pending membership sales banner ── */}
      {pendingMemSales > 0 && (
        <div className="card p-3 bg-amber-50 border border-amber-200 flex items-center gap-3">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-800 flex-1">
            {pendingMemSales} membership sale{pendingMemSales > 1 ? 's' : ''} pending manager confirmation
          </p>
          <Link href="/dashboard/membership/sales" className="text-xs text-amber-700 font-medium underline flex-shrink-0">
            View
          </Link>
        </div>
      )}

      {/* ── Membership rejection notifications ── */}
      {memRejectionNotifs.length > 0 && (
        <div className="card p-4 bg-red-50 border border-red-200 space-y-2">
          <p className="text-sm font-medium text-red-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {memRejectionNotifs.length} membership sale{memRejectionNotifs.length > 1 ? 's were' : ' was'} rejected
          </p>
          {memRejectionNotifs.map((n: any) => (
            <p key={n.id} className="text-xs text-red-700">
              · {n.membership_type_name} for {n.member_name} — rejected by {n.rejected_by_name}
              {n.was_new_member && ' · Member record removed, please re-register'}
              {!n.was_new_member && ' · Existing membership remains active'}
            </p>
          ))}
          <button onClick={onDismissMemRejections} className="text-xs text-red-600 underline mt-1">
            Dismiss
          </button>
        </div>
      )}
    </>
  )
}
