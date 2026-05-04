'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { formatSGD, formatDate, cn } from '@/lib/utils'
import { ArrowLeft, User, CreditCard, CheckCircle, AlertCircle } from 'lucide-react'
import Link from 'next/link'

export default function RegisterMemberPage() {
  const [step, setStep] = useState<'member' | 'membership'>('member')
  const [gyms, setGyms] = useState<any[]>([])
  const [membershipTypes, setMembershipTypes] = useState<any[]>([])
  const [commissionPct, setCommissionPct] = useState(5)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [createdMemberId, setCreatedMemberId] = useState<string | null>(null)

  const [memberForm, setMemberForm] = useState({
    gym_id: '', membership_number: '', full_name: '', phone: '',
    email: '', date_of_birth: '', gender: '', health_notes: '',
  })

  const [membershipForm, setMembershipForm] = useState({
    membership_type_id: '', notes: '',
  })

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return
      const { data: userData } = await supabase.from('users').select('*').eq('id', authUser.id).single()
      // Admin and Biz Ops cannot register members — they have no assigned gym context.
      if (!userData || ['admin', 'business_ops'].includes(userData.role)) {
        router.replace('/dashboard/members'); return
      }
      setCurrentUser(userData)

      const { data: gymsData } = await supabase.from('gyms').select('*').eq('is_active', true).order('name')
      setGyms(gymsData || [])

      const { data: typesData } = await supabase.from('membership_types').select('*').eq('is_active', true).order('name')
      setMembershipTypes(typesData || [])

      const { data: cfg } = await supabase.from('commission_config').select('config_value').eq('config_key', 'membership_commission_pct').single()
      if (cfg) setCommissionPct(cfg.config_value)

      // Auto-select gym for manager
      if (userData?.manager_gym_id) setMemberForm(f => ({ ...f, gym_id: userData.manager_gym_id }))
      else if (gymsData?.length === 1) setMemberForm(f => ({ ...f, gym_id: gymsData[0].id }))
    }
    load()
  }, [])

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('')
    const { data: { user: authUser } } = await supabase.auth.getUser()

    // Check membership number uniqueness if provided
    if (memberForm.membership_number) {
      const { data: existing } = await supabase.from('members')
        .select('id').eq('gym_id', memberForm.gym_id).eq('membership_number', memberForm.membership_number).single()
      if (existing) { setError('This membership number is already registered at this gym'); setLoading(false); return }
    }

    const { data, error: err } = await supabase.from('members').insert({
      gym_id: memberForm.gym_id,
      membership_number: memberForm.membership_number || null,
      full_name: memberForm.full_name,
      phone: memberForm.phone,
      email: memberForm.email || null,
      date_of_birth: memberForm.date_of_birth || null,
      gender: memberForm.gender || null,
      health_notes: memberForm.health_notes || null,
      created_by: authUser!.id,
    }).select().single()

    if (err) { setError(err.message); setLoading(false); return }
    setCreatedMemberId(data.id)
    setStep('membership')
    setLoading(false)
  }

  const handleSellMembership = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('')
    const { data: { user: authUser } } = await supabase.auth.getUser()

    const type = membershipTypes.find(t => t.id === membershipForm.membership_type_id)
    if (!type) { setError('Please select a membership type'); setLoading(false); return }

    const startDate = new Date()
    const endDate = new Date(startDate)
    endDate.setDate(endDate.getDate() + type.duration_days)

    const { error: err } = await supabase.from('gym_memberships').insert({
      member_id: createdMemberId,
      gym_id: memberForm.gym_id,
      membership_type_id: type.id,
      membership_type_name: type.name,
      membership_number: memberForm.membership_number || null,
      price_sgd: type.price_sgd,
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
      sold_by_user_id: authUser!.id,
      commission_pct: commissionPct,
      sale_status: 'pending',
      notes: membershipForm.notes || null,
    })

    if (err) { setError(err.message); setLoading(false); return }
    router.push(`/dashboard/members/${createdMemberId}`)
  }

  const handleSkipMembership = () => {
    router.push(`/dashboard/members/${createdMemberId}`)
  }

  const selectedType = membershipTypes.find(t => t.id === membershipForm.membership_type_id)

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/members" className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft className="w-4 h-4 text-gray-600" /></Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Register New Member</h1>
          <p className="text-sm text-gray-500">{step === 'member' ? 'Step 1 of 2: Member Details' : 'Step 2 of 2: Sell Membership'}</p>
        </div>
      </div>

      {/* Progress */}
      <div className="flex gap-2">
        <div className={cn('flex-1 h-1.5 rounded-full', step === 'member' ? 'bg-red-600' : 'bg-green-500')} />
        <div className={cn('flex-1 h-1.5 rounded-full', step === 'membership' ? 'bg-red-600' : 'bg-gray-200')} />
      </div>

      {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600"><AlertCircle className="w-4 h-4 flex-shrink-0" />{error}</div>}

      {step === 'member' && (
        <form onSubmit={handleCreateMember} className="card p-4 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <User className="w-4 h-4 text-red-600" />
            <h2 className="font-semibold text-gray-900 text-sm">Member Details</h2>
          </div>

          {gyms.length > 1 && (
            <div>
              <label className="label">Gym Location *</label>
              <select className="input" required value={memberForm.gym_id} onChange={e => setMemberForm(f => ({ ...f, gym_id: e.target.value }))}>
                <option value="">Select gym...</option>
                {gyms.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="label">Membership Card Number</label>
            <input className="input" value={memberForm.membership_number} onChange={e => setMemberForm(f => ({ ...f, membership_number: e.target.value }))} placeholder="From physical card (e.g. GYM-2024-0001)" />
            <p className="text-xs text-gray-400 mt-1">Key in from the physical membership card. Leave blank if not yet assigned.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Full Name *</label>
              <input className="input" required value={memberForm.full_name} onChange={e => setMemberForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Legal name" />
            </div>
            <div>
              <label className="label">Phone *</label>
              <input className="input" required type="tel" value={memberForm.phone} onChange={e => setMemberForm(f => ({ ...f, phone: e.target.value }))} placeholder="+65 9123 4567" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={memberForm.email} onChange={e => setMemberForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="label">Date of Birth</label>
              <input className="input" type="date" value={memberForm.date_of_birth} onChange={e => setMemberForm(f => ({ ...f, date_of_birth: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className="label">Gender</label>
            <select className="input" value={memberForm.gender} onChange={e => setMemberForm(f => ({ ...f, gender: e.target.value }))}>
              <option value="">Select...</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
              <option value="prefer_not_to_say">Prefer not to say</option>
            </select>
          </div>

          <div>
            <label className="label">Health Notes / Medical Conditions</label>
            <textarea className="input min-h-[70px] resize-none" value={memberForm.health_notes} onChange={e => setMemberForm(f => ({ ...f, health_notes: e.target.value }))} placeholder="Any injuries, conditions or notes for trainers..." />
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? 'Saving...' : 'Save & Continue to Membership →'}</button>
        </form>
      )}

      {step === 'membership' && (
        <div className="space-y-4">
          <div className="card p-4 bg-green-50 border-green-200 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-800">Member registered successfully</p>
              <p className="text-xs text-green-600">{memberForm.full_name} · {memberForm.phone}</p>
            </div>
          </div>

          <form onSubmit={handleSellMembership} className="card p-4 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <CreditCard className="w-4 h-4 text-red-600" />
              <h2 className="font-semibold text-gray-900 text-sm">Sell Gym Membership</h2>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
              Your commission: <strong>{commissionPct}%</strong> on membership price. Sale requires manager confirmation before payout.
            </div>

            <div>
              <label className="label">Membership Type *</label>
              <div className="space-y-2">
                {membershipTypes.map(type => (
                  <label key={type.id} className={cn('flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors',
                    membershipForm.membership_type_id === type.id ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-gray-300')}>
                    <div className="flex items-center gap-2">
                      <input type="radio" name="membership_type" value={type.id}
                        checked={membershipForm.membership_type_id === type.id}
                        onChange={() => setMembershipForm(f => ({ ...f, membership_type_id: type.id }))} />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{type.name}</p>
                        <p className="text-xs text-gray-500">{type.duration_days} days</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900">{formatSGD(type.price_sgd)}</p>
                      <p className="text-xs text-green-600">+ {formatSGD(type.price_sgd * commissionPct / 100)} commission</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {selectedType && (
              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1">
                <div className="flex justify-between"><span>Starts</span><span className="font-medium">{formatDate(new Date().toISOString().split('T')[0])}</span></div>
                <div className="flex justify-between"><span>Expires</span><span className="font-medium">{formatDate(new Date(Date.now() + selectedType.duration_days * 86400000).toISOString().split('T')[0])}</span></div>
                <div className="flex justify-between font-medium text-gray-900"><span>Price</span><span>{formatSGD(selectedType.price_sgd)}</span></div>
              </div>
            )}

            <div>
              <label className="label">Notes</label>
              <input className="input" value={membershipForm.notes} onChange={e => setMembershipForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Paid by cash, staff discount applied" />
            </div>

            <button type="submit" disabled={loading || !membershipForm.membership_type_id} className="btn-primary w-full disabled:opacity-50">
              {loading ? 'Processing...' : 'Sell Membership (Pending Manager Confirmation)'}
            </button>
          </form>

          <button onClick={handleSkipMembership} className="btn-secondary w-full text-sm">
            Skip for now — member registered without membership
          </button>
        </div>
      )}
    </div>
  )
}
