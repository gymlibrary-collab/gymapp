'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { AlertTriangle, Save } from 'lucide-react'
import { useToast } from '@/hooks/useToast'
import { StatusBanner } from '@/components/StatusBanner'

interface ThresholdField {
  key: string
  label: string
  description: string
  unit: 'hours' | 'days'
}

const FIELDS: ThresholdField[] = [
  {
    key: 'escalation_leave_hours',
    label: 'Leave Approval',
    description: 'Hours before a pending leave application escalates from manager to Biz Ops',
    unit: 'hours',
  },
  {
    key: 'escalation_pt_package_hours',
    label: 'PT Package Sales',
    description: 'Hours before an unconfirmed PT package sale escalates from manager to Biz Ops',
    unit: 'hours',
  },
  {
    key: 'escalation_pt_session_hours',
    label: 'PT Session Notes',
    description: 'Hours before unconfirmed session notes escalate from manager to Biz Ops',
    unit: 'hours',
  },
  {
    key: 'escalation_membership_sales_hours',
    label: 'Membership Sales',
    description: 'Hours before a pending membership sale escalates from manager to Biz Ops',
    unit: 'hours',
  },
  {
    key: 'escalation_membership_expiry_days',
    label: 'Membership Expiry',
    description: 'Days before a membership expiry escalates from manager to Biz Ops if not actioned',
    unit: 'days',
  },
]

export default function EscalationSettingsPage() {
  const supabase = createClient()
  const router = useRouter()
  const { logActivity } = useActivityLog()
  const { success, error, showMsg, showError, setError } = useToast()
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      logActivity('page_view', 'Escalation Settings', 'Viewed escalation settings')
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) { router.replace('/dashboard'); return }
      const { data: me } = await supabase.from('users').select('role').eq('id', authUser.id).single()
      if (!me || me.role !== 'business_ops') { router.replace('/dashboard'); return }

      const { data: settings } = await supabase.from('app_settings')
        .select(FIELDS.map(f => f.key).join(', '))
        .eq('id', 'global').single()

      if (settings) {
        const v: Record<string, string> = {}
        FIELDS.forEach(f => { v[f.key] = String((settings as any)[f.key] ?? (f.unit === 'hours' ? 48 : 7)) })
        setValues(v)
      }
      setLoading(false)
    }
    load()
  }, [])

  const handleSave = async () => {
    // Validate — all values must be positive integers
    for (const f of FIELDS) {
      const v = parseInt(values[f.key])
      if (isNaN(v) || v <= 0) {
        setError(`${f.label} must be a positive number`)
        return
      }
    }
    setSaving(true)
    const update: Record<string, number> = { id: 'global' as any }
    FIELDS.forEach(f => { update[f.key] = parseInt(values[f.key]) })

    const { error: err } = await supabase.from('app_settings').upsert(update)
    if (err) { showError('Failed to save: ' + err.message); setSaving(false); return }
    logActivity('update', 'Escalation Settings', 'Updated escalation thresholds')
    showMsg('Escalation settings saved')
    setSaving(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600" />
    </div>
  )

  return (
    <div className="space-y-5 max-w-xl">
      <div className="flex items-center gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-500" />
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Escalation Settings</h1>
          <p className="text-sm text-gray-500">Configure how long before unactioned items escalate to Business Operations</p>
        </div>
      </div>

      <StatusBanner success={success} error={error} onDismissError={() => setError('')} />

      <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700 space-y-1">
        <p className="font-medium">How escalation works:</p>
        <p>When an item is not actioned within the threshold, it is automatically routed to Biz Ops. Both the manager and Biz Ops can then action it — whoever acts first resolves it.</p>
        <p>Escalation is checked on the relevant staff member's dashboard load — no scheduled job required.</p>
      </div>

      <div className="card p-4 space-y-4">
        {FIELDS.map(f => (
          <div key={f.key}>
            <div className="flex items-center justify-between mb-1">
              <label className="label mb-0">{f.label}</label>
              <span className="text-xs text-gray-400">{f.unit}</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                className="input flex-1"
                type="number"
                min="1"
                step="1"
                value={values[f.key] || ''}
                onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
              />
              <span className="text-sm text-gray-500 whitespace-nowrap">
                {f.unit === 'hours'
                  ? `(${Math.round((parseInt(values[f.key]) || 0) / 24 * 10) / 10} days)`
                  : `(${parseInt(values[f.key]) || 0} days)`
                }
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">{f.description}</p>
          </div>
        ))}

        <button onClick={handleSave} disabled={saving}
          className="btn-primary flex items-center gap-2 disabled:opacity-50">
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Escalation Settings'}
        </button>
      </div>
    </div>
  )
}
