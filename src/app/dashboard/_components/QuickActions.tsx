'use client'

// ============================================================
// src/app/dashboard/_components/QuickActions.tsx
//
// PURPOSE:
//   Renders the Quick Actions card at the bottom of the dashboard
//   for trainer and staff roles.
//
//   Trainer actions:
//     - Register Member → /dashboard/members/new
//     - Schedule Session → /dashboard/pt/sessions/new
//
//   Staff actions:
//     - Log Membership Sale → /dashboard/membership/sales
//     - Member Lookup → /dashboard/members
//
// USED BY:
//   dashboard/page.tsx — trainer and staff roles
// ============================================================

import Link from 'next/link'

interface QuickActionsProps {
  /** Role determines which action buttons to show */
  role: 'trainer' | 'staff'
}

export default function QuickActions({ role }: QuickActionsProps) {
  return (
    <div className="card p-4">
      <h2 className="font-semibold text-gray-900 text-sm mb-3">Quick Actions</h2>
      <div className="grid grid-cols-2 gap-2">
        {role === 'trainer' ? (
          <>
            <Link href="/dashboard/members/new" className="btn-primary text-center text-sm">
              Register Member
            </Link>
            <Link href="/dashboard/pt/sessions/new" className="btn-secondary text-center text-sm">
              Schedule Session
            </Link>
          </>
        ) : (
          <>
            <Link href="/dashboard/membership/sales" className="btn-primary text-center text-sm">
              Log Membership Sale
            </Link>
            <Link href="/dashboard/members" className="btn-secondary text-center text-sm">
              Member Lookup
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
