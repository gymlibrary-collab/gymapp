'use client'

// ============================================================
// src/app/dashboard/_components/PendingConfirmationsBanner.tsx
//
// PURPOSE:
//   Renders pending actions banners on the manager dashboard:
//
//   1. Pending confirmations banner — membership sales + PT sessions
//      awaiting manager confirmation. Shows count and links to
//      the relevant confirmation pages.
//
//   2. Pending leave banner — leave applications from gym staff
//      awaiting manager approval.
//
//   Both banners only show when their count > 0.
//
// USED BY:
//   dashboard/page.tsx — manager role only
// ============================================================

import { Bell, Calendar } from 'lucide-react'
import Link from 'next/link'

interface PendingConfirmationsBannerProps {
  /** Count of pending membership sales awaiting confirmation */
  pendingMemberships: number
  /** Count of completed PT sessions awaiting manager confirmation */
  pendingSessions: number
  /** Count of pending leave applications from gym staff */
  pendingLeave: number
}

export default function PendingConfirmationsBanner({
  pendingMemberships,
  pendingSessions,
  pendingLeave,
}: PendingConfirmationsBannerProps) {
  const totalPending = pendingMemberships + pendingSessions

  return (
    <>
      {/* Pending confirmations */}
      {totalPending > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <Bell className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">
              {totalPending} item{totalPending > 1 ? 's' : ''} pending your confirmation
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              {pendingMemberships > 0 && `${pendingMemberships} membership sale${pendingMemberships > 1 ? 's' : ''}`}
              {pendingMemberships > 0 && pendingSessions > 0 && ' · '}
              {pendingSessions > 0 && `${pendingSessions} PT session${pendingSessions > 1 ? 's' : ''}`}
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {pendingMemberships > 0 && (
              <Link href="/dashboard/membership/sales" className="btn-primary text-xs py-1.5">
                Memberships
              </Link>
            )}
            {pendingSessions > 0 && (
              <Link href="/dashboard/pt/sessions" className="btn-secondary text-xs py-1.5">
                Sessions
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Pending leave */}
      {pendingLeave > 0 && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <Calendar className="w-5 h-5 text-blue-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-800">
              {pendingLeave} leave application{pendingLeave > 1 ? 's' : ''} awaiting approval
            </p>
          </div>
          <Link href="/dashboard/hr/leave" className="btn-primary text-xs py-1.5 flex-shrink-0">
            Review
          </Link>
        </div>
      )}
    </>
  )
}
