'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { formatSGD } from '@/lib/utils'
import { Save, CheckCircle, Info, DollarSign } from 'lucide-react'

export default function CommissionConfigPage() {
  const [config, setConfig] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [membershipPct, setMembershipPct] = useState('5')
  const [defaultHourlyRate, setDefaultHourlyRate] = useState('12')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
    // Route guard
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) { router.replace('/dashboard'); return }
    const { data: me } = await supabase.from('users').select('role').eq('id', authUser.id).single()
    if (!me || (me.role !== 'business_ops')) { router.replace('/dashboard'); return }

      const { data } = await supabase.from('commission_config').select('*')
      const cfg: Record<string, any> = {}
      data?.forEach((c: any) => { cfg[c.config_key] = c })
      setConfig(cfg)
      setMembershipPct(cfg['membership_commission_sgd']?.config_value?.toString() || '5')
      setDefaultHourlyRate(cfg['default_hourly_rate']?.config_value?.toString() || '12')
    }
    load()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const now = new Date().toISOString()

    // Supabase query builders return PromiseLike, not Promise — never use Promise.all() with them.
    await supabase.from('commission_config').upsert({
      config_key: 'membership_commission_sgd',
      config_value: parseFloat(membershipPct),
      description: 'Fixed membership sale commission per sale (SGD)',
      updated_by: user?.id, updated_at: now,
    }, { onConflict: 'config_key' })
    await supabase.from('commission_config').upsert({
      config_key: 'default_hourly_rate',
      config_value: parseFloat(defaultHourlyRate),
      description: 'Default hourly rate for part-time staff (SGD)',
      updated_by: user?.id, updated_at: now,
    }, { onConflict: 'config_key' })

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
