'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { useToast } from '@/hooks/useToast'
import { StatusBanner } from '@/components/StatusBanner'
import { MessageSquare, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NotifConfig {
  id: string
  label: string
  description: string
  recipient: string
  category: string
  is_enabled: boolean
}

const CATEGORY_LABELS: Record<string, string> = {
  sessions: 'PT Sessions',
  leave: 'Leave Management',
  sales: 'Sales',
  member: 'Member',
  escalation: 'Escalations to Biz Ops',
}

const RECIPIENT_BADGE: Record<string, string> = {
  trainer: 'bg-purple-100 text-purple-700',
  client: 'bg-blue-100 text-blue-700',
  member: 'bg-blue-100 text-blue-700',
  manager: 'bg-amber-100 text-amber-700',
  staff: 'bg-gray-100 text-gray-600',
  biz_ops: 'bg-red-100 text-red-700',
}

export default function WhatsAppNotificationsPage() {
  const supabase = createClient()
  const router = useRouter()
  const { logActivity } = useActivityLog()
  const { success, error, showMsg, showError, setError } = useToast()
  const [configs, setConfigs] = useState<NotifConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    logActivity('page_view', 'WhatsApp Notifications', 'Viewed WhatsApp notification settings')
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) { router.replace('/dashboard'); return }
    const { data: me } = await supabase.from('users').select('role').eq('id', authUser.id).single()
    if (!me || me.role !== 'business_ops') { router.replace('/dashboard'); return }

    const { data, error: err } = await supabase.from('whatsapp_notifications_config')
      .select('*').order('category').order('label')
    if (err) { showError('Failed to load config: ' + err.message); setLoading(false); return }
    setConfigs(data || [])
    setLoading(false)
  }

  const toggle = async (id: string, currentValue: boolean) => {
    setSaving(id)
    const { data: { user: authUser } } = await supabase.auth.getUser()
    const { error: err } = await supabase.from('whatsapp_notifications_config')
      .update({
        is_enabled: !currentValue,
        updated_at: new Date().toISOString(),
        updated_by: authUser?.id,
      })
      .eq('id', id)
    if (err) { showError('Failed to update: ' + err.message); setSaving(null); return }
    setConfigs(prev => prev.map(c => c.id === id ? { ...c, is_enabled: !currentValue } : c))
    const cfg = configs.find(c => c.id === id)
    logActivity('update', 'WhatsApp Notifications', `${!currentValue ? 'Enabled' : 'Disabled'} notification: ${cfg?.label}`)
    showMsg(`${cfg?.label} ${!currentValue ? 'enabled' : 'disabled'}`)
    setSaving(null)
  }

  const grouped = configs.reduce<Record<string, NotifConfig[]>>((acc, c) => {
    if (!acc[c.category]) acc[c.category] = []
    acc[c.category].push(c)
    return acc
  }, {})

  const enabledCount = configs.filter(c => c.is_enabled).length

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600" />
    </div>
  )

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <MessageSquare className="w-5 h-5 text-red-600" />
        <div>
          <h1 className="text-lg font-semibold text-gray-900">WhatsApp Notifications</h1>
          <p className="text-sm text-gray-500">
            Enable notifications one at a time. {enabledCount} of {configs.length} active.
          </p>
        </div>
      </div>

      <StatusBanner success={success} error={error} onDismissError={() => setError('')} />

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800">
          All notifications are disabled by default. Enable each one only after verifying the WhatsApp template is correct and the recipient details are in place. Messages are sent via the WhatsApp queue and processed by Twilio.
        </p>
      </div>

      {Object.entries(CATEGORY_LABELS).map(([category, categoryLabel]) => {
        const items = grouped[category]
        if (!items?.length) return null
        return (
          <div key={category} className="card p-4 space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">{categoryLabel}</h2>
            <div className="divide-y divide-gray-100">
              {items.map(cfg => (
                <div key={cfg.id} className="flex items-center gap-3 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-gray-900">{cfg.label}</p>
                      <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium capitalize',
                        RECIPIENT_BADGE[cfg.recipient] || 'bg-gray-100 text-gray-600')}>
                        {cfg.recipient.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{cfg.description}</p>
                  </div>
                  <button
                    onClick={() => toggle(cfg.id, cfg.is_enabled)}
                    disabled={saving === cfg.id}
                    className={cn(
                      'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50',
                      cfg.is_enabled ? 'bg-red-600' : 'bg-gray-200'
                    )}
                    role="switch"
                    aria-checked={cfg.is_enabled}
                  >
                    <span className={cn(
                      'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                      cfg.is_enabled ? 'translate-x-5' : 'translate-x-0'
                    )} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
