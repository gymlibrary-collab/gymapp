'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { CheckCircle, AlertCircle, ChevronDown, MessageSquare, Plus, Edit2, X, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { StatusBanner } from '@/components/StatusBanner'
import { useCurrentUser } from '@/hooks/useCurrentUser'

interface Placeholder {
  key: string
  label: string
  description: string
}

interface Template {
  id: string
  notification_type: string
  label: string
  template: string
  available_placeholders: Placeholder[]
  is_active: boolean
  recipient_type: string | null
  recipient_scope: string | null
  trigger_description: string | null
  created_by_biz_ops: boolean
  send_pattern: string | null
  updated_at: string
}

const RECIPIENT_TYPES = [
  { value: 'individual_member',   label: 'Member (individual)',             scope: 'individual' },
  { value: 'individual_trainer',  label: 'Trainer (individual)',            scope: 'individual' },
  { value: 'individual_manager',  label: 'Gym manager (individual)',        scope: 'individual' },
  { value: 'individual_staff',    label: 'Staff member (individual)',       scope: 'individual' },
  { value: 'individual_biz_ops',  label: 'Biz Ops contact (individual)',   scope: 'individual' },
  { value: 'group_all_members_gym',    label: 'All members — one gym outlet',   scope: 'group' },
  { value: 'group_all_members_all',    label: 'All members — all outlets',      scope: 'group' },
  { value: 'group_all_trainers_gym',   label: 'All trainers — one gym outlet',  scope: 'group' },
  { value: 'group_all_trainers_all',   label: 'All trainers — all outlets',     scope: 'group' },
  { value: 'group_all_staff_gym',      label: 'All staff — one gym outlet',     scope: 'group' },
  { value: 'group_all_managers_all',   label: 'All managers — all outlets',     scope: 'group' },
  { value: 'group_parttimers_gym',     label: 'All part-timers — one gym outlet', scope: 'group' },
]

const CATEGORIES = [
  { value: 'sessions',   label: 'PT Sessions' },
  { value: 'leave',      label: 'Leave Management' },
  { value: 'sales',      label: 'Sales' },
  { value: 'member',     label: 'Member' },
  { value: 'escalation', label: 'Escalations to Biz Ops' },
]

const RECIPIENT_BADGE: Record<string, string> = {
  individual_member:   'bg-blue-100 text-blue-700',
  individual_trainer:  'bg-purple-100 text-purple-700',
  individual_manager:  'bg-amber-100 text-amber-700',
  individual_staff:    'bg-gray-100 text-gray-600',
  individual_biz_ops:  'bg-red-100 text-red-700',
  group_all_members_gym:   'bg-blue-100 text-blue-700',
  group_all_members_all:   'bg-blue-100 text-blue-700',
  group_all_trainers_gym:  'bg-purple-100 text-purple-700',
  group_all_trainers_all:  'bg-purple-100 text-purple-700',
  group_all_staff_gym:     'bg-gray-100 text-gray-600',
  group_all_managers_all:  'bg-amber-100 text-amber-700',
  group_parttimers_gym:    'bg-teal-100 text-teal-700',
}

const SCOPE_BADGE: Record<string, string> = {
  individual: 'bg-green-50 text-green-700 border border-green-200',
  group:      'bg-orange-50 text-orange-700 border border-orange-200',
}

// send_pattern: documents HOW the notification is triggered.
// IMPORTANT: This field is informational/documentation only.
// It does NOT control or invoke any sending logic.
// The actual WhatsApp send for each touchpoint must be
// explicitly built in application code. See comments in
// lib/whatsapp.ts and the Notifications config page for
// which touchpoints are built vs pending construction.
const SEND_PATTERNS = [
  { value: 'event_triggered', label: 'Event triggered',  description: 'Fires automatically when a specific in-app action occurs (e.g. notes submitted, leave approved). Sending logic must be wired at the event point in code.' },
  { value: 'scheduled_loop',  label: 'Scheduled loop',   description: 'Runs on a schedule looping through matching records (e.g. session reminders, birthdays). Requires a cron job or manual trigger — not yet built for most touchpoints.' },
  { value: 'manual_trigger',  label: 'Manual trigger',   description: 'Biz Ops clicks a button to send (e.g. daily birthday greetings). The trigger button is not yet built for most manual touchpoints.' },
]

const PATTERN_BADGE: Record<string, string> = {
  event_triggered: 'bg-blue-50 text-blue-700',
  scheduled_loop:  'bg-purple-50 text-purple-700',
  manual_trigger:  'bg-amber-50 text-amber-700',
}

const EMPTY_NEW = {
  notification_type: '', label: '', template: '', trigger_description: '',
  recipient_type: '', category: '', send_pattern: '',
  placeholders: [{ key: '', label: '', description: '' }],
}

export default function WhatsAppTemplatesPage() {

  const { user, loading } = useCurrentUser({ allowedRoles: ['business_ops'] })
  const { logActivity } = useActivityLog()
  const [templates, setTemplates] = useState<Template[]>([])
  const [editing, setEditing] = useState<Template | null>(null)
  const [draftText, setDraftText] = useState('')
  const [draftLabel, setDraftLabel] = useState('')
  const [showPlaceholderMenu, setShowPlaceholderMenu] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newTemplate, setNewTemplate] = useState(EMPTY_NEW)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const router = useRouter()
  const supabase = createClient()
  const { success, error, showMsg, showError, setError } = useToast()

  useEffect(() => { load() }, [])

  const load = async () => {
    logActivity('page_view', 'WhatsApp Templates', 'Viewed WhatsApp message templates')
    const { data } = await supabase.from('whatsapp_templates').select('*').order('created_at')
    setTemplates(data || [])
  }

  const openEdit = (t: Template) => {
    setEditing(t); setDraftText(t.template); setDraftLabel(t.label)
    setShowPlaceholderMenu(false); setError('')
  }

  const insertPlaceholder = (key: string) => {
    const ta = textareaRef.current; if (!ta) return
    const start = ta.selectionStart; const end = ta.selectionEnd
    const inserted = `{{${key}}}`
    const newText = draftText.slice(0, start) + inserted + draftText.slice(end)
    setDraftText(newText); setShowPlaceholderMenu(false)
    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + inserted.length, start + inserted.length) }, 0)
  }

  const handleSave = async () => {
    if (!editing) return
    if (!draftText.trim()) { setError('Template cannot be empty'); return }
    setSaving(true); setError('')
    const { data: { user } } = await supabase.auth.getUser()
    const { error: err } = await supabase.from('whatsapp_templates').update({
      label: draftLabel, template: draftText.trim(),
      updated_by: user?.id, updated_at: new Date().toISOString(),
    }).eq('id', editing.id)
    if (err) { setError(err.message); setSaving(false); return }
    await load(); setEditing(null); setSaving(false)
    showMsg('Template saved')
    logActivity('update', 'WhatsApp Templates', `Updated template: ${draftLabel}`)
  }

  const handleAddTemplate = async () => {
    const { notification_type, label, template, trigger_description, recipient_type, category, send_pattern } = newTemplate
    if (!notification_type.trim() || !label.trim() || !template.trim() || !recipient_type || !category || !send_pattern) {
      setError('All fields are required'); return
    }
    // Validate label format
    if (!label.includes(' — to ')) {
      setError("Label must follow format: '[Event] — to [Recipient]'"); return
    }
    // Check uniqueness
    const exists = templates.some(t => t.notification_type === notification_type.toLowerCase().replace(/\s+/g, '_'))
    if (exists) { setError('A template with this notification type key already exists'); return }

    const validPlaceholders = newTemplate.placeholders.filter(p => p.key.trim() && p.label.trim())
    const recipientInfo = RECIPIENT_TYPES.find(r => r.value === recipient_type)
    setSaving(true); setError('')
    const { data: { user } } = await supabase.auth.getUser()
    const typeKey = notification_type.toLowerCase().replace(/\s+/g, '_')

    const { error: err } = await supabase.from('whatsapp_templates').insert({
      notification_type: typeKey,
      label,
      template,
      available_placeholders: validPlaceholders,
      trigger_description,
      recipient_type,
      recipient_scope: recipientInfo?.scope || 'individual',
      send_pattern,
      created_by_biz_ops: true,
      updated_by: user?.id,
    })
    if (err) { setError(err.message); setSaving(false); return }

    // Auto-create matching disabled row in whatsapp_notifications_config
    await supabase.from('whatsapp_notifications_config').upsert({
      id: typeKey,
      label,
      description: trigger_description || label,
      recipient: recipient_type,
      recipient_type,
      recipient_scope: recipientInfo?.scope || 'individual',
      category,
      is_enabled: false,
    }, { onConflict: 'id', ignoreDuplicates: true })

    await load()
    setShowAddForm(false)
    setNewTemplate(EMPTY_NEW)
    setSaving(false)
    showMsg('Template added — a disabled toggle has been created on the Notifications page')
    logActivity('create', 'WhatsApp Templates', `Added template: ${label}`)
  }

  const handleDelete = async (t: Template) => {
    if (!t.created_by_biz_ops) return
    if (!window.confirm(`Delete "${t.label}"? This will also remove its toggle from the Notifications page.`)) return
    setDeleting(t.id)
    await supabase.from('whatsapp_notifications_config').delete().eq('id', t.notification_type)
    const { error: err } = await supabase.from('whatsapp_templates').delete().eq('id', t.id)
    if (err) { showError('Failed to delete: ' + err.message); setDeleting(null); return }
    await load(); setDeleting(null)
    showMsg('Template deleted')
    logActivity('delete', 'WhatsApp Templates', `Deleted template: ${t.label}`)
  }

  const handleToggleActive = async (t: Template) => {
    await supabase.from('whatsapp_templates').update({ is_active: !t.is_active }).eq('id', t.id)
    await load()
    showMsg(t.is_active ? 'Template disabled' : 'Template enabled')
  }

  const preview = (template: string, placeholders: Placeholder[]) => {
    let text = template
    placeholders.forEach(p => { text = text.replace(new RegExp(`\\{\\{${p.key}\\}\\}`, 'g'), `[${p.label}]`) })
    return text
  }

  const recipientLabel = (type: string | null) => RECIPIENT_TYPES.find(r => r.value === type)?.label || type || '—'

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">WhatsApp Message Templates</h1>
          <p className="text-sm text-gray-500">
            Global templates for all automated notifications. Adding a template automatically creates a disabled toggle on the Notifications page.
          </p>
        </div>
        <button onClick={() => { setShowAddForm(!showAddForm); setError('') }}
          className="btn-primary flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Add Template
        </button>
      </div>

      <StatusBanner success={success} error={error} onDismissError={() => setError('')} />

      {/* Add new template form */}
      {showAddForm && (
        <div className="card p-4 space-y-4 border-red-200">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 text-sm">Add New Template</h2>
            <button onClick={() => setShowAddForm(false)}><X className="w-4 h-4 text-gray-400" /></button>
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-lg p-2.5 text-xs text-blue-700">
            Label must follow the format: <span className="font-mono font-medium">[Event] — to [Recipient]</span>
            &nbsp;e.g. "Renewal reminder — to member"
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Notification Type Key *</label>
              <input className="input" value={newTemplate.notification_type}
                onChange={e => setNewTemplate(f => ({ ...f, notification_type: e.target.value }))}
                placeholder="e.g. renewal_reminder" />
              <p className="text-xs text-gray-400 mt-1">Lowercase with underscores. Must be unique.</p>
            </div>
            <div>
              <label className="label">Display Label *</label>
              <input className="input" value={newTemplate.label}
                onChange={e => setNewTemplate(f => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Renewal reminder — to member" />
            </div>
          </div>

          {/* Recipient — two fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Recipient Type *</label>
              <select className="input" value={newTemplate.recipient_type}
                onChange={e => setNewTemplate(f => ({ ...f, recipient_type: e.target.value }))}>
                <option value="">Select recipient...</option>
                <optgroup label="Individual">
                  {RECIPIENT_TYPES.filter(r => r.scope === 'individual').map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </optgroup>
                <optgroup label="Group">
                  {RECIPIENT_TYPES.filter(r => r.scope === 'group').map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </optgroup>
              </select>
            </div>
            <div>
              <label className="label">Category *</label>
              <select className="input" value={newTemplate.category}
                onChange={e => setNewTemplate(f => ({ ...f, category: e.target.value }))}>
                <option value="">Select category...</option>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="label">When is this sent? (trigger description)</label>
            <input className="input" value={newTemplate.trigger_description}
              onChange={e => setNewTemplate(f => ({ ...f, trigger_description: e.target.value }))}
              placeholder="e.g. Sent to member 3 days before their membership expires" />
          </div>

          <div>
            <label className="label">How is this triggered? *</label>
            <select className="input" value={newTemplate.send_pattern}
              onChange={e => setNewTemplate(f => ({ ...f, send_pattern: e.target.value }))}>
              <option value="">Select send pattern...</option>
              {SEND_PATTERNS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            {newTemplate.send_pattern && (
              <div className="mt-1.5 bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-amber-800">
                    {SEND_PATTERNS.find(p => p.value === newTemplate.send_pattern)?.description}
                  </p>
                  <p className="text-xs text-amber-700 font-medium mt-0.5">
                    Note: adding this template does not build the sending logic. The notification toggle will appear on the Notifications page but will not send until a developer wires up the trigger in code.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="label">Message Template *</label>
            <textarea className="input min-h-[100px] resize-none" value={newTemplate.template}
              onChange={e => setNewTemplate(f => ({ ...f, template: e.target.value }))}
              placeholder="Write the message. Use {{placeholder_key}} for dynamic fields." />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Available Placeholders</label>
              <button type="button" onClick={() => setNewTemplate(f => ({
                ...f, placeholders: [...f.placeholders, { key: '', label: '', description: '' }]
              }))} className="text-xs text-red-600 hover:underline">+ Add field</button>
            </div>
            <div className="space-y-2">
              {newTemplate.placeholders.map((p, i) => (
                <div key={i} className="grid grid-cols-3 gap-2">
                  <input className="input text-xs" placeholder="key (e.g. member_name)" value={p.key}
                    onChange={e => setNewTemplate(f => ({ ...f, placeholders: f.placeholders.map((pl, j) => j === i ? { ...pl, key: e.target.value } : pl) }))} />
                  <input className="input text-xs" placeholder="Label (e.g. Member Name)" value={p.label}
                    onChange={e => setNewTemplate(f => ({ ...f, placeholders: f.placeholders.map((pl, j) => j === i ? { ...pl, label: e.target.value } : pl) }))} />
                  <input className="input text-xs" placeholder="Description (optional)" value={p.description}
                    onChange={e => setNewTemplate(f => ({ ...f, placeholders: f.placeholders.map((pl, j) => j === i ? { ...pl, description: e.target.value } : pl) }))} />
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={handleAddTemplate} disabled={saving} className="btn-primary flex-1 disabled:opacity-50">
              {saving ? 'Saving...' : 'Add Template'}
            </button>
            <button onClick={() => setShowAddForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      {/* Template list */}
      <div className="space-y-3">
        {templates.map(t => (
          <div key={t.id} className={cn('card', !t.is_active && 'opacity-60')}>
            <div className="flex items-start justify-between gap-3 p-4 border-b border-gray-100">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <MessageSquare className="w-4 h-4 text-red-600 flex-shrink-0" />
                <p className="font-semibold text-gray-900 text-sm">{t.label}</p>
                <span className="text-xs text-gray-400 font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                  {t.notification_type}
                </span>
                {t.recipient_type && (
                  <>
                    <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium',
                      RECIPIENT_BADGE[t.recipient_type] || 'bg-gray-100 text-gray-600')}>
                      {recipientLabel(t.recipient_type)}
                    </span>
                    {t.recipient_scope && (
                      <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium',
                        SCOPE_BADGE[t.recipient_scope])}>
                        {t.recipient_scope}
                      </span>
                    )}
                  </>
                )}
                {t.send_pattern && (
                  <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium',
                    PATTERN_BADGE[t.send_pattern] || 'bg-gray-100 text-gray-600')}
                    title={SEND_PATTERNS.find(p => p.value === t.send_pattern)?.description}>
                    {SEND_PATTERNS.find(p => p.value === t.send_pattern)?.label || t.send_pattern}
                  </span>
                )}
                {!t.is_active && (
                  <span className="text-xs bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full">Disabled</span>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {t.created_by_biz_ops && (
                  <button onClick={() => handleDelete(t)} disabled={deleting === t.id}
                    className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 disabled:opacity-50">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <button onClick={() => handleToggleActive(t)}
                  className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100">
                  {t.is_active ? 'Disable' : 'Enable'}
                </button>
                <button onClick={() => editing?.id === t.id ? setEditing(null) : openEdit(t)}
                  className="btn-secondary text-xs py-1.5 flex items-center gap-1">
                  <Edit2 className="w-3.5 h-3.5" />
                  {editing?.id === t.id ? 'Cancel' : 'Edit'}
                </button>
              </div>
            </div>

            {/* Trigger description */}
            {t.trigger_description && editing?.id !== t.id && (
              <div className="px-4 pt-3 pb-0">
                <p className="text-xs text-gray-500 italic">{t.trigger_description}</p>
              </div>
            )}

            {/* Preview (when not editing) */}
            {editing?.id !== t.id && (
              <div className="p-4 space-y-3">
                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Message Preview</p>
                <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 leading-relaxed">
                  {preview(t.template, t.available_placeholders)}
                </p>
                {t.available_placeholders.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {t.available_placeholders.map(p => (
                      <span key={p.key} title={p.description}
                        className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-mono cursor-help">
                        {`{{${p.key}}}`}
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-xs text-gray-400">
                  Last updated: {new Date(t.updated_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
            )}

            {/* Edit form */}
            {editing?.id === t.id && (
              <div className="p-4 space-y-4">
                <div>
                  <label className="label">Display Label</label>
                  <input className="input" value={draftLabel} onChange={e => setDraftLabel(e.target.value)} />
                  <p className="text-xs text-gray-400 mt-1">Format: [Event] — to [Recipient]</p>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="label mb-0">Message Template *</label>
                    <div className="relative">
                      <button type="button" onClick={() => setShowPlaceholderMenu(m => !m)}
                        className="flex items-center gap-1 text-xs text-red-600 font-medium hover:text-red-700 px-2 py-1 bg-red-50 rounded-lg border border-red-200">
                        Insert field <ChevronDown className="w-3 h-3" />
                      </button>
                      {showPlaceholderMenu && (
                        <div className="absolute right-0 top-8 z-20 bg-white border border-gray-200 rounded-xl shadow-lg w-72 py-1">
                          {editing.available_placeholders.map(p => (
                            <button key={p.key} type="button" onClick={() => insertPlaceholder(p.key)}
                              className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-start gap-2">
                              <span className="font-mono text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5">
                                {`{{${p.key}}}`}
                              </span>
                              <div>
                                <p className="text-xs font-medium text-gray-900">{p.label}</p>
                                {p.description && <p className="text-xs text-gray-400">{p.description}</p>}
                              </div>
                            </button>
                          ))}
                          {editing.available_placeholders.length === 0 && (
                            <p className="text-xs text-gray-400 px-3 py-2">No placeholders defined</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <textarea ref={textareaRef} className="input min-h-[120px] resize-none font-mono text-sm"
                    value={draftText} onChange={e => setDraftText(e.target.value)}
                    onClick={() => setShowPlaceholderMenu(false)} />
                  <p className="text-xs text-gray-400 mt-1">
                    Click inside the message, then use "Insert field" to add a placeholder at that position.
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1.5">Live Preview</p>
                  <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 leading-relaxed">
                    {preview(draftText, editing.available_placeholders) || <span className="text-gray-400 italic">No message yet</span>}
                  </p>
                </div>
                {editing.available_placeholders.length > 0 && (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-1.5">
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Available Fields</p>
                    {editing.available_placeholders.map(p => (
                      <div key={p.key} className="flex items-start gap-2">
                        <span className="font-mono text-xs text-blue-700 bg-white px-1.5 py-0.5 rounded border border-blue-200 flex-shrink-0">
                          {`{{${p.key}}}`}
                        </span>
                        <div>
                          <span className="text-xs font-medium text-blue-800">{p.label}</span>
                          {p.description && <span className="text-xs text-blue-500"> — {p.description}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 disabled:opacity-50">
                    {saving ? 'Saving...' : 'Save Template'}
                  </button>
                  <button onClick={() => { setEditing(null); setShowPlaceholderMenu(false) }}
                    className="btn-secondary">Cancel</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {templates.length === 0 && (
        <div className="card p-8 text-center">
          <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No templates yet.</p>
        </div>
      )}
    </div>
  )
}
