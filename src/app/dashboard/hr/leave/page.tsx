'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { formatDate } from '@/lib/utils'
import { Calendar, CheckCircle, XCircle, Clock, AlertCircle, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

const LEAVE_TYPES: Record<string, string> = {
  annual: 'Annual Leave', medical: 'Medical Leave',
  hospitalisation: 'Hospitalisation Leave', other: 'Other',
}

export default function LeaveManagementPage() {
  const [user, setUser] = useState<any>(null)
  const [applications, setApplications] = useState<any[]>([])
  const [staffBalances, setStaffBalances] = useState<any[]>([])
  const [filter, setFilter] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [success, setSuccess] = useState('')
  const supabase = createClient()

  const showMsg = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000) }

  useEffect(() => { load() }, [filter])

  const load = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return
    const { data: u } = await supabase.from('users').select('*').eq('id', authUser.id).single()
    setUser(u)

    // Get staff IDs this user can approve for
    let staffIds: string[] = []
    if (u.role === 'manager' && u.manager_gym_id) {
      // Manager approves: full-time trainers + ops staff at their gym
      // Part-timers do NOT apply for leave in this system
      const { data: opsStaff } = await supabase.from('users')
        .select('id').eq('manager_gym_id', u.manager_gym_id)
        .eq('role', 'staff').neq('id', authUser.id)
      const { data: gymTrainers } = await supabase.from('trainer_gyms')
        .select('trainer_id').eq('gym_id', u.manager_gym_id)
      // Full-time trainers only — filter out part-timers
      const rawTrainerIds = (gymTrainers?.map((t: any) => t.trainer_id) || [])
        .filter((id: string) => id !== authUser.id)
      let ftTrainerIds: string[] = []
      if (rawTrainerIds.length > 0) {
        const { data: ftOnly } = await supabase.from('users')
          .select('id').in('id', rawTrainerIds)
          .eq('role', 'trainer').eq('employment_type', 'full_time')
        ftTrainerIds = ftOnly?.map((t: any) => t.id) || []
      }
      const opsIds = opsStaff?.map((s: any) => s.id) || []
      staffIds = Array.from(new Set([...opsIds, ...ftTrainerIds]))
    } else if (u.role === 'business_ops') {
      // Biz Ops approves managers' leave
      const { data: managers } = await supabase.from('users')
        .select('id').eq('role', 'manager')
      staffIds = managers?.map((m: any) => m.id) || []
    } else if (u.role === 'admin') {
      // Admin approves Business Ops leave
      const { data: bizOps } = await supabase.from('users')
        .select('id').eq('role', 'business_ops')
      staffIds = bizOps?.map((b: any) => b.id) || []
    }

    if (staffIds.length === 0) { setLoading(false); return }

    let q = supabase.from('leave_applications')
      .select('*, user:users!leave_applications_user_id_fkey(full_name, role, leave_entitlement_days)')
      .in('user_id', staffIds)
      .order('created_at', { ascending: false })
    if (filter !== 'all') q = q.eq('status', filter)
    const { data } = await q
    setApplications(data || [])

    // Staff leave balances
    const { data: staff } = await supabase.from('users')
      .select('id, full_name, role, leave_entitlement_days')
      .in('id', staffIds).eq('is_archived', false)

    const currentYear = new Date().getFullYear()
    // Approved leave days per staff
    const { data: approvedLeave } = await supabase.from('leave_applications')
      .select('user_id, days_applied')
      .in('user_id', staffIds).eq('status', 'approved')
      .gte('start_date', `${currentYear}-01-01`)
    // Pending leave days per staff
    const { data: pendingLeave } = await supabase.from('leave_applications')
      .select('user_id, days_applied')
      .in('user_id', staffIds).eq('status', 'pending')
      .gte('start_date', `${currentYear}-01-01`)

    const takenByStaff: Record<string, number> = {}
    approvedLeave?.forEach((l: any) => {
      takenByStaff[l.user_id] = (takenByStaff[l.user_id] || 0) + l.days_applied
    })
    const pendingByStaff: Record<string, number> = {}
    pendingLeave?.forEach((l: any) => {
      pendingByStaff[l.user_id] = (pendingByStaff[l.user_id] || 0) + l.days_applied
    })

    setStaffBalances(staff?.map(s => ({
      ...s,
      taken: takenByStaff[s.id] || 0,
      pending: pendingByStaff[s.id] || 0,
      balance: (s.leave_entitlement_days || 14) - (takenByStaff[s.id] || 0),
    })) || [])

    setLoading(false)
  }

  const handleApprove = async (id: string) => {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    await supabase.from('leave_applications').update({
      status: 'approved', approver_id: authUser!.id, approved_at: new Date().toISOString(),
    }).eq('id', id)
    // WhatsApp to applicant
    const app = applications.find(a => a.id === id)
    if (app) {
      const { data: applicant } = await supabase.from('users').select('phone, full_name').eq('id', app.user_id).single()
      if (applicant?.phone) {
        await supabase.from('whatsapp_queue').insert({
          notification_type: 'manager_note_alert',
          recipient_phone: applicant.phone,
          recipient_name: applicant.full_name,
          message: `Your ${LEAVE_TYPES[app.leave_type] || app.leave_type} application from ${formatDate(app.start_date)} to ${formatDate(app.end_date)} (${app.days_applied} day${app.days_applied !== 1 ? 's' : ''}) has been APPROVED.`,
          scheduled_for: new Date().toISOString(),
          status: 'pending',
        })
      }
    }
    await load(); showMsg('Leave approved')
  }

  const handleReject = async () => {
    if (!rejectId || !rejectReason.trim()) return
    await supabase.from('leave_applications').update({
      status: 'rejected', rejection_reason: rejectReason,
    }).eq('id', rejectId)
    // WhatsApp to applicant
    const app = applications.find(a => a.id === rejectId)
    if (app) {
      const { data: applicant } = await supabase.from('users').select('phone, full_name').eq('id', app.user_id).single()
      if (applicant?.phone) {
        await supabase.from('whatsapp_queue').insert({
          notification_type: 'manager_note_alert',
          recipient_phone: applicant.phone,
          recipient_name: applicant.full_name,
          message: `Your ${LEAVE_TYPES[app.leave_type] || app.leave_type} application from ${formatDate(app.start_date)} to ${formatDate(app.end_date)} has been REJECTED. Reason: ${rejectReason}`,
          scheduled_for: new Date().toISOString(),
          status: 'pending',
        })
      }
    }
    setRejectId(null); setRejectReason(''); await load(); showMsg('Leave rejected')
  }

  const statusBadge = (s: string) => s === 'approved' ? 'badge-active' : s === 'pending' ? 'badge-pending' : 'badge-danger'

  if (loading) return <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600" /></div>

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Leave Management</h1>
        <p className="text-sm text-gray-500">
          {user?.role === 'manager' && 'Approving leave for your gym's full-time trainers and operations staff'}
          {user?.role === 'business_ops' && 'Approving leave for gym managers'}
          {user?.role === 'admin' && 'Approving leave for Business Operations staff'}
        </p>
      </div>

      {success && <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700"><CheckCircle className="w-4 h-4 flex-shrink-0" />{success}</div>}

      {/* Context banner */}
      <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <p>
          {user?.role === 'manager' && 'You are reviewing leave from your gym's full-time trainers and operations staff. Approved leave will be deducted from their annual entitlement.'}
          {user?.role === 'business_ops' && 'You are reviewing leave from gym managers across all gym clubs. Manager leave goes to you for approval.'}
          {user?.role === 'admin' && 'You are reviewing leave from Business Operations staff. Their leave escalates to you for approval.'}
        </p>
      </div>

      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4">
            <h3 className="font-bold text-gray-900">Reject Leave</h3>
            <div><label className="label">Reason *</label><textarea className="input min-h-[80px]" value={rejectReason} onChange={e => setRejectReason(e.target.value)} /></div>
            <div className="flex gap-2">
              <button onClick={handleReject} disabled={!rejectReason.trim()} className="btn-danger flex-1">Reject</button>
              <button onClick={() => { setRejectId(null); setRejectReason('') }} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Leave balances */}
      <div className="card">
        <div className="p-4 border-b border-gray-100"><h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2"><Users className="w-4 h-4 text-red-600" /> Staff Leave Balances ({new Date().getFullYear()})</h2></div>
        {staffBalances.length === 0 ? <p className="p-4 text-sm text-gray-400 text-center">No staff found</p> : (
          <div className="divide-y divide-gray-100">
            {staffBalances.map(s => (
              <div key={s.id} className="flex items-center gap-3 p-3">
                <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-red-700 font-semibold text-xs">{s.full_name.charAt(0)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{s.full_name}</p>
                  <p className="text-xs text-gray-400 capitalize">{s.role}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={cn('text-sm font-bold', s.balance < 3 ? 'text-red-600' : 'text-gray-900')}>{s.balance} days left</p>
                  <p className="text-xs text-gray-400">{s.taken} taken / {s.leave_entitlement_days} entitled</p>
                  {s.pending > 0 && <p className="text-xs text-amber-500">{s.pending} days pending</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Applications */}
      <div className="flex gap-1">
        {['pending', 'approved', 'rejected', 'all'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors',
              filter === f ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
            {f}
          </button>
        ))}
      </div>

      {applications.length === 0 ? (
        <div className="card p-8 text-center"><Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" /><p className="text-gray-500 text-sm">No {filter === 'all' ? '' : filter} leave applications</p></div>
      ) : (
        <div className="space-y-2">
          {applications.map(app => (
            <div key={app.id} className="card p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900 text-sm">{app.user?.full_name}</p>
                    <span className={statusBadge(app.status)}>{app.status}</span>
                    <span className="text-xs text-gray-500">{LEAVE_TYPES[app.leave_type] || app.leave_type}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {formatDate(app.start_date)} — {formatDate(app.end_date)} · <strong>{app.days_applied} day{app.days_applied !== 1 ? 's' : ''}</strong>
                  </p>
                  {app.reason && <p className="text-xs text-gray-400 mt-0.5">Reason: {app.reason}</p>}
                  {app.rejection_reason && <p className="text-xs text-red-500 mt-0.5">Rejected: {app.rejection_reason}</p>}
                </div>
                {app.status === 'pending' && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => handleApprove(app.id)} className="btn-primary text-xs py-1.5 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Approve</button>
                    <button onClick={() => setRejectId(app.id)} className="btn-secondary text-xs py-1.5"><XCircle className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
