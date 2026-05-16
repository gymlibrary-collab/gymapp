'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { formatSGD } from '@/lib/utils'
import { Save, CheckCircle, Info, DollarSign } from 'lucide-react'
import { useCurrentUser } from '@/hooks/useCurrentUser'

export default function CommissionConfigPage() {

  const { user, loading } = useCurrentUser({ allowedRoles: ['business_ops'] })
  const { logActivity } = useActivityLog()
  const [config, setConfig] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [membershipPct, setMembershipPct] = useState('5')
  const [defaultHourlyRate, setDefaultHourlyRate] = useState('12')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      logActivity('page_view', 'Commission Rates', 'Viewed commission rates configuration')

      // Load per-gym commission config (correct schema: gym_id based)
      const { data: gymConfigs } = await supabase.from('commission_config')
        .select('id, gym_id, default_signup_pct, default_session_pct, default_membership_commission_sgd, updated_at').order('created_at')
      const cfg: Record<string, any> = {}
      gymConfigs?.forEach((c: any) => { cfg[c.gym_id] = c })
      setConfig(cfg)
      // Use first gym's membership commission as display default
      const firstCfg = gymConfigs?.[0]
      setMembershipPct(firstCfg?.default_membership_commission_sgd?.toString() || '10')
      // Load default_hourly_rate separately (added in migration_v90_addendum)
      // Safe: if column not yet added, silently uses the default '12'
      if (firstCfg?.gym_id) {
        try {
          const { data: hrCfg } = await supabase.from('commission_config')
            .select('default_hourly_rate').eq('gym_id', firstCfg.gym_id).maybeSingle()
          if (hrCfg && (hrCfg as any).default_hourly_rate != null) {
            setDefaultHourlyRate((hrCfg as any).default_hourly_rate.toString())
          }
        } catch { /* column not yet added — use default 12 */ }
      }
    }
    load()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const now = new Date().toISOString()

    // Supabase query builders return PromiseLike, not Promise — never use Promise.all() with them.
    // Upsert commission defaults for all gyms
    const { data: gyms } = await supabase.from('gyms').select('id').eq('is_active', true)
    for (const gym of gyms || []) {
      // Try with default_hourly_rate (requires migration_v90_addendum to have run)
      const { error: upsertErr } = await supabase.from('commission_config').upsert({
        gym_id: gym.id,
        default_membership_commission_sgd: parseFloat(membershipPct),
        default_hourly_rate: parseFloat(defaultHourlyRate),
        updated_at: now,
      }, { onConflict: 'gym_id' })
      if (upsertErr) {
        // Column not yet added — save without hourly rate
        await supabase.from('commission_config').upsert({
          gym_id: gym.id,
          default_membership_commission_sgd: parseFloat(membershipPct),
          updated_at: now,
        }, { onConflict: 'gym_id' })
      }
    }

    logActivity('update', 'Commission Rates', 'Updated commission rates')
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Commission & Rate Configuration</h1>
        <p className="text-sm text-gray-500">Configure default rates. Changes apply to new records only — past records are unaffected.</p>
      </div>

      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <p>Membership sale commission is a fixed SGD amount applied equally to all staff. PT commissions (sign-up and session) are percentage-based and can be overridden per staff member in Staff Management. Part-timer hourly rates can be overridden when adding roster shifts.</p>
      </div>

      <div className="card p-4 space-y-5">
        <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-red-600" /> Membership Sales Commission
        </h2>

        <div>
          <label className="label">Membership Sale Commission (SGD per sale)</label>
          <input className="input" type="number" min="0" step="0.01"
            value={membershipPct} onChange={e => setMembershipPct(e.target.value)} />
          <p className="text-xs text-gray-400 mt-1">
            Fixed amount paid to staff per confirmed membership sale, regardless of sale price.
            Every membership sold earns {formatSGD(parseFloat(membershipPct || '0'))} commission.
          </p>
        </div>

        <div>
          <label className="label">Default Part-Time Hourly Rate (SGD/hr)</label>
          <input className="input" type="number" min="0" step="0.50"
            value={defaultHourlyRate} onChange={e => setDefaultHourlyRate(e.target.value)} />
          <p className="text-xs text-gray-400 mt-1">
            Pre-filled when adding roster shifts. Can be overridden per shift or per staff member.
            At {formatSGD(parseFloat(defaultHourlyRate || '0'))}/hr, an 8-hour shift earns {formatSGD(8 * parseFloat(defaultHourlyRate || '0'))}.
          </p>
        </div>

        <button onClick={handleSave} disabled={saving}
          className="btn-primary flex items-center gap-2">
          {saved
            ? <><CheckCircle className="w-4 h-4" /> Saved!</>
            : <><Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Configuration'}</>
          }
        </button>
      </div>

      {config['membership_commission_sgd']?.updated_at && (
        <p className="text-xs text-gray-400 text-center">
          Last updated: {new Date(config['membership_commission_sgd'].updated_at).toLocaleDateString('en-SG')}
        </p>
      )}
    </div>
  )
}
