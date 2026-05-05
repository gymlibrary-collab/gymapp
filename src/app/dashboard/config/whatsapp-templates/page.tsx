'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { CheckCircle, AlertCircle, ChevronDown, MessageSquare, Plus, Edit2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'

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
  updated_at: string
}

export default function WhatsAppTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [editing, setEditing] = useState<Template | null>(null)
  const [draftText, setDraftText] = useState('')
  const [draftLabel, setDraftLabel] = useState('')
  const [showPlaceholderMenu, setShowPlaceholderMenu] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newTemplate, setNewTemplate] = useState({
    notification_type: '', label: '', template: '',
    placeholders: [{ key: '', label: '', description: '' }],
  })
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const router = useRouter()
  const supabase = createClient()

  const { success, error, showMsg, showError, setError } = useToast()

  useEffect(() => { load() }, [])

  const load = async () => {
    // Route guard
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) { router.replace('/dashboard'); return }
    const { data: me } = await supabase.from('users').select('role').eq('id', authUser.id).single()
    if (!me || (me.role !== 'business_ops')) { router.replace('/dashboard'); return }

    const { data } = await supabase.from('whatsapp_templates')
      .select('*').order('created_at')
    setTemplates(data || [])
  }

  const openEdit = (t: Template) => {
    setEditing(t)
    setDraftText(t.template)
    setDraftLabel(t.label)
    setShowPlaceholderMenu(false)
    setError('')
  }

  const insertPlaceholder = (key: string) => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const before = draftText.slice(0, start)
    const after = draftText.slice(end)
    const inserted = `{{${key}}}`
    const newText = before + inserted + after
    setDraftText(newText)
    setShowPlaceholderMenu(false)
    // Restore cursor after inserted text
    setTimeout(() => {
      ta.focus()
      ta.setSelectionRange(start + inserted.length, start + inserted.length)
    }, 0)
  }

  const handleSave = async () => {
    if (!editing) return
    if (!draftText.trim()) { setError('Template cannot be empty'); return }
    setSaving(true); setError('')
    const { data: { user } } = await supabase.auth.getUser()
    const { error: err } = await supabase.from('whatsapp_templates').update({
      label: draftLabel,
      template: draftText.trim(),
      updated_by: user?.id,
      updated_at: new Date().toISOString(),
    }).eq('id', editing.id)
    if (err) { setError(err.message); setSaving(false); return }
    await load(); setEditing(null); setSaving(false)
    showMsg('Template saved')
  }

  const handleAddTemplate = async () => {
    if (!newTemplate.notification_type.trim() || !newTemplate.label.trim() || !newTemplate.template.trim()) {
      setError('All fields are required'); return
    }
    const validPlaceholders = newTemplate.placeholders.filter(p => p.key.trim() && p.label.trim())
    setSaving(true); setError('')
    const { data: { user } } = await supabase.auth.getUser()
    const { error: err } = await supabase.from('whatsapp_templates').insert({
      notification_type: newTemplate.notification_type.toLowerCase().replace(/\s+/g, '_'),
      label: newTemplate.label,
      template: newTemplate.template,
      available_placeholders: validPlaceholders,
      updated_by: user?.id,
    })
    if (err) { setError(err.message); setSaving(false); return }
    await load()
    setShowAddForm(false)
    setNewTemplate({ notification_type: '', label: '', template: '', placeholders: [{ key: '', label: '', description: '' }] })
    setSaving(false); showMsg('Template added')
  }

  const handleToggleActive = async (t: Template) => {
    await supabase.from('whatsapp_templates').update({ is_active: !t.is_active }).eq('id', t.id)
    await load()
    showMsg(t.is_active ? 'Template disabled' : 'Template enabled')
  }

  // Preview: replace placeholders with sample values for display
  const preview = (template: string, placeholders: Placeholder[]) => {
    let text = template
    placeholders.forEach(p => {
      text = text.replace(new RegExp(`\\{\\{${p.key}\\}\\}`, 'g'), `[${p.label}]`)
    })
    return text
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">WhatsApp Message Templates</h1>
          <p className="text-sm text-gray-500">
            Global templates for all automated notifications. Changes apply immediately to future messages.
          </p>
        </div>
        <button onClick={() => { setShowAddForm(!showAddForm); setError('') }}
          className="btn-primary flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Add Template
        </button>
      </div>

      {success && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />{success}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
          <button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Add new template form */}
      {showAddForm && (
        <div className="card p-4 space-y-4 border-red-200">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 text-sm">Add New Template</h2>
            <button onClick={() => setShowAddForm(false)}><X className="w-4 h-4 text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Notification Type Key *</label>
              <input className="input" value={newTemplate.notification_type}
                onChange={e => setNewTemplate(f => ({ ...f, notification_type: e.target.value }))}
                placeholder="e.g. renewal_reminder" />
              <p className="text-xs text-gray-400 mt-1">Lowercase, underscores only. Used in code.</p>
            </div>
            <div>
              <label className="label">Display Label *</label>
              <input className="input" value={newTemplate.label}
                onChange={e => setNewTemplate(f => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Package Renewal Reminder" />
            </div>
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
            {/* Header */}
            <div className="flex items-start justify-between gap-3 p-4 border-b border-gray-100">
              <div className="flex items-center gap-2 flex-wrap">
                <MessageSquare className="w-4 h-4 text-red-600 flex-shrink-0" />
                <p className="font-semibold text-gray-900 text-sm">{t.label}</p>
                <span className="text-xs text-gray-400 font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                  {t.notification_type}
                </span>
                {!t.is_active && (
                  <span className="text-xs bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full">Disabled</span>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
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
                  <input className="input" value={draftLabel}
                    onChange={e => setDraftLabel(e.target.value)} />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="label mb-0">Message Template *</label>
                    {/* Placeholder dropdown */}
                    <div className="relative">
                      <button type="button" onClick={() => setShowPlaceholderMenu(m => !m)}
                        className="flex items-center gap-1 text-xs text-red-600 font-medium hover:text-red-700 px-2 py-1 bg-red-50 rounded-lg border border-red-200">
                        Insert field <ChevronDown className="w-3 h-3" />
                      </button>
                      {showPlaceholderMenu && (
                        <div className="absolute right-0 top-8 z-20 bg-white border border-gray-200 rounded-xl shadow-lg w-72 py-1">
                          {editing.available_placeholders.map(p => (
                            <button key={p.key} type="button"
                              onClick={() => insertPlaceholder(p.key)}
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

                {/* Live preview */}
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1.5">Live Preview</p>
                  <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 leading-relaxed">
                    {preview(draftText, editing.available_placeholders) || <span className="text-gray-400 italic">No message yet</span>}
                  </p>
                </div>

                {/* Available placeholders reference */}
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
                  <button onClick={handleSave} disabled={saving}
                    className="btn-primary flex-1 disabled:opacity-50">
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
          <p className="text-gray-500 text-sm">No templates yet. Run migration v25 to seed the defaults.</p>
        </div>
      )}
    </div>
  )
}
