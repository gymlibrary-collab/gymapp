'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { CalendarDays, Save } from 'lucide-react'
import { useToast } from '@/hooks/useToast'
import { StatusBanner } from '@/components/StatusBanner'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { PageSpinner } from '@/components/PageSpinner'

export default function LeavePolicyPage() {

  const { user, loading } = useCurrentUser({ allowedRoles: ['business_ops'] })
  const { logActivity } = useActivityLog()
  const supabase = createClient()
  const router = useRouter()
  const { success, error, showMsg, showError } = useToast()

  const [maxCarryForward, setMaxCarryForward] = useState('5')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      logActivity('page_view', 'Leave Policy', 'Viewed leave policy configuration')
  
      const { data: settings } = await supabase
        .from('app_settings')
        .select('max_leave_carry_forward_days')
        .eq('id', 'global')
        .single()

      if (settings) {
        setMaxCarryForward((settings as any).max_leave_carry_forward_days?.toString() || '5')
      }
    }
    load()
  }, [])


  const handleSave = async () => {
    setSaving(true)
    const val = parseInt(maxCarryForward)
    if (isNaN(val) || val < 0) { showError('Please enter a valid number of days (0 or more)'); setSaving(false); return }

    const { error: err } = await supabase
      .from('app_settings')
      .upsert({ id: 'global', max_leave_carry_forward_days: val })

    if (err) { showError('Failed to save: ' + err.message); setSaving(false); return }
    logActivity('update', 'Leave Policy', 'Updated leave carry-forward policy')
    showMsg('Leave policy saved')
    logActivity('update', 'Leave Policy', 'Updated leave carry-forward policy')
    setSaving(false)
  }

  if (loading) return (
    <PageSpinner />
  )

  return (
    <div className="space-y-5 max-w-xl">
      <div className="flex items-center gap-3">
        <CalendarDays className="w-5 h-5 text-red-600" />
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Leave Policy</h1>
          <p className="text-sm text-gray-500">Configure leave rules across all gym outlets</p>
        </div>
      </div>

      <StatusBanner success={success} error={error} />

      <div className="card p-4 space-y-4">
        <h2 className="font-semibold text-gray-900 text-sm">Year-End Carry-Forward</h2>

        <div>
          <label className="label">Maximum Carry-Forward Days</label>
          <input
            className="input"
            type="number"
            min="0"
            max="365"
            step="1"
            value={maxCarryForward}
            onChange={e => setMaxCarryForward(e.target.value)}
            placeholder="5"
          />
          <p className="text-xs text-gray-400 mt-1">
            Maximum number of unused leave days any staff member can carry forward to the next year.
            Set to 0 to disallow carry-forward entirely.
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700 space-y-1">
          <p className="font-medium">How carry-forward works:</p>
          <p>1. At year end, Biz Ops runs the Year-End Reset in <strong>Leave Management</strong></p>
          <p>2. The amount entered per staff cannot exceed this maximum cap</p>
          <p>3. Staff see their total entitlement (annual + carry-forward) in My Leave</p>
          <p>4. Carry-forward days should be reset to 0 when updating entitlements for the new year</p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary flex items-center gap-2 disabled:opacity-50">
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Leave Policy'}
        </button>
      </div>

    </div>
  )
}
