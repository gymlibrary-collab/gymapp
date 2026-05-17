'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { Layers, AlertTriangle } from 'lucide-react'
import { useToast } from '@/hooks/useToast'
import { StatusBanner } from '@/components/StatusBanner'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { PageSpinner } from '@/components/PageSpinner'

// ── Payroll Configuration ────────────────────────────────────
// Controls whether salary and commission are generated as
// separate payslips or combined into one per staff per month.
//
// combined_payslip_enabled = false (default):
//   → Salary payslips generated via Payroll > Generate
//   → Commission payslips generated via Payroll > Commission Payouts
//
// combined_payslip_enabled = true (ONE-WAY, CANNOT BE REVERSED):
//   → Bulk generation produces one combined payslip per staff
//   → Commission Payouts page is hidden from nav
//   → Existing separate payslips are unaffected

export default function PayrollConfigPage() {
  const { user, loading } = useCurrentUser({ allowedRoles: ['business_ops'] })
  const { logActivity } = useActivityLog()
  const supabase = createClient()
  const { success, error, showMsg, showError, setError } = useToast()

  const [combinedEnabled, setCombinedEnabled] = useState<boolean | null>(null)
  const [dataLoading, setDataLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  useEffect(() => {
    const load = async () => {
      logActivity('page_view', 'Payroll Config', 'Viewed payroll configuration')
      const { data } = await supabase.from('app_settings')
        .select('combined_payslip_enabled').eq('id', 'global').maybeSingle()
      setCombinedEnabled(!!(data as any)?.combined_payslip_enabled)
      setDataLoading(false)
    }
    if (user) load()
  }, [user])

  const handleEnable = async () => {
    setSaving(true); setError('')
    const { error: err } = await supabase.from('app_settings')
      .upsert({ id: 'global', combined_payslip_enabled: true })
    if (err) { showError('Failed to save: ' + err.message); setSaving(false); return }
    setCombinedEnabled(true)
    setShowConfirm(false)
    logActivity('update', 'Payroll Config', 'Enabled combined payslip mode — salary and commission merged into one payslip per staff')
    showMsg('Combined payslip mode enabled. Commission Payouts page is now hidden.')
    setSaving(false)
  }

  if (loading || dataLoading) return <PageSpinner />
  if (!user) return null

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Payroll Configuration</h1>
        <p className="text-sm text-gray-500">Control how salary and commission payslips are generated</p>
      </div>

      <StatusBanner success={success} error={error} onDismissError={() => setError('')} />

      <div className="card p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="bg-red-50 p-2.5 rounded-lg flex-shrink-0">
            <Layers className="w-5 h-5 text-red-600" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-gray-900 text-sm">Payslip Generation Mode</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Controls whether salary and commission are issued as separate payslips or combined into one.
            </p>
          </div>
        </div>

        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className={`p-4 ${!combinedEnabled ? 'bg-blue-50 border-b border-blue-100' : 'bg-gray-50 border-b border-gray-100'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Separate payslips</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Salary and commission generated independently. Staff receive two payslips per month if they earn commission.
                </p>
              </div>
              {!combinedEnabled && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 font-medium flex-shrink-0 ml-3">
                  Active
                </span>
              )}
            </div>
          </div>
          <div className={`p-4 ${combinedEnabled ? 'bg-blue-50' : 'bg-white'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Combined payslips</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Salary and commission merged into one payslip per staff per month. Commission Payouts page is hidden.
                </p>
              </div>
              {combinedEnabled ? (
                <span className="text-xs px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 font-medium flex-shrink-0 ml-3">
                  Active
                </span>
              ) : (
                <button
                  onClick={() => setShowConfirm(true)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors flex-shrink-0 ml-3">
                  Switch to combined
                </button>
              )}
            </div>
          </div>
        </div>

        {combinedEnabled && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              Combined payslip mode is active and <strong>cannot be reversed</strong>. All future bulk payslip generation will produce combined payslips. Existing separate payslips are unaffected.
            </p>
          </div>
        )}

        {showConfirm && (
          <div className="border border-red-200 bg-red-50 rounded-xl p-4 space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-900">This change is permanent and cannot be reversed</p>
                <p className="text-xs text-red-700 mt-1">
                  Once enabled, salary and commission will always be combined into one payslip per staff. The Commission Payouts page will be hidden. Existing payslips are not affected.
                </p>
                <p className="text-xs text-red-700 mt-1 font-medium">
                  Are you sure you want to switch to combined payslip mode?
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleEnable} disabled={saving}
                className="btn-primary text-sm disabled:opacity-50">
                {saving ? 'Saving...' : 'Yes, enable combined payslips'}
              </button>
              <button onClick={() => setShowConfirm(false)}
                className="btn-secondary text-sm">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card p-4 space-y-2">
        <p className="text-xs font-semibold text-gray-700">What changes when combined mode is enabled:</p>
        <ul className="text-xs text-gray-500 space-y-1">
          <li>· Bulk payslip generation sweeps commission items into the salary payslip automatically</li>
          <li>· Commission Payouts page is hidden from the navigation</li>
          <li>· Staff see one payslip per month (type: Combined) instead of two</li>
          <li>· CPF is computed on total earnings (salary + commission) in one calculation</li>
          <li>· Existing separate payslips remain unchanged</li>
        </ul>
      </div>
    </div>
  )
}
