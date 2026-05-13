'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { formatSGD, formatDate, cn } from '@/lib/utils'
import { ArrowLeft, User, CreditCard, CheckCircle, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { StatusBanner } from '@/components/StatusBanner'
import { validatePhone, validateFullName, validateMembershipNumber, validateAll } from '@/lib/validators'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { PageSpinner } from '@/components/PageSpinner'

export default function RegisterMemberPage() {
  const { user, loading } = useCurrentUser({ allowedRoles: ['manager', 'business_ops', 'staff', 'trainer'] })

  const { logActivity } = useActivityLog()
  const [step, setStep] = useState<'member' | 'membership'>('member')
  const [gyms, setGyms] = useState<any[]>([])
  const [membershipTypes, setMembershipTypes] = useState<any[]>([])
  const [gymName, setGymName] = useState<string>('')
  const [gymLocked, setGymLocked] = useState(false)
  const [commissionPct, setCommissionPct] = useState(5)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [error, setError] = useState('')
  const [duplicateWarning, setDuplicateWarning] = useState<any>(null)
  const [confirmedDuplicate, setConfirmedDuplicate] = useState(false)
  const [dataLoading, setDataLoading] = useState(true)
  const [createdMemberId, setCreatedMemberId] = useState<string | null>(null)

  const [memberForm, setMemberForm] = useState({
    gym_id: '', membership_number: '', full_name: '', phone: '',
    email: '', date_of_birth: '', health_notes: '',
  })

  const [membershipForm, setMembershipForm] = useState({
    membership_type_id: '', notes: '',
  })

  const router = useRouter()
  const supabase = createClient()



  useEffect(() => {
    if (!user) return
    const load = async () => {
      logActivity('page_view', 'New Member', 'Viewed new member registration form')

      const { data: gymsData } = await supabase.from('gyms').select('*').eq('is_active', true).order('name')
      setGyms(gymsData || [])

      // Load global types + gym-specific types for this gym
      const gymId = user!.manager_gym_id || null
      let typesQ = supabase.from('membership_types').select('*').eq('is_active', true).order('price_sgd')
      if (gymId) {
        typesQ = typesQ.or(`gym_id.is.null,gym_id.eq.${gymId}`)
      } else {
        typesQ = typesQ.is('gym_id', null)
      }
      const { data: typesData } = await typesQ
      setMembershipTypes(typesData || [])
      setDataLoading(false)

      // Use per-staff membership commission rate, not global config
      setCommissionPct((user as any)?.membership_commission_sgd || 0)

      // Auto-detect gym — lock field for manager/staff/trainer, show dropdown only for biz_ops
      if (user?.manager_gym_id) {
        // Manager/full-time staff: use assigned gym
        const gym = gymsData?.find((g: any) => g.id === user!.manager_gym_id)
        setMemberForm(f => ({ ...f, gym_id: user!.manager_gym_id ?? '' }))
        setGymName(gym?.name || user!.manager_gym_id)
        setGymLocked(true)
      } else if (user?.role === 'trainer') {
        // Trainer: get first assigned gym (any gym in trainer_gyms)
        const { data: tgs } = await supabase.from('trainer_gyms')
          .select('gym_id, gyms(name)')
          .eq('trainer_id', user!.id)
          .order('is_primary', { ascending: false })
          .limit(1)
        const tg = tgs?.[0]
        if (tg?.gym_id) {
          setMemberForm(f => ({ ...f, gym_id: tg.gym_id }))
          setGymName((tg.gyms as any)?.name || tg.gym_id)
          setGymLocked(true)
        } else if (gymsData?.length === 1) {
          setMemberForm(f => ({ ...f, gym_id: gymsData[0].id }))
          setGymName(gymsData[0].name)
          setGymLocked(true)
        }
      } else if (user?.employment_type === 'part_time') {
        // Part-timer: look up today's or next upcoming roster shift
        const today = new Date().toISOString().split('T')[0]
        const { data: rosterShift } = await supabase.from('duty_roster')
          .select('gym_id, gyms:gym_id(name)')
          .eq('user_id', user!.id)
          .gte('shift_date', today)
          .order('shift_date', { ascending: true })
          .limit(1)
          .maybeSingle()
        if (rosterShift?.gym_id) {
          setMemberForm(f => ({ ...f, gym_id: rosterShift.gym_id }))
          setGymName((rosterShift.gyms as any)?.name || '')
          setGymLocked(true)
        }
        // If no roster found — fall back to dropdown (gymName stays empty = show dropdown)
      } else if (gymsData?.length === 1) {
        setMemberForm(f => ({ ...f, gym_id: gymsData[0].id }))
        setGymName(gymsData[0].name)
        setGymLocked(true)
      }
    }
    load().finally(() => setDataLoading(false))
  }, [user])

  if (loading || dataLoading) return <PageSpinner />
  if (!user) return null

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault(); setError('')
    const validationErr = validateAll([
      validateFullName(memberForm.full_name),
      validatePhone(memberForm.phone),
      validateMembershipNumber(memberForm.membership_number),
    ])
    if (validationErr) { setError(validationErr); return }
    const { data: { user: authUser } } = await supabase.auth.getUser()

    // Check membership number uniqueness if provided
    if (memberForm.membership_number) {
      const { data: existing } = await supabase.from('members')
        .select('id').eq('gym_id', memberForm.gym_id).eq('membership_number', memberForm.membership_number).maybeSingle()
      if (existing) { setError('This membership number is already registered at this gym'); return }
    }

    // Check for duplicate phone number
    if (!confirmedDuplicate && memberForm.phone) {
      const { data: dupPhone } = await supabase.from('members')
        .select('id, full_name, membership_number, gym:gyms(name)')
        .eq('phone', memberForm.phone)
        .maybeSingle()
      if (dupPhone) {
        setDuplicateWarning(dupPhone)
        return
      }
    }

    const { data, error: insertErr } = await supabase.from('members').insert({
      gym_id: memberForm.gym_id,
      membership_number: memberForm.membership_number || null,
      full_name: memberForm.full_name,
      phone: memberForm.phone,
      email: memberForm.email || null,
      date_of_birth: memberForm.date_of_birth || null,
      health_notes: memberForm.health_notes || null,
      created_by: authUser!.id,
    }).select().maybeSingle()

    if (insertErr) { setError(insertErr.message); return }
    setCreatedMemberId(data.id)
    setStep('membership')
  }

  const handleSellMembership = async (e: React.FormEvent) => {
    e.preventDefault(); setError('')
    const { data: { user: authUser } } = await supabase.auth.getUser()

    const type = membershipTypes.find(t => t.id === membershipForm.membership_type_id)
    if (!type) { setError('Please select a membership type'); return }

    const startDate = new Date()
    const endDate = new Date(startDate)
    endDate.setDate(endDate.getDate() + type.duration_days)

    const { error: insertErr } = await supabase.from('gym_memberships').insert({
      member_id: createdMemberId,
      gym_id: memberForm.gym_id,
      membership_type_id: type.id,
      membership_type_name: type.name,
      membership_number: memberForm.membership_number || null,
      price_sgd: type.price_sgd,
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
      sold_by_user_id: authUser!.id,
      commission_pct: 0,
      commission_sgd: commissionPct,
      sale_status: 'pending',
      notes: membershipForm.notes || null,
    })

    if (insertErr) { setError(insertErr.message); return }
    router.push(`/dashboard/members/${createdMemberId}`)
    logActivity('create', 'New Member', 'Registered new gym member')
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

      <StatusBanner error={error} />

      {step === 'member' && (
        <>
        {duplicateWarning && (
          <div className="card p-4 bg-amber-50 border-amber-200 space-y-3">
            <p className="text-sm font-semibold text-amber-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> Possible duplicate member
            </p>
            <p className="text-sm text-amber-700">
              A member with phone <strong>{memberForm.phone}</strong> already exists:
            </p>
            <div className="bg-white rounded-lg p-3 border border-amber-200">
              <p className="text-sm font-medium text-gray-900">{duplicateWarning.full_name}</p>
              {duplicateWarning.membership_number && (
                <p className="text-xs text-gray-500">Membership #{duplicateWarning.membership_number}</p>
              )}
              {duplicateWarning.gym?.name && (
                <p className="text-xs text-gray-500">{duplicateWarning.gym.name}</p>
              )}
            </div>
            <p className="text-xs text-amber-600">
              If this is a different person, confirm below to proceed with registration.
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => {
                setConfirmedDuplicate(true)
                setDuplicateWarning(null)
              }} className="btn-primary text-sm">
                Confirm — different person, proceed
              </button>
              <button type="button" onClick={() => setDuplicateWarning(null)}
                className="btn-secondary text-sm">
                Go back and correct
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleCreateMember} className="card p-4 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <User className="w-4 h-4 text-red-600" />
            <h2 className="font-semibold text-gray-900 text-sm">Member Details</h2>
          </div>

          {gyms.length > 1 && (
            <div>
              <label className="label">Gym Location *</label>
              {gymLocked ? (
                <div className="input bg-gray-50 text-gray-700 cursor-default">{gymName}</div>
              ) : (
                <select className="input" required value={memberForm.gym_id} onChange={e => setMemberForm(f => ({ ...f, gym_id: e.target.value }))}>
                  <option value="">Select gym outlet...</option>
                  {gyms.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              )}
            </div>
          )}

          <div>
            <label className="label">Membership Card Number</label>
            <input className="input" value={memberForm.membership_number} onChange={e => setMemberForm(f => ({ ...f, membership_number: e.target.value.toUpperCase() }))} placeholder="From physical card (e.g. GYM-2024-0001)" />
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
            <label className="label">Health Notes / Medical Conditions</label>
            <textarea className="input min-h-[70px] resize-none" value={memberForm.health_notes} onChange={e => setMemberForm(f => ({ ...f, health_notes: e.target.value }))} placeholder="Any injuries, conditions or notes for trainers..." />
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? 'Saving...' : 'Save & Continue to Membership →'}</button>
        </form>
        </>
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
              Your commission: <strong>{formatSGD(commissionPct)}</strong> flat per sale. Sale requires manager confirmation before payout.
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
                      <p className="text-xs text-green-600">+ {formatSGD(commissionPct)} commission</p>
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
