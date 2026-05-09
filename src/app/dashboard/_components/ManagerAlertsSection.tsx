'use client'

// ============================================================
// src/app/dashboard/_components/ManagerAlertsSection.tsx
//
// PURPOSE:
//   Renders the "Alerts Requiring Attention" section on the
//   manager dashboard. Contains four alert cards:
//
//   1. Low session packages — PT packages with ≤3 sessions left
//   2. Expiring memberships — memberships expiring within 30 days
//      that haven't been actioned (renew or record non-renewal)
//   3. Expiring packages — PT packages expiring within 14 days by date
//   4. At-risk members — members whose package expired 30 days ago
//      with no new active package (potential churn)
//
// NON-RENEWAL:
//   The "Non-Renewal" button on expiring memberships opens the
//   NonRenewalModal. The onNonRenewal callback sets the modal state
//   in the parent and resets the reason fields.
//
// USED BY:
//   dashboard/page.tsx — manager role only (hidden when totalAlerts=0)
// ============================================================

import { AlertCircle, AlertTriangle, Package, UserX } from 'lucide-react'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'

interface ManagerAlertsSectionProps {
  /** Whether to render the section (totalAlerts > 0) */
  totalAlerts: number
  /** Active PT packages with ≤3 sessions remaining */
  lowSessionPackages: any[]
  /** Memberships expiring within 30 days, unactioned */
  expiringMemberships: any[]
  /** PT packages expiring within 14 days by date */
  expiringPackages: any[]
  /** Members with expired packages and no renewal */
  atRiskMembers: any[]
  /** Called when manager clicks "Non-Renewal" on an expiring membership */
  onNonRenewal: (membership: any) => void
}

export default function ManagerAlertsSection({
  totalAlerts,
  lowSessionPackages,
  expiringMemberships,
  expiringPackages,
  atRiskMembers,
  onNonRenewal,
}: ManagerAlertsSectionProps) {
  if (totalAlerts === 0) return null

  const unactionedMems = expiringMemberships.filter((m: any) => !m.membership_actioned)

  return (
    <div className="space-y-3">
      <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-500" /> Alerts Requiring Attention
      </h2>

      {/* Low session packages */}
      {lowSessionPackages.length > 0 && (
        <div className="card">
          <div className="p-3 border-b border-amber-100 bg-amber-50 rounded-t-xl">
            <p className="text-sm font-medium text-amber-800 flex items-center gap-2">
              <Package className="w-4 h-4" />
              {lowSessionPackages.length} PT Package{lowSessionPackages.length > 1 ? 's' : ''} Running Low (≤3 sessions left)
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {lowSessionPackages.map((pkg: any) => (
              <div key={pkg.id} className="flex items-center gap-3 p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{pkg.member?.full_name}</p>
                  <p className="text-xs text-gray-500">{pkg.package_name} · {pkg.trainer?.full_name}</p>
                </div>
                <span className="text-sm font-bold text-amber-600 flex-shrink-0">
                  {pkg.total_sessions - pkg.sessions_used} left
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expiring memberships — must be actioned (renew or non-renewal) */}
      {unactionedMems.length > 0 && (
        <div className="card border border-amber-300 overflow-hidden">
          <div className="bg-amber-500 px-4 py-2 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-white flex-shrink-0" />
            <p className="text-sm font-semibold text-white">
              {unactionedMems.length} membership{unactionedMems.length > 1 ? 's' : ''} expiring — action required
            </p>
          </div>
          <div className="divide-y divide-amber-100">
            {unactionedMems.map((m: any) => (
              <div key={m.id} className="flex items-center gap-3 p-3 bg-amber-50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{m.member?.full_name}</p>
                  <p className="text-xs text-amber-700">
                    {m.membership_type_name} · expires {formatDate(m.end_date)}
                    {m.escalated_to_biz_ops && (
                      <span className="ml-2 text-red-600 font-medium">⚠ Escalated to Biz Ops</span>
                    )}
                  </p>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <Link
                    href={`/dashboard/members/${m.member_id}`}
                    className="text-xs bg-red-600 text-white px-2.5 py-1.5 rounded-lg font-medium hover:bg-red-700"
                  >
                    Renew
                  </Link>
                  <button
                    onClick={() => onNonRenewal(m)}
                    className="text-xs bg-white text-amber-700 border border-amber-300 px-2.5 py-1.5 rounded-lg font-medium hover:bg-amber-50"
                  >
                    Non-Renewal
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expiring PT packages (by date) */}
      {expiringPackages.length > 0 && (
        <div className="card">
          <div className="p-3 border-b border-red-100 bg-red-50 rounded-t-xl">
            <p className="text-sm font-medium text-red-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {expiringPackages.length} PT Package{expiringPackages.length > 1 ? 's' : ''} Expiring Within 14 Days
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {expiringPackages.map((pkg: any) => (
              <div key={pkg.id} className="flex items-center gap-3 p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{pkg.member?.full_name}</p>
                  <p className="text-xs text-gray-500">{pkg.package_name} · {pkg.trainer?.full_name}</p>
                </div>
                <span className="text-xs text-red-600 font-medium flex-shrink-0">
                  Expires {formatDate(pkg.end_date_calculated)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* At-risk members — expired package, no renewal */}
      {atRiskMembers.length > 0 && (
        <div className="card">
          <div className="p-3 border-b border-gray-200 bg-gray-50 rounded-t-xl">
            <p className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <UserX className="w-4 h-4" />
              {atRiskMembers.length} Member{atRiskMembers.length > 1 ? 's' : ''} with Expired Package — Not Renewed
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {atRiskMembers.map((m: any) => (
              <div key={m.member_id} className="flex items-start gap-3 p-3">
                <UserX className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{m.member?.full_name}</p>
                  <p className="text-xs text-gray-500">{m.member?.phone} · expired {formatDate(m.end_date_calculated)}</p>
                  {m.non_renewal_reason && (
                    <p className="text-xs text-red-500 mt-0.5">Reason: {m.non_renewal_reason}</p>
                  )}
                  {m.renewal_status === 'undecided' && (
                    <p className="text-xs text-amber-500 mt-0.5">Member was undecided — follow up needed</p>
                  )}
                  {!m.renewal_status && (
                    <p className="text-xs text-gray-400 mt-0.5 italic">No renewal decision recorded</p>
                  )}
                </div>
                <Link href={`/dashboard/members/${m.member_id}`} className="text-xs text-red-600 font-medium flex-shrink-0">
                  View
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
