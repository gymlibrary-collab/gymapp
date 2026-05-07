'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { CalendarDays, Save } from 'lucide-react'
import { useToast } from '@/hooks/useToast'
import { StatusBanner } from '@/components/StatusBanner'
import { useCurrentUser } from '@/hooks/useCurrentUser'

export default function LeavePolicyPage() {

  const { user, loading } = useCurrentUser({ allowedRoles: ['business_ops'] })
  const { logActivity } = useActivityLog()
  const supabase = createClient()
  const router = useRouter()
  const { success, error, showMsg, showError } = useToast()

  const [maxCarryForward, setMaxCarryForward] = useState('5')
  const [saving, setSaving] = useState(false)
  const [bulkAnnual, setBulkAnnual] = useState('14')
  const [bulkMedical, setBulkMedical] = useState('14')
  const [bulkHosp, setBulkHosp] = useState('60')
  const [bulkResetting, setBulkResetting] = useState(false)
  const [bulkResult, setBulkResult] = useState('')

  useEffect(() => {
    const load = async () => {
      logActivity('page_view', 'Leave Policy', 'Viewed leave policy configuration')
        // Auth guard handled by useCurrentUser hook
  if (loading || !user) return null

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

  const handleBulkReset = async () => {
    if (!confirm(`This will reset leave entitlements for ALL active full-time staff. Run year-end reset?`)) return
    setBulkResetting(true); setBulkResult('')
    const annualDays = parseInt(bulkAnnual) || 14
    const medicalDays = parseInt(bulkMedical) || 14
    const hospDays = parseInt(bulkHosp) || 60
    const maxCarryFwd = parseInt(maxCarryForward) || 0

    // Load all active full-time staff
    const { data: staff } = await supabase.from('users')
      .select('id, leave_entitlement_days, leave_carry_forward_days')
      .in('role', ['trainer', 'staff', 'manager'])
      .eq('employment_type', 'full_time')
      .is('date_of_departure', null)
      .eq('is_archived', false)

    let count = 0
    for (const s of staff || []) {
      // Calculate unused annual leave — cap at global max
      const unused = Math.max(0, (s.leave_entitlement_days || 0) - (s.leave_carry_forward_days || 0))
      const carryFwd = Math.min(unused, maxCarryFwd)
      await supabase.from('users').update({
        leave_entitlement_days: annualDays,
        leave_carry_forward_days: carryFwd,
        medical_leave_entitlement_days: medicalDays,
        hospitalisation_leave_entitlement_days: hospDays,
      }).eq('id', s.id)
      count++
    }
    setBulkResult(`Reset complete — ${count} staff updated`)
    setBulkResetting(false)
  }

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
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600" />
    </div>
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
          <p>1. At year end, Biz Ops sets each staff member's carry-forward days in <strong>HR → Staff</strong></p>
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

      {/* Year-end bulk reset */}
      <div className="card p-4 space-y-4">
        <h2 className="font-semibold text-gray-900 text-sm">Year-End Leave Reset</h2>
        <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-xs text-amber-700 space-y-1">
          <p className="font-medium">What this does:</p>
          <p>1. Sets the new annual entitlement for ALL active full-time staff</p>
          <p>2. Calculates carry-forward from unused leave (capped at global maximum)</p>
          <p>3. Resets medical and hospitalisation to default entitlements</p>
          <p className="text-amber-600 font-medium mt-1">⚠ This action cannot be undone. Run at the start of each new year.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">New Annual Entitlement (days)</label>
            <input className="input" type="number" min="0" step="1"
              value={bulkAnnual} onChange={e => setBulkAnnual(e.target.value)} placeholder="14" />
          </div>
          <div>
            <label className="label">New Medical Entitlement (days)</label>
            <input className="input" type="number" min="0" step="1"
              value={bulkMedical} onChange={e => setBulkMedical(e.target.value)} placeholder="14" />
          </div>
          <div>
            <label className="label">New Hospitalisation (days)</label>
            <input className="input" type="number" min="0" step="1"
              value={bulkHosp} onChange={e => setBulkHosp(e.target.value)} placeholder="60" />
          </div>
        </div>
        {bulkResult && <p className="text-sm text-green-700 font-medium">✓ {bulkResult}</p>}
        <button onClick={handleBulkReset} disabled={bulkResetting}
          className="btn-primary flex items-center gap-2 disabled:opacity-50 bg-amber-600 hover:bg-amber-700">
          <Save className="w-4 h-4" />
          {bulkResetting ? 'Resetting...' : 'Run Year-End Reset'}
        </button>
      </div>
    </div>
  )
}
