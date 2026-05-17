'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { formatDate, formatDateTime, formatSGD, getRoleLabel, roleBadgeClass, getMonthName, todaySGT} from '@/lib/utils'
import { validatePhone, validateNric, validateNationality, validateHourlyRate, validateAddress, validateAll } from '@/lib/validators'
import {
  Plus, UserCheck, Shield, Users, Briefcase, Dumbbell,
  Edit2, Trash2, X, Save, CheckCircle, AlertCircle, Archive,
  Building2, Clock, DollarSign,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { StatusBanner } from '@/components/StatusBanner'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import Link from 'next/link'
import { PageSpinner } from '@/components/PageSpinner'
import { RESIDENCY_STATUS_OPTIONS, residencyLabel } from '@/lib/cpf'

const ALL_ROLES = [
  { value: 'admin', label: 'Admin', description: 'App settings only' },
  { value: 'business_ops', label: 'Business Ops', description: 'Staff, gyms, payroll, reports' },
  { value: 'manager', label: 'Manager', description: 'Manage one gym club' },
  { value: 'trainer', label: 'Trainer', description: 'Manage own members and sessions' },
  { value: 'staff', label: 'Operations Staff', description: 'Sales, member lookup, schedule view' },
]

const emptyForm = {
  full_name: '', nickname: '', email: '', phone: '', role: 'staff',
  employment_type: 'full_time', hourly_rate: '',
  commission_signup_pct: '10', commission_session_pct: '15', membership_commission_sgd: '10',
  // gym_id: single-gym dropdown for full-timers (all roles)
  // gym_ids: multi-select checkboxes for part-time ops staff (rostered at any gym)
  gym_id: '', gym_ids: [] as string[], manager_gym_id: '', is_also_trainer: false, // gym_ids retained for API compatibility
  date_of_birth: '', date_of_joining: '', date_of_departure: '', departure_reason: '', address: '',
  nric: '', nationality: 'Singaporean', residency_status: 'singapore_citizen',
  leave_entitlement_days: '',
  medical_leave_entitlement_days: '14',
  hospitalisation_leave_entitlement_days: '60',
  probation_end_date: '', probation_passed: false, leave_carry_forward_days: '0',
}

export default function TrainersPage() {
  const { user, loading } = useCurrentUser({ allowedRoles: ['manager', 'business_ops'] })

  const { logActivity } = useActivityLog()
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [staff, setStaff] = useState<any[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [archived, setArchived] = useState<any[]>([])
  const [gyms, setGyms] = useState<any[]>([])
  const [globalCommissionDefaults, setGlobalCommissionDefaults] = useState<{
    membership_commission_sgd: string
    hourly_rate: string
    commission_signup_pct: string
    commission_session_pct: string
  }>({ membership_commission_sgd: '10', hourly_rate: '12', commission_signup_pct: '10', commission_session_pct: '15' })
  const [tab, setTab] = useState<'active' | 'archived'>('active')
  const [archivedLoaded, setArchivedLoaded] = useState(false)
  const archQRef = useRef<any>(null)
  const [filterRole, setFilterRole] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingUser, setEditingUser] = useState<any | null>(null)
  const [saving, setSaving] = useState(false)
  const [offboardingChecklist, setOffboardingChecklist] = useState<any>(null)
  const [offboardingTicks, setOffboardingTicks] = useState({ accessCard: false, portalAccess: false, companyItems: false })
  const [completingOffboard, setCompletingOffboard] = useState(false)
  const [createForm, setCreateForm] = useState({ ...emptyForm })
  const [editForm, setEditForm] = useState({ ...emptyForm, is_active: true, role: '' })
  const [allGymNames, setAllGymNames] = useState<Record<string, string>>({})

  const router = useRouter()
  const supabase = createClient()

  const loadData = async () => {
    logActivity('page_view', 'Staff Management', 'Viewed staff management')
    if (!user) return
    

    // Biz Ops: sees all staff across all gyms (scoped by RLS).
    // Manager: scoped to staff in their gym only — trainers via trainer_gyms,
    //   full-time ops staff via manager_gym_id. Excludes admin and biz ops roles.
    const isManager = user!.role === 'manager'
    const gymId = user!.manager_gym_id

    // Biz Ops sees all staff except admin and business_ops accounts.
    // Using .in() with the allowed roles is more reliable than .not().in()
    const staffRoles = ['manager', 'trainer', 'staff']

    // Biz Ops needs sensitive fields (salary, NRIC, commission) for staff editing
    // Managers only need safe fields — users_safe is sufficient
    const staffTable = isManager ? 'users_safe' : 'users'

    let activeQ = supabase.from(staffTable)
      .select('*, trainer_gyms(gym_id, gyms(name), is_primary), manager_gym:gyms!users_manager_gym_id_fkey(name)')
      .eq('is_archived', false)
      .in('role', staffRoles)

    let archQ = supabase.from(staffTable)
      .select('*, trainer_gyms(gym_id, gyms(name), is_primary), manager_gym:gyms!users_manager_gym_id_fkey(name)')
      .eq('is_archived', true)
      .in('role', staffRoles)

    if (isManager && gymId) {
      // Single query for all staff assigned to this gym via trainer_gyms
      const { data: tgRows } = await supabase.from('trainer_gyms').select('trainer_id').eq('gym_id', gymId)
      const allTgIds = tgRows?.map((r: any) => r.trainer_id) || []
      const trainerIds = allTgIds // all roles in trainer_gyms for this gym
      const ptIds: string[] = [] // no longer needed separately

      // Only roles a manager should see: trainer and staff (not admin/biz ops/other managers)
      activeQ = activeQ.in('role', ['trainer', 'staff'])
      archQ   = archQ.in('role', ['trainer', 'staff'])

      const allGymIds = Array.from(new Set([...trainerIds, ...ptIds]))
      if (allGymIds.length > 0) {
        activeQ = activeQ.or(`id.in.(${allGymIds.join(',')}),manager_gym_id.eq.${gymId}`)
        archQ   = archQ.or(`id.in.(${allGymIds.join(',')}),manager_gym_id.eq.${gymId}`)
      } else {
        activeQ = activeQ.eq('manager_gym_id', gymId)
        archQ   = archQ.eq('manager_gym_id', gymId)
      }
    }

    const { data: active } = await activeQ.order('employment_type').order('role').order('full_name')
    setStaff(active || [])



    // Store archQ in ref for deferred loading when Archived tab is clicked
    archQRef.current = archQ
    // Skip archived on initial load — deferred until tab is clicked
    const { data: gymData } = await supabase.from('gyms').select('*').eq('is_active', true)
    setGyms(gymData || [])

    // Load global commission defaults once on page open
    // These pre-fill the Add Staff form immediately — no gym selection needed
    // All gyms share the same defaults (set via Commission Rates page)
    if (gymData && gymData.length > 0) {
      const { data: firstCfg } = await supabase.from('commission_config')
        .select('default_signup_pct, default_session_pct, default_membership_commission_sgd, default_hourly_rate')
        .eq('gym_id', gymData[0].id).maybeSingle()
      if (firstCfg) {
        const defaults = {
          membership_commission_sgd: firstCfg.default_membership_commission_sgd?.toString() || '10',
          hourly_rate: firstCfg.default_hourly_rate?.toString() || '12',
          commission_signup_pct: firstCfg.default_signup_pct?.toString() || '10',
          commission_session_pct: firstCfg.default_session_pct?.toString() || '15',
        }
        setGlobalCommissionDefaults(defaults)
      }
    }

    setDataLoading(false)
  }

  const { success, error, showMsg, showError, setError } = useToast()

  useEffect(() => { if (!user) return; loadData().finally(() => setDataLoading(false)) }, [user])

  if (loading || !user || dataLoading) return <PageSpinner />


  // (sub-components defined at module level below)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setError('')
    // Gym assignment — mandatory for all non-admin, non-biz-ops roles
    if (!['admin', 'business_ops'].includes(createForm.role)) {
      const isPartTimeStaff = createForm.employment_type === 'part_time' && createForm.role === 'staff'
      if (isPartTimeStaff) {
        if (!createForm.gym_ids || createForm.gym_ids.length === 0) {
          setError('Please assign at least one gym for this part-time staff member'); return
        }
      } else {
        if (!(createForm as any).gym_id) {
          setError('Please select an assigned gym'); return
        }
      }
    }
    const err = validateAll([
      validatePhone(createForm.phone),
      validateNric((createForm as any).nric),
      validateNationality((createForm as any).nationality),
      validateHourlyRate((createForm as any).hourly_rate),
      validateAddress((createForm as any).address),
    ])
    if (err) { setError(err); return }
    setSaving(true)
    const res = await fetch('/api/staff', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createForm),
    })
    const result = await res.json()
    if (!res.ok) { setError(result.error || 'Failed'); setSaving(false); return }
    logActivity('create', 'Staff Management', `Created ${createForm.role} account: ${createForm.full_name}`)
    await loadData(); setShowCreateForm(false); setCreateForm({ ...emptyForm })
    setSaving(false); showMsg('Account created')
  }

  const openEdit = async (member: any) => {
    setEditingUser(member)
    setShowCreateForm(false); setError('')

    // All personal fields come from the member object already in memory —
    // populate the form immediately so the modal shows the correct data at once.
    // Gym fields default to what's on the member record; the trainer_gyms query
    // below refines them (part-timers may have multiple gyms not in users_safe).
    setEditForm({
      full_name: member.full_name, nickname: member.nickname || member.full_name.split(' ')[0], email: member.email, phone: member.phone || '',
      role: member.role, is_active: member.is_active,
      employment_type: member.employment_type || 'full_time',
      hourly_rate: member.hourly_rate?.toString() || '',
      commission_signup_pct: member.commission_signup_pct?.toString() || '10',
      commission_session_pct: member.commission_session_pct?.toString() || '15',
      membership_commission_sgd: member.membership_commission_sgd?.toString() || '10',
      gym_id: member.manager_gym_id || '',
      gym_ids: member.manager_gym_id ? [member.manager_gym_id] : [],
      manager_gym_id: member.manager_gym_id || '',
      is_also_trainer: member.is_also_trainer || false,
      date_of_birth: member.date_of_birth || '',
      date_of_joining: member.date_of_joining || '',
      date_of_departure: member.date_of_departure || '',
      departure_reason: member.departure_reason || '',
      address: member.address || '',
      nric: member.nric || '',
      leave_entitlement_days: member.leave_entitlement_days?.toString() || '',
      medical_leave_entitlement_days: member.medical_leave_entitlement_days?.toString() || '14',
      hospitalisation_leave_entitlement_days: member.hospitalisation_leave_entitlement_days?.toString() || '60',
      probation_end_date: member.probation_end_date || '',
      probation_passed: !!member.probation_passed_at,
      leave_carry_forward_days: member.leave_carry_forward_days?.toString() || '0',
      nationality: member.nationality || 'Singaporean',
      residency_status: member.residency_status || 'other',
    })

    // Fetch trainer_gyms to get full multi-gym assignments (part-timers may have
    // multiple gyms not captured in users_safe). Updates gym fields only.
    const { data: tgRows } = await supabase.from('trainer_gyms')
      .select('gym_id, gyms(id, name)').eq('trainer_id', member.id)
    const nameMap: Record<string, string> = {}
    const allGymIds: string[] = []
    ;(tgRows || []).forEach((r: any) => {
      if (r.gym_id) {
        allGymIds.push(r.gym_id)
        if (r.gyms?.name) nameMap[r.gym_id] = r.gyms.name
      }
    })
    setAllGymNames(nameMap)
    if (allGymIds.length > 0) {
      setEditForm(f => ({ ...f, gym_id: allGymIds[0], gym_ids: allGymIds }))
    }
  }

  const checkOffboarding = async (member: any) => {
    // Only show when departure date is being set for the first time
    if (!editForm.date_of_departure || member.date_of_departure) return

    const userId = member.id
    const checks: any = {}

    // Draft/approved payslips not yet paid
    const { data: payslips } = await supabase.from('payslips')
      .select('id, period_month, period_year, status')
      .eq('user_id', userId).in('status', ['draft', 'approved'])
    checks.payslips = payslips || []

    // Unpaid commission payslips
    const { data: commissions } = await supabase.from('payslips')
      .select('*').eq('user_id', userId)
      .in('payment_type', ['commission', 'combined'])
      .in('status', ['approved', 'paid'])
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false })
      .limit(24)
    checks.commissions = commissions || []

    // Active duty roster shifts without payslip
    const { data: roster } = await supabase.from('duty_roster')
      .select('id, shift_date, gross_pay').eq('user_id', userId)
      .is('payslip_id', null).gte('shift_date', '2020-01-01')
    checks.roster = roster || []

    // Active packages
    const { data: packages } = await supabase.from('packages')
      .select('id, package_name, sessions_used, total_sessions')
      .eq('trainer_id', userId).eq('status', 'active')
    checks.packages = packages || []

    // Active package memberships
    const { data: activePkgs } = await supabase.from('packages')
      .select('id, package_name').eq('trainer_id', userId)
      .in('status', ['active']).lt('sessions_used', 'total_sessions' as any)
    checks.activePkgs = activePkgs || []

    // Orphaned commission items — unlinked to any payslip
    const { data: orphanedItems } = await supabase.from('commission_items')
      .select('id, source_type, amount, period_month, period_year')
      .eq('user_id', userId)
      .is('payslip_id', null)
    checks.orphanedCommissionItems = orphanedItems || []

    setOffboardingChecklist({ member, checks })
  }

  const handleConfirmOffboarding = async () => {
    if (!offboardingChecklist) return
    setCompletingOffboard(true)
    // Archive the member
    await supabase.from('users').update({
      is_archived: true,
      is_active: false,
      archived_at: new Date().toISOString(),
    }).eq('id', offboardingChecklist.member.id)
    logActivity('update', 'HR Staff', `Offboarded staff — ${offboardingChecklist.member.full_name}`)
    setOffboardingChecklist(null)
    setCompletingOffboard(false)
    await loadData()
    showMsg('Offboarding completed — ' + offboardingChecklist.member.full_name)
  }

  const handleRemoveFromGym = async (memberId: string, gymId: string, gymName: string) => {
    // Check for upcoming/today roster shifts before removing
    const today = todaySGT()
    const { data: upcomingShifts } = await supabase.from('duty_roster')
      .select('id, shift_date')
      .eq('user_id', memberId)
      .eq('gym_id', gymId)
      .gte('shift_date', today)
    if (upcomingShifts && upcomingShifts.length > 0) {
      setError(`Cannot remove from ${gymName} — ${upcomingShifts.length} upcoming/today roster shift${upcomingShifts.length !== 1 ? 's' : ''} must be cleared first`)
      return
    }
    setSaving(true)
    // Remove trainer_gyms row for this gym
    const { error: rmErr } = await supabase.from('trainer_gyms')
      .delete().eq('trainer_id', memberId).eq('gym_id', gymId)
    if (rmErr) { setError(rmErr.message); setSaving(false); return }
    logActivity('update', 'Staff Management', `Removed part-timer from gym: ${gymName}`)
    await loadData()
    setEditingUser(null)
    setSaving(false)
    showMsg(`Removed from ${gymName}`)
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!editingUser) return
    setError('')
    // Show offboarding checklist if departure date being set for first time
    if (editForm.date_of_departure && !editingUser.date_of_departure) {
      await checkOffboarding(editingUser)
      return // save handled by handleConfirmOffboarding
    }
    const err = validateAll([
      validatePhone((editForm as any).phone),
      validateNric((editForm as any).nric),
      validateNationality((editForm as any).nationality),
      validateHourlyRate((editForm as any).hourly_rate),
      validateAddress((editForm as any).address),
    ])
    if (err) { setError(err); return }
    setSaving(true)
    const res = await fetch('/api/staff', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: editingUser.id, ...editForm }),
    })
    const result = await res.json()
    if (!res.ok) { setError(result.error || 'Failed'); setSaving(false); return }
    await loadData(); setEditingUser(null); setSaving(false); showMsg('Profile updated')
    logActivity('update', 'Staff Management', `Updated staff profile: ${editingUser?.full_name || ''}`)
  }

  const handleArchive = async (member: any) => {
    if (!confirm(`Archive ${member.full_name}?\n\nHistorical records (payslips, sessions, leave) will be preserved.\nIf this staff member rejoins in future, they must register with a new email address.`)) return
    setSaving(true)

    // Block if trainer has active or pending PT packages
    if (member.role === 'trainer') {
      const { count: pkgCount } = await supabase.from('packages')
        .select('id', { count: 'exact', head: true })
        .eq('trainer_id', member.id)
        .in('status', ['active'])
        .eq('manager_confirmed', true)
      const { count: pendingCount } = await supabase.from('packages')
        .select('id', { count: 'exact', head: true })
        .eq('trainer_id', member.id)
        .eq('manager_confirmed', false)
        .neq('status', 'cancelled')

      const totalPkgs = (pkgCount || 0) + (pendingCount || 0)
      if (totalPkgs > 0) {
        setError(`Cannot archive ${member.full_name} — ${totalPkgs} active or pending PT package(s) must be reassigned first. Go to PT Package Sales to reassign.`)
        setSaving(false)
        return
      }
    }

    const res = await fetch('/api/staff', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: member.id }),
    })
    if (!res.ok) { const r = await res.json(); setError(r.error || 'Failed') }
    else { logActivity('update', 'Staff Management', `Archived staff member: ${member.full_name}`); showMsg(`${member.full_name} archived`) }
    await loadData(); setSaving(false)
  }

  const loadCommissionDefaults = async (gymId: string, setF: any) => {
    if (!gymId) return
    const { data: cfg } = await supabase.from('commission_config')
      .select('default_signup_pct, default_session_pct, default_membership_commission_sgd, default_hourly_rate')
      .eq('gym_id', gymId).maybeSingle()
    if (cfg) setF((f: any) => ({
      ...f,
      commission_signup_pct: cfg.default_signup_pct?.toString() || f.commission_signup_pct,
      commission_session_pct: cfg.default_session_pct?.toString() || f.commission_session_pct,
      membership_commission_sgd: cfg.default_membership_commission_sgd?.toString() || f.membership_commission_sgd,
      hourly_rate: cfg.default_hourly_rate?.toString() || f.hourly_rate,
    }))
  }

  const toggleGym = async (gymId: string, type: 'create' | 'edit') => {
    const setF = type === 'create' ? setCreateForm : setEditForm
    const currentIds = type === 'create' ? createForm.gym_ids : (editForm as any).gym_ids || []
    const isAdding = !currentIds.includes(gymId)
    setF((f: any) => ({ ...f, gym_ids: isAdding ? [...(f.gym_ids || []), gymId] : (f.gym_ids || []).filter((g: string) => g !== gymId) }))
    // Load commission defaults from first gym checked (don't overwrite if already set)
    if (isAdding && currentIds.length === 0) {
      await loadCommissionDefaults(gymId, setF)
    }
  }

  const getGymLabel = (m: any) => {
    if (m.role === 'admin') return 'HQ'
    if (m.role === 'business_ops') return 'All Gyms'
    // gyms_manager_read (v86) now allows managers to read all relevant gyms
    // nested gyms(name) join works correctly
    const gymNames = (m.trainer_gyms || []).map((tg: any) => tg.gyms?.name).filter(Boolean)
    return gymNames.length > 0 ? gymNames.join(', ') : 'Unassigned'
  }

  const isSelf = (m: any) => m.id === user?.id
  const isBizOps = user?.role === 'business_ops'
  const isManagerRole = user?.role === 'manager'

  // Filter
  let filteredStaff = tab === 'active' ? staff : archived
  if (filterRole !== 'all') filteredStaff = filteredStaff.filter(s => s.role === filterRole)
  if (filterType !== 'all') filteredStaff = filteredStaff.filter(s => (s.employment_type || 'full_time') === filterType)



  return (
    <>
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900">Staff Management</h1><p className="text-sm text-gray-500">{isBizOps ? `All staff across Gym Library · ${staff.filter(s => (s.employment_type || 'full_time') === 'full_time').length} full-time · ${staff.filter(s => s.employment_type === 'part_time').length} part-time` : `Your gym staff · ${staff.length} member${staff.length !== 1 ? 's' : ''} · view only`}</p></div>
        {tab === 'active' && isBizOps && <button onClick={() => {
          // Pre-fill form with global commission defaults when opening
          setCreateForm(f => ({
            ...f,
            commission_signup_pct: globalCommissionDefaults.commission_signup_pct,
            commission_session_pct: globalCommissionDefaults.commission_session_pct,
            membership_commission_sgd: globalCommissionDefaults.membership_commission_sgd,
            // hourly_rate: only shown for part-time — pre-filled when part-time selected
          }))
          setShowCreateForm(!showCreateForm); setEditingUser(null)
        }} className="btn-primary flex items-center gap-1.5"><Plus className="w-4 h-4" /> Add Staff</button>}
      </div>

      <StatusBanner success={success} error={error} onDismissError={() => setError('')} />

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        <button onClick={() => setTab('active')} className={cn('flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', tab === 'active' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600')}>Active ({staff.length})</button>
        <button onClick={async () => {
          setTab('archived')
          if (!archivedLoaded) {
            const { data: arch } = await archQRef.current.order('archived_at', { ascending: false })
            setArchived(arch || [])
            setArchivedLoaded(true)
          }
        }} className={cn('flex-1 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-1.5', tab === 'archived' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600')}><Archive className="w-3.5 h-3.5" /> Archived ({archived.length})</button>
      </div>

      {tab === 'active' && (
        <>
          {/* Create form — modal overlay */}
          {showCreateForm && isBizOps && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <form onSubmit={handleCreate} className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4">
              <div className="flex items-center justify-between"><h2 className="font-semibold text-gray-900 text-sm">Add New Staff Member</h2><button type="button" onClick={() => { setShowCreateForm(false); setCreateForm({ ...emptyForm }) }}><X className="w-4 h-4 text-gray-400" /></button></div>

              {/* Role — Biz Ops cannot create admin or business_ops accounts */}
              <div className="grid grid-cols-2 gap-2">
                {ALL_ROLES.filter(r => isBizOps ? !['admin', 'business_ops'].includes(r.value) : ['trainer', 'staff'].includes(r.value)).map(r => (
                  <label key={r.value} className={cn('flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors', createForm.role === r.value ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-gray-300')}>
                    <input type="radio" name="create_role" value={r.value} checked={createForm.role === r.value} onChange={e => setCreateForm(f => ({ ...f, role: e.target.value, // Trainers must be full-time
                      employment_type: e.target.value === 'trainer' ? 'full_time' : f.employment_type }))} className="mt-0.5 flex-shrink-0" />
                    <div><p className="text-xs font-medium text-gray-900">{r.label}</p><p className="text-xs text-gray-400">{r.description}</p></div>
                  </label>
                ))}
              </div>

              <PersonalFields form={createForm} setF={setCreateForm} isBizOps={isBizOps} />
              <EmploymentFields form={createForm} setF={setCreateForm} isBizOps={isBizOps} defaultHourlyRate={globalCommissionDefaults.hourly_rate} />

              {/* Gym assignment */}
              {(createForm.role !== 'admin' && createForm.role !== 'business_ops') && (
                <>
                  {/* Part-time ops staff (role=staff): multi-gym checkboxes */}
                  {createForm.employment_type === 'part_time' && createForm.role === 'staff' ? (
                    <div>
                      <label className="label">Assign to Gym(s) *</label>
                      <p className="text-xs text-gray-400 mb-1.5">Part-time ops staff can be rostered at multiple gyms and paid separately from each.</p>
                      <div className="space-y-1.5">{gyms.map(g => <label key={g.id} className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={createForm.gym_ids.includes(g.id)} onChange={() => toggleGym(g.id, 'create')} className="rounded border-gray-300 text-red-600" /><span className="text-sm text-gray-700">{g.name}</span></label>)}</div>
                    </div>
                  ) : (
                    /* Full-timers, part-time trainers, and managers: single gym dropdown */
                    <div>
                      <label className="label">Assigned Gym {createForm.employment_type === 'full_time' ? '*' : ''}</label>
                      <select className="input" value={createForm.gym_id} onChange={async e => {
                        const gymId = e.target.value
                        setCreateForm(f => ({ ...f, gym_id: gymId, manager_gym_id: gymId }))
                        // Load commission defaults for this gym
                        if (gymId) await loadCommissionDefaults(gymId, setCreateForm)
                      }}><option value="">Select gym...</option>{gyms.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
                    </div>
                  )}
                  {createForm.role === 'manager' && isBizOps && <AlsoTrainerToggle value={createForm.is_also_trainer} onChange={v => setCreateForm(f => ({ ...f, is_also_trainer: v }))} />}
                </>
              )}

              {isBizOps && <CommissionFields form={createForm} setF={setCreateForm} />}

              <div className="flex gap-2">
                <button type="submit" disabled={saving} className="btn-primary flex-1 disabled:opacity-50">{saving ? 'Creating...' : 'Create Account'}</button>
                <button type="button" onClick={() => { setShowCreateForm(false); setCreateForm({ ...emptyForm }) }} className="btn-secondary">Cancel</button>
              </div>
            </form>
            </div>
          )}

          {/* View panel for managers (read-only) — modal overlay */}
          {editingUser && !isBizOps && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-900 text-sm">Staff Particulars — {editingUser.full_name}</h2>
                <button type="button" onClick={() => setEditingUser(null)}><X className="w-4 h-4 text-gray-400" /></button>
              </div>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><p className="text-xs text-gray-400 mb-0.5">Full Name</p><p className="font-medium text-gray-900">{editingUser.full_name}</p></div>
                  <div><p className="text-xs text-gray-400 mb-0.5">Nickname</p><p className="text-gray-700">{editingUser.nickname || '—'}</p></div>
                  <div><p className="text-xs text-gray-400 mb-0.5">Role</p><p className="text-gray-700">{getRoleLabel(editingUser.role)}</p></div>
                  <div><p className="text-xs text-gray-400 mb-0.5">Employment</p><p className="text-gray-700">{editingUser.employment_type === 'part_time' ? 'Part-time' : 'Full-time'}</p></div>
                  <div><p className="text-xs text-gray-400 mb-0.5">Email</p><p className="text-gray-700">{editingUser.email}</p></div>
                  <div><p className="text-xs text-gray-400 mb-0.5">Phone</p><p className="text-gray-700">{editingUser.phone || '—'}</p></div>
                  <div><p className="text-xs text-gray-400 mb-0.5">Date of Joining</p><p className="text-gray-700">{editingUser.date_of_joining ? formatDate(editingUser.date_of_joining) : '—'}</p></div>
                  <div><p className="text-xs text-gray-400 mb-0.5">Status</p><p className={editingUser.is_active ? 'text-green-700' : 'text-red-600'}>{editingUser.is_active ? 'Active' : 'Inactive'}</p></div>
                  {editingUser.employment_type === 'part_time' && editingUser.hourly_rate && (
                    <div><p className="text-xs text-gray-400 mb-0.5">Hourly Rate</p><p className="text-gray-700">{formatSGD(editingUser.hourly_rate)}/hr</p></div>
                  )}
                  {editingUser.nationality && (
                    <div><p className="text-xs text-gray-400 mb-0.5">Nationality</p><p className="text-gray-700">{editingUser.nationality}</p></div>
                  )}
                  {editingUser.residency_status && (
                    <div><p className="text-xs text-gray-400 mb-0.5">Residency Status</p><p className="text-gray-700">{residencyLabel(editingUser.residency_status)}</p></div>
                  )}
                </div>
                <div><p className="text-xs text-gray-400 mb-0.5">Gym(s)</p><p className="text-gray-700">{getGymLabel(editingUser)}</p></div>
                {editingUser.date_of_departure && (
                  <div><p className="text-xs text-gray-400 mb-0.5">Departure Date</p><p className="text-red-600">{formatDate(editingUser.date_of_departure)}{editingUser.departure_reason && ` — ${editingUser.departure_reason}`}</p></div>
                )}
              </div>
              <p className="text-xs text-gray-400 pt-2 border-t border-gray-100">Contact Business Operations to update staff particulars.</p>
            </div>
            </div>
          )}

          {/* Edit form — biz ops only — modal overlay */}
          {editingUser && isBizOps && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <form onSubmit={handleEdit} className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div><h2 className="font-semibold text-gray-900 text-sm">Edit: {editingUser.full_name}</h2>{isSelf(editingUser) && <p className="text-xs text-red-600 mt-0.5">Your own account</p>}</div>
                <button type="button" onClick={() => setEditingUser(null)}><X className="w-4 h-4 text-gray-400" /></button>
              </div>

              <PersonalFields form={editForm} setF={setEditForm} isBizOps={isBizOps} isEditing={true} />
              <EmploymentFields form={editForm} setF={setEditForm} isBizOps={isBizOps} defaultHourlyRate={globalCommissionDefaults.hourly_rate} />

              {/* Role and status changes are Biz Ops only — managers cannot change staff roles */}
              {!isSelf(editingUser) && isBizOps && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><label className="label">Role</label><select className="input" value={editForm.role} onChange={e => setEditForm((f: any) => ({ ...f, role: e.target.value }))}>{ALL_ROLES.filter(r => isBizOps ? !['admin', 'business_ops'].includes(r.value) : true).map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
                  <div><label className="label">Status</label><select className="input" value={(editForm as any).is_active ? 'active' : 'inactive'} onChange={e => setEditForm((f: any) => ({ ...f, is_active: e.target.value === 'active' }))}><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
                </div>
              )}

              {/* Gym assignment */}
              {(editForm.role !== 'admin' && editForm.role !== 'business_ops') && !isSelf(editingUser) && (
                <>
                  {/* Part-time ops staff — Biz Ops: full multi-gym checkboxes */}
                  {(editForm as any).employment_type === 'part_time' && editForm.role === 'staff' && isBizOps ? (
                    <div>
                      <label className="label">Gym Assignments *</label>
                      <p className="text-xs text-gray-400 mb-1.5">Part-time ops staff can be rostered at multiple gyms and paid separately from each.</p>
                      <div className="space-y-1.5">{gyms.map(g => <label key={g.id} className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={(editForm as any).gym_ids.includes(g.id)} onChange={() => toggleGym(g.id, 'edit')} className="rounded border-gray-300 text-red-600" /><span className="text-sm text-gray-700">{g.name}</span></label>)}</div>
                    </div>
                  ) : (editForm as any).employment_type === 'part_time' && editForm.role === 'staff' && isManagerRole ? (
                    /* Part-time ops staff — Manager view: own gym checkbox + other gyms read-only */
                    <div className="space-y-3">
                      <label className="label">Gym Assignments</label>
                      {/* Own gym — manager can remove part-timer from their gym */}
                      {(editForm as any).gym_ids.includes(user!.manager_gym_id!) && (
                        <div className="p-3 border border-gray-200 rounded-lg space-y-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" defaultChecked className="rounded border-gray-300 text-red-600"
                              onChange={async (e) => {
                                if (!e.target.checked) {
                                  e.target.checked = true // prevent visual uncheck until confirmed
                                  if (window.confirm(`Remove this part-timer from ${allGymNames[user!.manager_gym_id!] || 'your gym'}? This cannot be undone from this portal — only Business Operations can reassign them.`)) {
                                    await handleRemoveFromGym(editingUser!.id, user!.manager_gym_id!, allGymNames[user!.manager_gym_id!] || 'your gym')
                                  }
                                }
                              }} />
                            <span className="text-sm font-medium text-gray-900">{allGymNames[user!.manager_gym_id!] || 'Your Gym'}</span>
                            <span className="text-xs text-gray-400 ml-auto">your gym</span>
                          </label>
                          <p className="text-xs text-amber-600">⚠ Uncheck to remove this staff from your gym. Clear all upcoming rosters first. Only Business Ops can reassign.</p>
                        </div>
                      )}
                      {/* Other gyms — read-only list */}
                      {(editForm as any).gym_ids.filter((id: string) => id !== user!.manager_gym_id).length > 0 && (
                        <div>
                          <p className="text-xs text-gray-400 mb-1.5">Also assigned to (managed by other gyms):</p>
                          <div className="space-y-1">{(editForm as any).gym_ids.filter((id: string) => id !== user!.manager_gym_id).map((id: string) => (
                            <p key={id} className="text-sm font-semibold text-gray-800 pl-2">• {allGymNames[id] || gyms.find(g => g.id === id)?.name || id}</p>
                          ))}</div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Full-timers, part-time trainers, and managers: single gym dropdown */
                    <div>
                      <label className="label">Assigned Gym</label>
                      <select className="input" value={(editForm as any).gym_id} onChange={e => setEditForm((f: any) => ({ ...f, gym_id: e.target.value, manager_gym_id: e.target.value }))}><option value="">— No gym assigned —</option>{gyms.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
                    </div>
                  )}
                  {editForm.role === 'manager' && isBizOps && <AlsoTrainerToggle value={(editForm as any).is_also_trainer} onChange={v => setEditForm((f: any) => ({ ...f, is_also_trainer: v }))} />}
                </>
              )}

              {isBizOps && <CommissionFields form={editForm} setF={setEditForm} />}

              <div className="flex gap-2">
                <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"><Save className="w-4 h-4" />{saving ? 'Saving...' : 'Save Changes'}</button>
                <button type="button" onClick={() => setEditingUser(null)} className="btn-secondary">Cancel</button>
              </div>
            </form>
            </div>
          )}

          {/* Filters */}
          <div className="flex gap-1 flex-wrap">
            {[{ key: 'all', label: `All (${staff.length})` }, { key: 'manager', label: `Manager (${staff.filter(s => s.role === 'manager').length})` }, { key: 'trainer', label: `Trainer (${staff.filter(s => s.role === 'trainer').length})` },
              { key: 'staff', label: `Ops Staff (${staff.filter(s => s.role === 'staff').length})` }].map(({ key, label }) => (
              <button key={key} onClick={() => setFilterRole(key)} className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', filterRole === key ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>{label}</button>
            ))}
            <div className="w-px bg-gray-200 mx-1" />
            {[{ key: 'all', label: 'All types' }, { key: 'full_time', label: 'Full-time' }, { key: 'part_time', label: 'Part-time' }].map(({ key, label }) => (
              <button key={key} onClick={() => setFilterType(key)} className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', filterType === key ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>{label}</button>
            ))}
          </div>

          {/* Staff list */}
          {filteredStaff.length === 0 ? (
            <div className="card p-8 text-center"><UserCheck className="w-10 h-10 text-gray-300 mx-auto mb-3" /><p className="text-gray-500 text-sm">No staff found</p></div>
          ) : (
            <div className="space-y-2">
              {filteredStaff.map(member => (
                <div key={member.id} className={cn('card p-4', !member.is_active && 'opacity-70', isSelf(member) && 'border-red-200 bg-red-50/20')}>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-red-700 font-semibold text-sm">{member.full_name.charAt(0)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900 text-sm">{member.full_name}</p>
                        {isSelf(member) && <span className="text-xs text-red-600 font-medium">(You)</span>}
                        <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', roleBadgeClass(member.role))}>
                          {getRoleLabel(member.role)}{member.role === 'manager' && member.is_also_trainer && ' / Trainer'}
                        </span>
                        <span className={member.employment_type === 'part_time' ? 'bg-orange-100 text-orange-700 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium' : 'bg-indigo-100 text-indigo-700 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium'}>
                          {member.employment_type === 'part_time' ? 'Part-time' : 'Full-time'}
                        </span>
                        <span className={member.is_active ? 'badge-active' : 'badge-inactive'}>{member.is_active ? 'Active' : 'Inactive'}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{member.email}</p>
                      {member.phone ? <p className="text-xs text-gray-400">{member.phone}</p> : <p className="text-xs text-amber-500">⚠ Phone not set</p>}
                      <div className="flex items-center gap-1 mt-1"><Building2 className="w-3 h-3 text-gray-300 flex-shrink-0" /><p className="text-xs text-gray-400">{getGymLabel(member)}</p></div>
                      {isBizOps && member.employment_type === 'part_time' && member.hourly_rate && (
                        <p className="text-xs text-blue-600 mt-0.5 flex items-center gap-1"><Clock className="w-3 h-3" />{formatSGD(member.hourly_rate)}/hr</p>
                      )}
                      {member.date_of_joining && <p className="text-xs text-gray-400 mt-0.5">Joined: {formatDate(member.date_of_joining)}</p>}
                      {member.probation_end_date && !member.probation_passed_at && (
                    <span className="inline-block text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full mt-0.5">Probation</span>
                  )}
                {member.date_of_departure && <p className="text-xs text-red-400 mt-0.5">Departed: {formatDate(member.date_of_departure)}{member.departure_reason && ` — ${member.departure_reason}`}</p>}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => openEdit(member)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title={isBizOps ? "Edit" : "View"}><Edit2 className="w-4 h-4" /></button>
                      {isBizOps && <Link href={`/dashboard/hr/${member.id}/payroll`} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors inline-flex items-center" title="Payroll Profile"><DollarSign className="w-4 h-4 text-red-600" /></Link>}
                      {!isSelf(member) && isBizOps && <button onClick={() => handleArchive(member)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'archived' && (
        <div className="space-y-2">
          {archived.length === 0 ? (
            <div className="card p-8 text-center"><Archive className="w-10 h-10 text-gray-300 mx-auto mb-3" /><p className="text-gray-500 text-sm">No archived staff</p></div>
          ) : filteredStaff.map(member => (
            <div key={member.id} className="card p-4 opacity-75 border-l-4 border-l-red-200">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0"><span className="text-gray-500 font-semibold text-sm">{member.full_name.charAt(0)}</span></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-700 text-sm">{member.full_name}</p>
                    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', roleBadgeClass(member.role))}>{getRoleLabel(member.role)}</span>
                    <span className="badge-danger">Archived</span>
                  </div>
                  <p className="text-xs text-gray-500">{member.email}</p>
                  {member.date_of_joining && <p className="text-xs text-gray-400 mt-0.5">Joined: {formatDate(member.date_of_joining)}</p>}
                  {member.date_of_departure && <p className="text-xs text-gray-400">Departed: {formatDate(member.date_of_departure)}</p>}
                  {member.archived_at && <p className="text-xs text-red-400 mt-1">Archived: {formatDateTime(member.archived_at)}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>

      {/* Offboarding checklist modal */}
      {offboardingChecklist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setOffboardingChecklist(null)}>
          <div className="fixed inset-0 bg-black/30" />
          <div className="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 text-sm mb-1">Offboarding — {offboardingChecklist.member.full_name}</h3>
            <p className="text-xs text-gray-500 mb-4">Review all outstanding items and tick off the manual checklist to complete offboarding.</p>
            <div className="space-y-3">
              {/* System warnings */}
              <div>
                <p className="text-xs font-semibold text-gray-700 mb-2">System Items</p>
                {offboardingChecklist.checks.payslips.length === 0 &&
                 offboardingChecklist.checks.commissions.length === 0 &&
                 offboardingChecklist.checks.roster.length === 0 &&
                 offboardingChecklist.checks.packages.length === 0 &&
                 offboardingChecklist.checks.activePkgs.length === 0 &&
                 (offboardingChecklist.checks.orphanedCommissionItems?.length || 0) === 0 ? (
                  <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg p-3">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <p className="text-xs text-green-700">All clear — no outstanding system items</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {offboardingChecklist.checks.payslips.length > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <p className="text-xs font-medium text-amber-800">⚠ {offboardingChecklist.checks.payslips.length} unpaid payslip(s)</p>
                        {offboardingChecklist.checks.payslips.map((p: any) => <p key={p.id} className="text-xs text-amber-700">· {p.status} — {getMonthName(p.period_month)} {p.period_year}</p>)}
                      </div>
                    )}
                    {offboardingChecklist.checks.commissions.length > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <p className="text-xs font-medium text-amber-800">⚠ {offboardingChecklist.checks.commissions.length} unpaid commission payslip(s)</p>
                        {offboardingChecklist.checks.commissions.map((p: any) => <p key={p.id} className="text-xs text-amber-700">· {p.status} — {getMonthName(p.period_month)} {p.period_year} ({formatSGD(p.commission_amount)})</p>)}
                      </div>
                    )}
                    {offboardingChecklist.checks.orphanedCommissionItems?.length > 0 && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <p className="text-xs font-medium text-red-800">⚠ {offboardingChecklist.checks.orphanedCommissionItems.length} unprocessed commission item(s) — not yet included in any payslip</p>
                        {offboardingChecklist.checks.orphanedCommissionItems.slice(0, 3).map((i: any) => (
                          <p key={i.id} className="text-xs text-red-700">· {i.source_type === 'pt_session' ? 'PT Session' : i.source_type === 'pt_signup' ? 'PT Signup' : 'Membership'} — {getMonthName(i.period_month)} {i.period_year} ({formatSGD(i.amount)})</p>
                        ))}
                        {offboardingChecklist.checks.orphanedCommissionItems.length > 3 && (
                          <p className="text-xs text-red-600">...and {offboardingChecklist.checks.orphanedCommissionItems.length - 3} more</p>
                        )}
                        <p className="text-xs text-red-600 mt-1 font-medium">Generate a commission payslip for this staff before archiving.</p>
                      </div>
                    )}
                    {offboardingChecklist.checks.roster.length > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <p className="text-xs font-medium text-amber-800">⚠ {offboardingChecklist.checks.roster.length} future roster shift(s)</p>
                        {offboardingChecklist.checks.roster.slice(0, 3).map((r: any) => <p key={r.id} className="text-xs text-amber-700">· {formatDate(r.shift_date)}</p>)}
                      </div>
                    )}
                    {offboardingChecklist.checks.packages.length > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <p className="text-xs font-medium text-amber-800">⚠ {offboardingChecklist.checks.packages.length} unconfirmed PT package(s)</p>
                        {offboardingChecklist.checks.packages.map((p: any) => <p key={p.id} className="text-xs text-amber-700">· {p.package_name}</p>)}
                      </div>
                    )}
                    {offboardingChecklist.checks.activePkgs.length > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <p className="text-xs font-medium text-amber-800">⚠ {offboardingChecklist.checks.activePkgs.length} active PT package(s) with remaining sessions</p>
                        {offboardingChecklist.checks.activePkgs.map((p: any) => <p key={p.id} className="text-xs text-amber-700">· {(p.member as any)?.full_name} — {p.package_name} ({p.total_sessions - p.sessions_used} sessions left)</p>)}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Manual checklist — must all be ticked */}
              <div className="border border-gray-200 rounded-lg p-3 space-y-2">
                <p className="text-xs font-semibold text-gray-700 mb-1">Manual Checklist — tick to acknowledge</p>
                {[
                  { key: 'accessCard', label: 'Access card collected' },
                  { key: 'portalAccess', label: 'Portal access to be archived after final payslip is paid' },
                  { key: 'companyItems', label: 'All company-issued items returned' },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox"
                      checked={(offboardingTicks as any)[key]}
                      onChange={e => setOffboardingTicks(t => ({ ...t, [key]: e.target.checked }))}
                      className="rounded border-gray-300 text-red-600" />
                    <span className={`text-xs ${(offboardingTicks as any)[key] ? 'line-through text-gray-400' : 'text-gray-700'}`}>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button onClick={() => setOffboardingChecklist(null)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={handleConfirmOffboarding}
                disabled={!offboardingTicks.accessCard || !offboardingTicks.portalAccess || !offboardingTicks.companyItems || completingOffboard}
                className="btn-primary flex-1 disabled:opacity-50">
                {completingOffboard ? 'Saving...' : 'Confirm Offboarding'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Stable sub-components (module level) ─────────────────────────────────────
// Defined OUTSIDE the page component so React reuses the same reference across
// renders. Inline definitions cause inputs to unmount/remount on every state
// change, kicking the cursor out after each keystroke.

function AlsoTrainerToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className={cn('flex items-start gap-3 p-3 rounded-lg border cursor-pointer', value ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:border-gray-300')}
      onClick={() => onChange(!value)}>
      <div className={cn('w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5', value ? 'border-red-500 bg-red-500' : 'border-gray-300')}>
        {value && <CheckCircle className="w-3.5 h-3.5 text-white" />}
      </div>
      <div>
        <p className="text-sm font-medium text-gray-900">Also acts as a Trainer</p>
        <p className="text-xs text-gray-500 mt-0.5">Can manage own members, schedule sessions and earn trainer commissions.</p>
      </div>
    </div>
  )
}

function PersonalFields({ form, setF, isBizOps, isEditing = false }: { form: any; setF: any; isBizOps: boolean; isEditing?: boolean }) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label className="label">Full Name *</label><input className="input" required value={form.full_name} onChange={e => setF((f: any) => ({ ...f, full_name: e.target.value }))} /></div>
        <div><label className="label">Nickname *</label><input className="input" required value={form.nickname || ''} onChange={e => setF((f: any) => ({ ...f, nickname: e.target.value }))} placeholder="e.g. Alex" /></div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label className="label">NRIC / FIN / Passport</label><input className="input" value={form.nric || ''} onChange={e => setF((f: any) => ({ ...f, nric: e.target.value.toUpperCase() }))} placeholder="e.g. S1234567A" /></div>
        <div><label className="label">Date of Birth</label><input className="input" type="date" value={form.date_of_birth || ''} onChange={e => setF((f: any) => ({ ...f, date_of_birth: e.target.value }))} /></div>
      </div>
      <div>
        <label className="label">Residential Address <span className="text-gray-400 font-normal">(minimum 5 characters)</span></label>
        <input className="input" value={form.address || ''} onChange={e => setF((f: any) => ({ ...f, address: e.target.value }))} placeholder="e.g. 123 Orchard Road, #01-01, Singapore 238858" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label className="label">Phone *</label><input className="input" required type="tel" value={form.phone} onChange={e => setF((f: any) => ({ ...f, phone: e.target.value.replace(/\s/g, '').trim() }))} placeholder="+6591234567" /></div>
        <div><label className="label">Email *</label><input className="input" required type="email" value={form.email} onChange={e => setF((f: any) => ({ ...f, email: e.target.value }))} /></div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label className="label">Nationality</label><input className="input" value={form.nationality || ''} onChange={e => setF((f: any) => ({ ...f, nationality: e.target.value }))} placeholder="e.g. Singaporean" /></div>
        <div>
          <label className="label">Residency Status * <span className="text-xs text-gray-400 font-normal">(determines CPF)</span></label>
          <select className="input" required value={form.residency_status || 'other'}
            onChange={e => setF((f: any) => ({ ...f, residency_status: e.target.value }))}>
            {RESIDENCY_STATUS_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label} — {o.cpfLiable ? 'CPF liable' : 'no CPF'}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label className="label">Date of Joining</label><input className="input" type="date" value={form.date_of_joining} onChange={e => setF((f: any) => ({ ...f, date_of_joining: e.target.value }))} /></div>
        <div><label className="label">Date of Departure</label><input className="input" type="date" value={form.date_of_departure} onChange={e => setF((f: any) => ({ ...f, date_of_departure: e.target.value }))} /></div>
      </div>
      {/* Probation End Date | Annual Leave Entitlement — side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Probation End Date</label>
          <input className="input" type="date" value={(form as any).probation_end_date}
            onChange={e => setF((f: any) => ({ ...f, probation_end_date: e.target.value }))} />
          <p className="text-xs text-gray-400 mt-1">Leave blank if no probation period.</p>
        </div>
        {isBizOps && (
          <div>
            <label className="label">Annual Leave Entitlement (days) *</label>
            <input type="number" required min="0" max="365"
              value={form.employment_type === 'part_time' ? '0' : form.leave_entitlement_days}
              disabled={form.employment_type === 'part_time'}
              onChange={e => setF((f: any) => ({ ...f, leave_entitlement_days: e.target.value }))}
              placeholder="e.g. 14"
              className={cn('input', form.employment_type === 'part_time' && 'bg-gray-100 text-gray-400 cursor-not-allowed')} />
            <p className="text-xs text-gray-400 mt-1">{form.employment_type === 'part_time' ? 'Part-time staff have no annual leave entitlement.' : 'Paid leave days per calendar year.'}</p>
          </div>
        )}
      </div>
      {(form as any).probation_end_date && (
        (form as any).probation_passed
          ? <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg p-3">
              <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
              <span className="text-sm text-green-700">Probation confirmed passed — cannot be reversed</span>
            </div>
          : <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={false}
                onChange={e => { if (e.target.checked) setF((f: any) => ({ ...f, probation_passed: true })) }}
                className="rounded border-gray-300 text-red-600" />
              <span className="text-sm text-gray-700">Probation passed</span>
            </label>
      )}
      {/* Leave carry-forward — edit only, biz-ops only */}
      {isEditing && isBizOps && (
        <div>
          <label className="label">Leave Carry-Forward Days</label>
          <input className="input" type="number" min="0" step="1"
            value={(form as any).leave_carry_forward_days}
            onChange={e => setF((f: any) => ({ ...f, leave_carry_forward_days: e.target.value }))}
            placeholder="0" />
          <p className="text-xs text-gray-400 mt-1">Days carried forward from previous year. Subject to global maximum cap.</p>
        </div>
      )}
      {/* Medical and hospitalisation leave fields — disabled until feature is ready
      <div>
        <label className="label">Medical Leave Entitlement (days)</label>
        <input className="input" type="number" min="0" step="1"
          value={(form as any).medical_leave_entitlement_days || '14'}
          onChange={e => setF((f: any) => ({ ...f, medical_leave_entitlement_days: e.target.value }))}
          placeholder="14" />
      </div>
      <div>
        <label className="label">Hospitalisation Leave Entitlement (days)</label>
        <input className="input" type="number" min="0" step="1"
          value={(form as any).hospitalisation_leave_entitlement_days || '60'}
          onChange={e => setF((f: any) => ({ ...f, hospitalisation_leave_entitlement_days: e.target.value }))}
          placeholder="60" />
      </div>
      */}
      {form.date_of_departure && (
        <div><label className="label">Departure Reason</label><input className="input" value={form.departure_reason} onChange={e => setF((f: any) => ({ ...f, departure_reason: e.target.value }))} placeholder="e.g. Resigned, Contract ended" /></div>
      )}
    </>
  )
}

function EmploymentFields({ form, setF, isBizOps, defaultHourlyRate = '12' }: { form: any; setF: any; isBizOps: boolean; defaultHourlyRate?: string }) {
  // Trainers must be full-time — part-time option is disabled for trainer role
  const isTrainer = form.role === 'trainer'
  return (
    <>
      <div>
        <label className="label">Employment Type *</label>
        {isTrainer && (
          <p className="text-xs text-amber-600 mb-1.5">Trainers must be full-time employees.</p>
        )}
        <div className="flex gap-2">
          {['full_time', 'part_time'].map(et => {
            const disabled = isTrainer && et === 'part_time'
            return (
            <label key={et} className={cn('flex-1 flex items-center gap-2 p-3 rounded-lg border transition-colors',
              disabled ? 'border-gray-100 bg-gray-50 opacity-40 cursor-not-allowed' :
              form.employment_type === et ? 'border-red-500 bg-red-50 cursor-pointer' : 'border-gray-200 hover:border-gray-300 cursor-pointer')}>
              <input type="radio" checked={form.employment_type === et} disabled={disabled} onChange={() => {
                if (!disabled) {
                  setF((f: any) => ({
                    ...f,
                    employment_type: et,
                    // Pre-fill hourly rate from global defaults when switching to part-time
                    ...(et === 'part_time' && !f.hourly_rate ? { hourly_rate: defaultHourlyRate } : {}),
                  }))
                }
              }} />
              <div>
                <p className="text-sm font-medium text-gray-900">{et === 'full_time' ? 'Full Time' : 'Part Time'}</p>
                <p className="text-xs text-gray-400">{et === 'full_time' ? 'Fixed monthly salary' : 'Hourly rate per shift'}</p>
              </div>
            </label>
          )})}
        </div>
      </div>
      {form.employment_type === 'part_time' && isBizOps && (
        <div><label className="label">Hourly Rate (SGD)</label><input className="input" type="number" min="0.50" max="100" step="0.50" value={form.hourly_rate} onChange={e => setF((f: any) => ({ ...f, hourly_rate: e.target.value }))} placeholder="e.g. 12.00" /></div>
      )}
    </>
  )
}

function CommissionFields({ form, setF }: { form: any; setF: any }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-gray-700">Commission Rates</p>
      <div className="grid grid-cols-3 gap-2">
        <div><label className="label text-xs">Membership (SGD)</label><input className="input" type="number" min="0" step="0.01" value={form.membership_commission_sgd} onChange={e => setF((f: any) => ({ ...f, membership_commission_sgd: e.target.value }))} /></div>
        <div><label className="label text-xs">PT Sign-up %</label><input className="input" type="number" min="0" max="100" step="0.5" value={form.commission_signup_pct} onChange={e => setF((f: any) => ({ ...f, commission_signup_pct: e.target.value }))} /></div>
        {(form.role === 'trainer' || (form.role === 'manager' && form.is_also_trainer)) && (
          <div><label className="label text-xs">PT Session %</label><input className="input" type="number" min="0" max="100" step="0.5" value={form.commission_session_pct} onChange={e => setF((f: any) => ({ ...f, commission_session_pct: e.target.value }))} /></div>
        )}
      </div>
    </div>
  )
}
