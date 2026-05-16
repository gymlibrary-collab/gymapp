'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { formatSGD, formatDate, todaySGT} from '@/lib/utils'
import { Package, User, Calendar, ChevronRight, CheckCircle, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { useToast } from '@/hooks/useToast'
import { StatusBanner } from '@/components/StatusBanner'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { PageSpinner } from '@/components/PageSpinner'

export default function PtOnboardPage() {
  const { user, loading } = useCurrentUser({ allowedRoles: ['trainer', 'manager', 'business_ops'] })
  const { logActivity } = useActivityLog()
  const supabase = createClient()
  const router = useRouter()
  const { success, error, showMsg, showError, setError } = useToast()

  const [currentUser, setCurrentUser] = useState<any>(null)
  const [activeMembers, setActiveMembers] = useState<any[]>([])
  const [templates, setTemplates] = useState<any[]>([])
  const [saving, setSaving] = useState(false)

  const [tab, setTab] = useState<'renew' | 'new'>('renew')
  const [form, setForm] = useState({
    member_id: '',
    template_id: '',
    start_date: todaySGT(),
    secondary_member_id: '',
  })
  const [trainerMembers, setTrainerMembers] = useState<any[]>([]) // members with active package by this trainer

  const loadData = async () => {
    logActivity('page_view', 'PT Onboarding', 'Viewed pt onboarding')
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) { router.replace('/dashboard'); return }

    const { data: me } = await supabase.from('users')
      .select('*, gyms:manager_gym_id(name)')
      .eq('id', authUser.id).maybeSingle()
    if (!me || !['trainer', 'manager', 'staff'].includes(me.role)) {
      router.replace('/dashboard'); return
    }

    setCurrentUser(me)
    const gymId = me.manager_gym_id || me.gym_id

    // Trainer's existing members — members with an active package assigned to this trainer
    const { data: trainerPkgs } = await supabase.from('packages')
      .select('member_id, member:members(id, full_name, phone, membership_number)')
      .eq('trainer_id', authUser.id)
      .eq('status', 'active')
    const trainerMemberMap = new Map<string, any>()
    trainerPkgs?.forEach((p: any) => {
      if (p.member && !trainerMemberMap.has(p.member_id)) {
        trainerMemberMap.set(p.member_id, p.member)
      }
    })
    setTrainerMembers(Array.from(trainerMemberMap.values()).sort((a, b) => a.full_name.localeCompare(b.full_name)))

    // Active members only — those with a confirmed, active gym membership
    const { data: memberships } = await supabase.from('gym_memberships')
      .select('member:members(id, full_name, phone, membership_number)')
      .eq('gym_id', gymId)
      .eq('status', 'active')
      .eq('sale_status', 'confirmed')
      .order('created_at', { ascending: false })

    // Deduplicate members
    const seen = new Set<string>()
    const members: any[] = []
    memberships?.forEach((m: any) => {
      if (m.member && !seen.has(m.member.id)) {
        seen.add(m.member.id)
        members.push(m.member)
      }
    })
    setActiveMembers(members.sort((a, b) => a.full_name.localeCompare(b.full_name)))

    // Active package templates
    const { data: tmpl } = await supabase.from('package_templates')
      .select('*')
      .eq('is_active', true)
      .order('name')
    setTemplates(tmpl || [])

  }

  useEffect(() => { loadData() }, [])

  if (!user) return null


  const selectedTemplate = templates.find(t => t.id === form.template_id)
  const selectedMember = activeMembers.find(m => m.id === form.member_id)

  // Auto-calculate expiry from template validity_months
  const expiryDate = selectedTemplate?.validity_months && form.start_date
    ? (() => {
        const d = new Date(form.start_date)
        d.setMonth(d.getMonth() + selectedTemplate.validity_months)
        return d.toISOString().split('T')[0]
      })()
    : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.member_id) { setError('Please select a member'); return }
    if (!form.template_id) { setError('Please select a package template'); return }
    if (!form.start_date) { setError('Please enter a start date'); return }
    if (!selectedTemplate) return

    setSaving(true)
    const { data: { user: authUser } } = await supabase.auth.getUser()

    // Note: existing active packages are NOT expired here.
    // A member can have up to 2 active packages simultaneously during renewal.
    // Old packages expire naturally when sessions run out or end_date passes (lazy expiry on page load).

    // Create new package — manager_confirmed = false, pending manager ack
    const { error: insertErr } = await supabase.from('packages').insert({
      template_id: selectedTemplate.id,
      member_id: form.member_id,
      client_id: form.member_id,
      trainer_id: authUser!.id,
      selling_trainer_id: authUser!.id,
      gym_id: currentUser.manager_gym_id || currentUser.gym_id,
      package_name: selectedTemplate.name,
      total_sessions: selectedTemplate.total_sessions,
      sessions_used: 0,
      total_price_sgd: selectedTemplate.default_price_sgd,
      price_per_session_sgd: selectedTemplate.default_price_sgd / selectedTemplate.total_sessions,
      start_date: form.start_date,
      end_date_calculated: expiryDate,
      status: 'active',
      signup_commission_pct: currentUser?.commission_signup_pct || 10,
      session_commission_pct: currentUser?.commission_session_pct || 15,
      signup_commission_sgd: selectedTemplate.default_price_sgd * (currentUser?.commission_signup_pct || 10) / 100,
      manager_confirmed: false,
      is_shared: !!form.secondary_member_id,
      secondary_member_id: form.secondary_member_id || null,
    })

    if (insertErr) { showError('Failed to create package: ' + insertErr.message); setSaving(false); return }

    showMsg('PT package created — pending manager confirmation')
    logActivity('create', 'PT Onboarding', 'Created PT package — pending manager confirmation')
    setSaving(false)
    setForm({ member_id: '', template_id: '', start_date: todaySGT(), secondary_member_id: '' })
  }

  if (loading) return (
    <PageSpinner />
  )

  return (
    <div className="space-y-5 max-w-xl">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">PT Onboarding</h1>
        <p className="text-sm text-gray-500">Onboard a member onto a PT package</p>
      </div>

      <StatusBanner success={success} error={error} />

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        <button type="button" onClick={() => { setTab('renew'); setForm(f => ({ ...f, member_id: '', template_id: '' })) }}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${tab === 'renew' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          Renew Existing Member
        </button>
        <button type="button" onClick={() => { setTab('new'); setForm(f => ({ ...f, member_id: '', template_id: '' })) }}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${tab === 'new' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          Onboard New Member
        </button>
      </div>

      {tab === 'renew' && trainerMembers.length === 0 && (
        <div className="card p-6 text-center">
          <AlertCircle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600 font-medium">No existing members found</p>
          <p className="text-xs text-gray-400 mt-1">You have no members with an active PT package. Use the Onboard New Member tab to add a new member.</p>
        </div>
      )}

      {tab === 'new' && activeMembers.length === 0 && (
        <div className="card p-6 text-center">
          <AlertCircle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600 font-medium">No active gym members found</p>
          <p className="text-xs text-gray-400 mt-1">Only members with a confirmed, active gym membership can be onboarded onto a PT package.</p>
        </div>
      )}

      {(tab === 'renew' ? trainerMembers.length > 0 : activeMembers.length > 0) && (
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Step 1 — Select member */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-red-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">1</span>
              </div>
              <h2 className="text-sm font-semibold text-gray-900">Select Member</h2>
            </div>
            <select className="input" required value={form.member_id}
              onChange={e => setForm(f => ({ ...f, member_id: e.target.value }))}>
              <option value="">
                {tab === 'renew' ? 'Select a member to renew...' : 'Select an active member to onboard...'}
              </option>
              {(tab === 'renew' ? trainerMembers : activeMembers).map(m => (
                <option key={m.id} value={m.id}>
                  {m.full_name}{m.membership_number ? ` — ${m.membership_number}` : ''}
                </option>
              ))}
            </select>
            {selectedMember && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg p-2">
                <CheckCircle className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                <p className="text-xs text-green-700">{selectedMember.full_name} — active gym member</p>
              </div>
            )}
          </div>

          {/* Step 2 — Select template */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-red-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">2</span>
              </div>
              <h2 className="text-sm font-semibold text-gray-900">Select Package</h2>
            </div>
            <div className="space-y-2">
              {templates.map(t => (
                <label key={t.id}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    form.template_id === t.id
                      ? 'border-red-500 bg-red-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}>
                  <input type="radio" name="template" value={t.id}
                    checked={form.template_id === t.id}
                    onChange={() => setForm(f => ({ ...f, template_id: t.id }))}
                    className="mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{t.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {t.total_sessions} sessions · {formatSGD(t.default_price_sgd)}
                      {t.validity_months && ` · ${t.validity_months} month validity`}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatSGD(t.default_price_sgd / t.total_sessions)} per session ·
                      Commission: {formatSGD(t.default_price_sgd * (currentUser?.commission_signup_pct || 10) / 100)} ({currentUser?.commission_signup_pct || 10}%)
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Step 3 — Shared package (optional) */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">3</span>
              </div>
              <h2 className="text-sm font-semibold text-gray-900">Shared Package <span className="text-xs text-gray-400 font-normal">(optional)</span></h2>
            </div>
            <select className="input" value={form.secondary_member_id}
              onChange={e => setForm(f => ({ ...f, secondary_member_id: e.target.value }))}>
              <option value="">No sharing — individual package</option>
              {activeMembers
                .filter(m => m.id !== form.member_id)
                .map(m => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}{m.membership_number ? ` — ${m.membership_number}` : ''}
                  </option>
                ))}
            </select>
            {form.secondary_member_id && (() => {
              const sec = activeMembers.find(m => m.id === form.secondary_member_id)
              return sec ? (
                <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg p-2">
                  <CheckCircle className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                  <p className="text-xs text-blue-700">{sec.full_name} added as sharing partner — sessions deducted from same pool</p>
                </div>
              ) : null
            })()}
            <p className="text-xs text-gray-400">Only members with an active confirmed gym membership can be added as a sharing partner.</p>
          </div>

          {/* Step 4 — Start date */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-red-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">4</span>
              </div>
              <h2 className="text-sm font-semibold text-gray-900">Start Date</h2>
            </div>
            <input className="input" type="date" required value={form.start_date}
              onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
            {expiryDate && (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg p-2">
                <Calendar className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                <p className="text-xs text-blue-700">
                  Package expires: <strong>{formatDate(expiryDate)}</strong>
                  {selectedTemplate?.validity_months && ` (${selectedTemplate.validity_months} months from start)`}
                </p>
              </div>
            )}
          </div>

          {/* Summary */}
          {selectedMember && selectedTemplate && (
            <div className="card p-4 bg-gray-50 space-y-1">
              <p className="text-xs font-semibold text-gray-700 mb-2">Summary</p>
              <p className="text-xs text-gray-600">Member: <strong>{selectedMember.full_name}</strong></p>
              <p className="text-xs text-gray-600">Package: <strong>{selectedTemplate.name}</strong></p>
              <p className="text-xs text-gray-600">Price: <strong>{formatSGD(selectedTemplate.default_price_sgd)}</strong></p>
              <p className="text-xs text-gray-600">Sessions: <strong>{selectedTemplate.total_sessions}</strong></p>
              {expiryDate && <p className="text-xs text-gray-600">Expires: <strong>{formatDate(expiryDate)}</strong></p>}
              {form.secondary_member_id && (() => {
                const sec = activeMembers.find(m => m.id === form.secondary_member_id)
                return sec ? <p className="text-xs text-gray-600">Shared with: <strong>{sec.full_name}</strong></p> : null
              })()}
              <p className="text-xs text-amber-600 mt-2">⚠ Package pending manager confirmation before commission is eligible for payout.</p>
            </div>
          )}

          <button type="submit" disabled={saving || !form.member_id || !form.template_id}
            className="btn-primary w-full disabled:opacity-50">
            {saving ? 'Creating Package...' : 'Create PT Package'}
          </button>

          <Link href="/dashboard/pt/sessions" className="btn-secondary w-full text-center block">
            Cancel
          </Link>
        </form>
      )}
    </div>
  )
}
