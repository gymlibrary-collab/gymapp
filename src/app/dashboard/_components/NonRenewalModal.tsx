'use client'

// ============================================================
// src/app/dashboard/_components/NonRenewalModal.tsx
//
// PURPOSE:
//   Modal dialog for recording why a member did not renew their
//   gym membership. Triggered from the expiring memberships card
//   on the manager dashboard.
//
// BUSINESS RULE:
//   Once submitted, the membership record is marked as actioned
//   (membership_actioned=true) so it no longer appears in the
//   expiring list. A non_renewal_records entry is also created.
//
// USED BY:
//   dashboard/page.tsx — manager role only
// ============================================================

import { X } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface NonRenewalModalProps {
  /** The expiring membership record being actioned (null = modal closed) */
  membership: any | null
  /** Current selected reason value */
  reason: string
  /** Called when reason select changes */
  onReasonChange: (reason: string) => void
  /** Free-text reason when 'Other' is selected */
  otherText: string
  /** Called when other text input changes */
  onOtherTextChange: (text: string) => void
  /** Whether save is in progress */
  saving: boolean
  /** Called when user confirms the non-renewal */
  onConfirm: () => void
  /** Called when user cancels or closes the modal */
  onClose: () => void
}

const NON_RENEWAL_REASONS = [
  'Relocating', 'Financial', 'Health', 'Schedule',
  'Switched gym', 'Travel', 'Completed fitness goals',
  'Dissatisfied with service', 'Temporary pause', 'Other',
]

export default function NonRenewalModal({
  membership,
  reason,
  onReasonChange,
  otherText,
  onOtherTextChange,
  saving,
  onConfirm,
  onClose,
}: NonRenewalModalProps) {
  if (!membership) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="fixed inset-0 bg-black/30" />
      <div
        className="relative bg-white rounded-2xl shadow-xl p-5 w-full max-w-sm mx-4 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 text-sm">Record Non-Renewal</h3>
          <button onClick={onClose}>
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <div>
          <p className="text-xs text-gray-500 mb-1">Member</p>
          <p className="text-sm font-medium text-gray-900">{membership.member?.full_name}</p>
          <p className="text-xs text-gray-400">
            {membership.membership_type_name} · expires {formatDate(membership.end_date)}
          </p>
        </div>

        <div>
          <label className="label">Reason for non-renewal *</label>
          <select
            className="input"
            value={reason}
            onChange={e => onReasonChange(e.target.value)}
          >
            <option value="">Select reason...</option>
            {NON_RENEWAL_REASONS.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        {reason === 'Other' && (
          <div>
            <label className="label">Please specify *</label>
            <textarea
              className="input min-h-[70px]"
              value={otherText}
              onChange={e => onOtherTextChange(e.target.value)}
              placeholder="Describe the reason..."
            />
          </div>
        )}

        <p className="text-xs text-amber-600">
          Membership remains active until {formatDate(membership.end_date)}.
          Member profile will become inactive after that date.
        </p>

        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={!reason || (reason === 'Other' && !otherText.trim()) || saving}
            className="btn-primary flex-1 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
