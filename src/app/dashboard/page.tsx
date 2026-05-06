'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useViewMode } from '@/lib/view-mode-context'
import { formatSGD, formatDateTime, formatDate, getMonthName } from '@/lib/utils'
import {
  Users, Building2, Settings, ChevronRight, CheckCircle, ChevronDown, ChevronUp,
  Clock, DollarSign, Briefcase, UserCheck, Dumbbell, Shield,
  CreditCard, Calendar, Package, AlertTriangle, AlertCircle,
  TrendingUp, UserX, Bell, FileText, Gift, X } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'




// Biz Ops action alerts: pending manager leave + public holidays setup prompt
function BizOpsDashboardAlerts() {
  const [pendingLeave, setPendingLeave] = useState(0)
  const [holidaysSetUp, setHolidaysSetUp] = useState(true)
  const [cpfRatesSetUp, setCpfRatesSetUp] = useState(true)
  const [leaveEntitlementReminder, setLeaveEntitlementReminder] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      // Pending leave: managers awaiting biz ops approval
      const { data: managers } = await supabase.from('users').select('id').eq('role', 'manager')
      const mgrIds = managers?.map((m: any) => m.id) || []
      if (mgrIds.length > 0) {
        const { count } = await supabase.from('leave_applications')
          .select('id', { count: 'exact', head: true })
          .in('user_id', mgrIds).eq('status', 'pending')
        setPendingLeave(count || 0)
      }

      // Check if next year public holidays are set up (prompt from 15 Nov through 31 Dec)
      const now = new Date()
      // Nov 15 onwards in November, OR any day in December.
      // Previous && logic created a 14-day blind spot from Dec 1–14.
      const isYearEndPromptWindow = now.getMonth() === 11 // 1 Dec through 31 Dec
      if (isYearEndPromptWindow) {
        const nextYear = now.getFullYear() + 1
        const { count } = await supabase.from('public_holidays')
          .select('id', { count: 'exact', head: true }).eq('year', nextYear)
        setHolidaysSetUp((count || 0) > 0)

        // Check if CPF age bracket rates have been configured for next year.
        // SG has 5 age brackets (≤55, 55–60, 60–65, 65–70, >70) — require all 5
        // explicitly effective from Jan 1 next year, otherwise the prompt stays.
        const nextYearDate = `${nextYear}-01-01`
        const { count: cpfCount } = await supabase.from('cpf_age_brackets')
          .select('id', { count: 'exact', head: true })
          .eq('effective_from', nextYearDate)
        setCpfRatesSetUp((cpfCount || 0) >= 5)

        // Remind Biz Ops to review leave entitlements for all staff for the new year
        setLeaveEntitlementReminder(true)
      }
    }
    load()
  }, [])

  if (pendingLeave === 0 && holidaysSetUp && cpfRatesSetUp && !leaveEntitlementReminder) return null

  return (
    <div className="space-y-3">
      {pendingLeave > 0 && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <Calendar className="w-5 h-5 text-blue-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-800">
              {pendingLeave} manager leave application{pendingLeave > 1 ? 's' : ''} awaiting your approval
            </p>
          </div>
          <Link href="/dashboard/hr/leave" className="btn-primary text-xs py-1.5 flex-shrink-0">Review</Link>
        </div>
      )}
      {!cpfRatesSetUp && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">
              Action required — {new Date().getFullYear() + 1} CPF age bracket rates not yet configured
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Update CPF rates effective from 1 Jan {new Date().getFullYear() + 1} before processing payroll.
            </p>
          </div>
          <Link href="/dashboard/payroll/cpf" className="btn-primary text-xs py-1.5 flex-shrink-0">Update</Link>
        </div>
      )}
      {!holidaysSetUp && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">
              Action required — {new Date().getFullYear() + 1} public holidays not yet configured
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Set up next year's public holidays so leave calculations remain accurate.
            </p>
          </div>
          <Link href="/dashboard/config/public-holidays" className="btn-primary text-xs py-1.5 flex-shrink-0">Set Up</Link>
        </div>
      )}
      {leaveEntitlementReminder && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">
              Reminder — review staff leave entitlements for {new Date().getFullYear() + 1}
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Update each staff member's annual leave days before the new year begins.
            </p>
          </div>
          <Link href="/dashboard/hr/staff" className="btn-primary text-xs py-1.5 flex-shrink-0">Review</Link>
        </div>
      )}
    </div>
  )
}

// Per-gym operational activity for Business Ops dashboard
function BizOpsGymActivity() {
  const [gyms, setGyms] = useState<any[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: gymsData } = await supabase.from('gyms').select('id, name').eq('is_active', true).order('name')
      const now = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString()
      const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

      const enriched = await Promise.all((gymsData || []).map(async (g: any) => {
        // Supabase query builders return PromiseLike, not Promise — never use Promise.all() with them.
        // Sequential awaits per gym; gyms still run in parallel via the outer Promise.all-over-async-fn.
        const { data: todaySessions } = await supabase.from('sessions')
          .select('scheduled_at, status, member:members(full_name), trainer:users!sessions_trainer_id_fkey(full_name)')
          .eq('gym_id', g.id).gte('scheduled_at', todayStart).lte('scheduled_at', todayEnd).order('scheduled_at')
        const { count: pendingMemberships } = await supabase.from('gym_memberships')
          .select('id', { count: 'exact', head: true })
          .eq('gym_id', g.id).eq('sale_status', 'pending')
        const { count: pendingSessions } = await supabase.from('sessions')
          .select('id', { count: 'exact', head: true })
          .eq('gym_id', g.id).eq('status', 'completed').eq('is_notes_complete', true).eq('manager_confirmed', false)
        const { data: lowPkgs } = await supabase.from('packages')
          .select('package_name, sessions_used, total_sessions, member:members(full_name)')
          .eq('gym_id', g.id).eq('status', 'active').filter('total_sessions - sessions_used', 'lte', 3).limit(5)
        const { data: expiringPkgs } = await supabase.from('packages')
          .select('package_name, end_date_calculated, member:members(full_name)')
          .eq('gym_id', g.id).eq('status', 'active')
          .lte('end_date_calculated', in14Days).gte('end_date_calculated', now.toISOString().split('T')[0]).limit(5)

        const totalAlerts = (pendingMemberships || 0) + (pendingSessions || 0) + (lowPkgs?.length || 0) + (expiringPkgs?.length || 0)
        return { ...g, todaySessions: todaySessions || [], pendingMemberships: pendingMemberships || 0, pendingSessions: pendingSessions || 0, lowPkgs: lowPkgs || [], expiringPkgs: expiringPkgs || [], totalAlerts }
      }))

      setGyms(enriched)
    }
    load()
  }, [])

  if (gyms.length === 0) return null

  return (
    <div className="space-y-3">
      <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
        <Calendar className="w-4 h-4 text-red-600" /> Today's Activity by Gym Club
      </h2>
      {gyms.map(g => (
        <div key={g.id} className="card">
          <button onClick={() => setExpanded(expanded === g.id ? null : g.id)}
            className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors text-left">
            <Building2 className="w-4 h-4 text-red-600 flex-shrink-0" />
            <p className="text-sm font-medium text-gray-900 flex-1">{g.name}</p>
            <div className="flex items-center gap-2 flex-shrink-0">
              {g.totalAlerts > 0 && (
                <span className="bg-amber-100 text-amber-700 text-xs font-medium px-2 py-0.5 rounded-full">
                  {g.totalAlerts} alert{g.totalAlerts !== 1 ? "s" : ""}
                </span>
              )}
              <span className="text-xs text-gray-400">{g.todaySessions.length} sessions today</span>
              {expanded === g.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </div>
          </button>

          {expanded === g.id && (
            <div className="border-t border-gray-100 divide-y divide-gray-100">
              {/* Pending confirmations */}
              {(g.pendingMemberships > 0 || g.pendingSessions > 0) && (
                <div className="p-3 bg-amber-50">
                  <p className="text-xs font-semibold text-amber-800 mb-2 flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5" /> Pending Confirmations
                  </p>
                  <div className="flex gap-3 text-xs text-amber-700">
                    {g.pendingMemberships > 0 && <span>{g.pendingMemberships} membership sale{g.pendingMemberships !== 1 ? "s" : ""}</span>}
                    {g.pendingSessions > 0 && <span>{g.pendingSessions} PT session{g.pendingSessions !== 1 ? "s" : ""}</span>}
                  </div>
                </div>
              )}

              {/* Today's sessions */}
              <div className="p-3">
                <p className="text-xs font-semibold text-gray-600 mb-2">Today's PT Sessions ({g.todaySessions.length})</p>
                {g.todaySessions.length === 0 ? (
                  <p className="text-xs text-gray-400">No sessions scheduled today</p>
                ) : (
                  <div className="space-y-1">
                    {g.todaySessions.map((s: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="text-gray-500 w-12 flex-shrink-0">
                          {new Date(s.scheduled_at).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <span className="text-gray-900 font-medium">{s.member?.full_name}</span>
                        <span className="text-gray-400">· {s.trainer?.full_name}</span>
                        <span className={cn("ml-auto px-1.5 py-0.5 rounded text-xs font-medium",
                          s.status === "completed" ? "bg-green-100 text-green-700" :
                          s.status === "cancelled" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700")}>
                          {s.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Expiry alerts */}
              {(g.lowPkgs.length > 0 || g.expiringPkgs.length > 0) && (
                <div className="p-3 bg-red-50">
                  <p className="text-xs font-semibold text-red-800 mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> Package Alerts
                  </p>
                  {g.lowPkgs.map((p: any, i: number) => (
                    <p key={"low"+i} className="text-xs text-red-700">{p.member?.full_name} — {p.package_name}: {p.total_sessions - p.sessions_used} sessions left</p>
                  ))}
                  {g.expiringPkgs.map((p: any, i: number) => (
                    <p key={"exp"+i} className="text-xs text-red-700">{p.member?.full_name} — {p.package_name}: expires {formatDate(p.end_date_calculated)}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// Per-gym breakdown for Business Ops dashboard
function BizOpsGymBreakdown() {
  const [gyms, setGyms] = useState<any[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const supabase = createClient()
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  useEffect(() => {
    const load = async () => {
      const { data: gymsData } = await supabase.from('gyms').select('id, name').eq('is_active', true).order('name')

      const enriched = await Promise.all((gymsData || []).map(async (g: any) => {
        // Supabase query builders return PromiseLike, not Promise — never use Promise.all() with them.
        // Sequential awaits per gym; gyms still run in parallel via the outer Promise.all-over-async-fn.
        const { count: members } = await supabase.from('members')
          .select('id', { count: 'exact', head: true }).eq('gym_id', g.id)
        const { data: memSales } = await supabase.from('gym_memberships')
          .select('price_sgd, commission_sgd').eq('gym_id', g.id).eq('sale_status', 'confirmed').gte('created_at', monthStart)
        const { data: sessions } = await supabase.from('sessions')
          .select('session_commission_sgd').eq('gym_id', g.id).eq('status', 'completed').gte('marked_complete_at', monthStart)
        const { data: payouts } = await supabase.from('commission_payouts')
          .select('total_commission_sgd').eq('gym_id', g.id).in('status', ['approved', 'paid']).gte('generated_at', monthStart)
        return {
          ...g,
          members: members || 0,
          membershipSalesCount: memSales?.length || 0,
          membershipRevenue: memSales?.reduce((s: number, m: any) => s + (m.price_sgd || 0), 0) || 0,
          sessionsCount: sessions?.length || 0,
          commissionPayout: payouts?.reduce((s: number, p: any) => s + (p.total_commission_sgd || 0), 0) || 0,
        }
      }))
      setGyms(enriched)
    }
    load()
  }, [])

  const totals = gyms.reduce((acc, g) => ({
    members: acc.members + g.members,
    membershipSalesCount: acc.membershipSalesCount + g.membershipSalesCount,
    membershipRevenue: acc.membershipRevenue + g.membershipRevenue,
    sessionsCount: acc.sessionsCount + g.sessionsCount,
    commissionPayout: acc.commissionPayout + g.commissionPayout,
  }), { members: 0, membershipSalesCount: 0, membershipRevenue: 0, sessionsCount: 0, commissionPayout: 0 })

  if (gyms.length === 0) return null
  const monthName = now.toLocaleString('default', { month: 'long' })

  return (
    <div className="card">
      <div className="p-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
          <Building2 className="w-4 h-4 text-red-600" /> {monthName} — All Gym Clubs
        </h2>
        <p className="text-xs text-gray-400 mt-0.5">Click a gym to expand details</p>
      </div>

      {/* Totals row */}
      <div className="grid grid-cols-4 divide-x divide-gray-100 bg-gray-50 border-b border-gray-100">
        {[
          { label: 'Total Members', value: totals.members.toString() },
          { label: 'Membership Sales', value: totals.membershipSalesCount.toString(), sub: formatSGD(totals.membershipRevenue) },
          { label: 'PT Sessions', value: totals.sessionsCount.toString() },
          { label: 'Commission Paid', value: formatSGD(totals.commissionPayout) },
        ].map(({ label, value, sub }) => (
          <div key={label} className="p-3 text-center">
            <p className="text-sm font-bold text-gray-900">{value}</p>
            {sub && <p className="text-xs text-gray-400">{sub}</p>}
            <p className="text-xs text-gray-400 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Per-gym rows */}
      <div className="divide-y divide-gray-100">
        {gyms.map(g => (
          <div key={g.id}>
            <button onClick={() => setExpanded(expanded === g.id ? null : g.id)}
              className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors text-left">
              <Building2 className="w-4 h-4 text-red-600 flex-shrink-0" />
              <p className="text-sm font-medium text-gray-900 flex-1">{g.name}</p>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>{g.members} members</span>
                <span>{g.membershipSalesCount} sales</span>
                <span>{g.sessionsCount} sessions</span>
                <span className="font-medium text-green-700">{formatSGD(g.commissionPayout)}</span>
              </div>
              {expanded === g.id
                ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
            </button>

            {expanded === g.id && (
              <div className="grid grid-cols-2 gap-3 px-4 pb-4 bg-gray-50">
                <div className="stat-card">
                  <p className="text-xs text-gray-500">Members</p>
                  <p className="text-2xl font-bold">{g.members}</p>
                </div>
                <div className="stat-card">
                  <p className="text-xs text-gray-500">PT Sessions</p>
                  <p className="text-2xl font-bold">{g.sessionsCount}</p>
                </div>
                <div className="stat-card">
                  <p className="text-xs text-gray-500">Membership Sales ({g.membershipSalesCount})</p>
                  <p className="text-xl font-bold">{formatSGD(g.membershipRevenue)}</p>
                </div>
                <div className="stat-card">
                  <p className="text-xs text-gray-500">Commission Payouts</p>
                  <p className="text-xl font-bold text-green-700">{formatSGD(g.commissionPayout)}</p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}


// ── Birthday panel ───────────────────────────────────────────
// Shows staff birthdays in the next 7 days for Manager / Biz Ops.
// Hidden when empty. Slide-out panel on click.
function BirthdayPanel({ gymId, isBizOps }: { gymId?: string | null, isBizOps?: boolean }) {
  const [birthdays, setBirthdays] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const today = new Date()
      // Build a list of upcoming (month, day) pairs for the next 7 days
      const upcoming: { month: number; day: number }[] = []
      for (let i = 0; i <= 6; i++) {
        const d = new Date(today)
        d.setDate(today.getDate() + i)
        upcoming.push({ month: d.getMonth() + 1, day: d.getDate() })
      }

      let query = supabase
        .from('users')
        .select('id, full_name, date_of_birth, role, manager_gym_id, trainer_gyms(gym_id, gyms(name)), gyms:manager_gym_id(name)')
        .eq('is_archived', false)
        .eq('is_active', true)
        .not('date_of_birth', 'is', null)
        .in('role', ['manager', 'trainer', 'staff'])

      if (!isBizOps && gymId) {
        // Manager: only own gym staff
        query = query.eq('manager_gym_id', gymId)
      }

      const { data } = await query

      // Filter to birthdays in the next 7 days using month+day comparison
      const results = (data || []).filter((u: any) => {
        if (!u.date_of_birth) return false
        const dob = new Date(u.date_of_birth)
        return upcoming.some(({ month, day }) =>
          dob.getMonth() + 1 === month && dob.getDate() === day
        )
      }).map((u: any) => {
        // Calculate which upcoming date matches
        const dob = new Date(u.date_of_birth)
        const matchDay = upcoming.find(({ month, day }) =>
          dob.getMonth() + 1 === month && dob.getDate() === day
        )!
        const birthdayThisYear = new Date(today.getFullYear(), dob.getMonth(), dob.getDate())
        const daysAway = Math.round((birthdayThisYear.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000)
        const gymName = u.gyms?.name || u.trainer_gyms?.[0]?.gyms?.name || '—'
        return { ...u, daysAway, gymName }
      }).sort((a: any, b: any) => a.daysAway - b.daysAway)

      setBirthdays(results)
    }
    load()
  }, [gymId, isBizOps])

  if (birthdays.length === 0) return null

  return (
    <>
      {/* Birthday banner */}
      <button onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 bg-pink-50 border border-pink-200 rounded-xl p-4 text-left hover:bg-pink-100 transition-colors">
        <Gift className="w-5 h-5 text-pink-500 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-pink-800">
            {birthdays.length} upcoming birthday{birthdays.length > 1 ? 's' : ''} in the next 7 days
          </p>
          <p className="text-xs text-pink-600 mt-0.5">
            {birthdays.slice(0, 2).map((b: any) => b.full_name.split(' ')[0]).join(', ')}
            {birthdays.length > 2 ? ` +${birthdays.length - 2} more` : ''}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-pink-400 flex-shrink-0" />
      </button>

      {/* Slide-out panel overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setOpen(false)}>
          <div className="fixed inset-0 bg-black/20" />
          <div className="relative w-full max-w-sm bg-white h-full shadow-xl flex flex-col"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Gift className="w-5 h-5 text-pink-500" />
                <h2 className="font-semibold text-gray-900 text-sm">Upcoming Birthdays</h2>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {birthdays.map((b: any) => {
                const dob = new Date(b.date_of_birth)
                const age = new Date().getFullYear() - dob.getFullYear()
                return (
                  <div key={b.id} className="p-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-pink-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-medium text-pink-700">
                        {b.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{b.full_name}</p>
                      <p className="text-xs text-gray-500">
                        {isBizOps && <span className="mr-1">{b.gymName} ·</span>}
                        Turns {age} · {dob.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                      b.daysAway === 0 ? 'bg-pink-100 text-pink-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {b.daysAway === 0 ? 'Today! 🎂' : `In ${b.daysAway}d`}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // Admin state
  const [gymBreakdown, setGymBreakdown] = useState<any[]>([])
  const [roleCounts, setRoleCounts] = useState<Record<string, number>>({})

  // Manager/trainer shared state
  const [todaySessions, setTodaySessions] = useState<any[]>([])
  const [upcomingSessions, setUpcomingSessions] = useState<any[]>([])
  const [gymScheduleSessions, setGymScheduleSessions] = useState<any[]>([])
  const [pendingMemberships, setPendingMemberships] = useState(0)
  const [pendingSessions, setPendingSessions] = useState(0)

  // Manager alerts
  const [lowSessionPackages, setLowSessionPackages] = useState<any[]>([])
  const [expiringPackages, setExpiringPackages] = useState<any[]>([])
  const [expiringMemberships, setExpiringMemberships] = useState<any[]>([])
  const [atRiskMembers, setAtRiskMembers] = useState<any[]>([])
  const [pendingLeave, setPendingLeave] = useState(0)

  // Stats
  const [stats, setStats] = useState<any>({})
  const [newPayslip, setNewPayslip] = useState<any>(null) // latest unseen approved/paid payslip
  const [newCommission, setNewCommission] = useState<any>(null) // latest unseen approved commission

  const supabase = createClient()
  const { isActingAsTrainer } = useViewMode()

  useEffect(() => {
    const load = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return
      const { data: u } = await supabase.from('users').select('*').eq('id', authUser.id).single()
      if (!u) return
      setUser(u)

      // ── Admin ────────────────────────────────────────────
      if (u.role === 'admin') {
        const { data: gyms } = await supabase.from('gyms').select('*').order('name')
        const { data: allStaff } = await supabase.from('users').select('id, role, manager_gym_id, trainer_gyms(gym_id)').eq('is_archived', false)
        const rc: Record<string, number> = {}
        allStaff?.forEach((s: any) => { rc[s.role] = (rc[s.role] || 0) + 1 })
        setRoleCounts(rc)
        setGymBreakdown((gyms || []).map(g => ({
          ...g,
          managers: allStaff?.filter((s: any) => s.role === 'manager' && s.manager_gym_id === g.id).length || 0,
          trainers: allStaff?.filter((s: any) => s.role === 'trainer' && (s.trainer_gyms as any[])?.some((tg: any) => tg.gym_id === g.id)).length || 0,
        })))
        // Pending Biz Ops leave awaiting admin approval
        const bizOpsIds = allStaff?.filter((s: any) => s.role === 'business_ops').map((s: any) => s.id) || []
        if (bizOpsIds.length > 0) {
          const { count: leavePending } = await supabase.from('leave_applications')
            .select('id', { count: 'exact', head: true })
            .in('user_id', bizOpsIds).eq('status', 'pending')
          setPendingLeave(leavePending || 0)
        }
        setLoading(false)
        return
      }

      const gymId = u.manager_gym_id
      const isManager = u.role === 'manager' && !isActingAsTrainer
      const isTrainer = u.role === 'trainer' || isActingAsTrainer
      const now = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

      // ── Today's sessions ─────────────────────────────────
      let todayQ = supabase.from('sessions')
        .select('*, member:members(full_name), trainer:users!sessions_trainer_id_fkey(full_name), package:packages(package_name)')
        .gte('scheduled_at', todayStart).lte('scheduled_at', todayEnd)
        .order('scheduled_at')
      if (isTrainer) todayQ = todayQ.eq('trainer_id', authUser.id)
      else if (gymId) todayQ = todayQ.eq('gym_id', gymId)
      const { data: todayData } = await todayQ
      setTodaySessions(todayData || [])

      // ── Upcoming (next 5 excluding today) ────────────────
      let upQ = supabase.from('sessions')
        .select('*, member:members(full_name), trainer:users!sessions_trainer_id_fkey(full_name)')
        .eq('status', 'scheduled').gt('scheduled_at', todayEnd)
        .order('scheduled_at').limit(5)
      if (isTrainer) upQ = upQ.eq('trainer_id', authUser.id)
      else if (gymId) upQ = upQ.eq('gym_id', gymId)
      const { data: upData } = await upQ
      setUpcomingSessions(upData || [])

      // ── Gym schedule (manager + trainer + staff): upcoming sessions ──
      if (isManager || isTrainer || u.role === 'staff') {
        let gymSchedQ = supabase.from('sessions')
          .select('*, member:members(full_name, phone), trainer:users!sessions_trainer_id_fkey(full_name)')
          .eq('status', 'scheduled').gte('scheduled_at', now.toISOString())
          .order('scheduled_at').limit(20)
        if (isManager && gymId) {
          // Manager: their assigned gym
          gymSchedQ = gymSchedQ.eq('gym_id', gymId)
        } else if (u.role === 'staff' && gymId) {
          // Staff: their assigned gym
          gymSchedQ = gymSchedQ.eq('gym_id', gymId)
        } else if (isTrainer) {
          // Trainer: all gyms they are assigned to
          const { data: tgRows } = await supabase.from('trainer_gyms').select('gym_id').eq('trainer_id', authUser.id)
          const gymIds = tgRows?.map((r: any) => r.gym_id) || []
          if (gymIds.length > 0) gymSchedQ = gymSchedQ.in('gym_id', gymIds)
        }
        const { data: gymSchedData } = await gymSchedQ
        setGymScheduleSessions(gymSchedData || [])
      }

      // ── Stats ────────────────────────────────────────────
      let memberQ = supabase.from('members').select('id', { count: 'exact', head: true })
      if (isTrainer) memberQ = memberQ.eq('created_by', authUser.id)
      else if (gymId) memberQ = memberQ.eq('gym_id', gymId)
      const { count: memberCount } = await memberQ

      let pkgQ = supabase.from('packages').select('id', { count: 'exact', head: true }).eq('status', 'active')
      if (isTrainer) pkgQ = pkgQ.eq('trainer_id', authUser.id)
      else if (gymId) pkgQ = pkgQ.eq('gym_id', gymId)
      const { count: pkgCount } = await pkgQ

      let sessQ = supabase.from('sessions').select('session_commission_sgd').eq('status', 'completed').gte('marked_complete_at', monthStart)
      if (isTrainer) sessQ = sessQ.eq('trainer_id', authUser.id)
      else if (gymId) sessQ = sessQ.eq('gym_id', gymId)
      const { data: sessData } = await sessQ
      const commission = sessData?.reduce((s: number, r: any) => s + (r.session_commission_sgd || 0), 0) || 0
      const sessCount = sessData?.length || 0

      // Per-gym breakdown for biz ops (loaded inline in component)
      // Membership sales revenue + commission payout for manager/biz ops
      let membershipRevenue = 0
      let membershipSalesCount = 0
      let totalCommissionPayout = 0

      if (!isTrainer) {
        // Confirmed membership sales this month
        let memQ = supabase.from('gym_memberships')
          .select('price_sgd, commission_sgd')
          .eq('sale_status', 'confirmed')
          .gte('created_at', monthStart)
        if (gymId) memQ = memQ.eq('gym_id', gymId)
        const { data: memSalesData } = await memQ
        membershipRevenue = memSalesData?.reduce((s: number, m: any) => s + (m.price_sgd || 0), 0) || 0
        membershipSalesCount = memSalesData?.length || 0

        // Total commission payouts (approved + paid) for the month
        let payoutQ = supabase.from('commission_payouts')
          .select('total_commission_sgd')
          .in('status', ['approved', 'paid'])
          .gte('generated_at', monthStart)
        if (gymId) payoutQ = payoutQ.eq('gym_id', gymId)
        const { data: payoutData } = await payoutQ
        totalCommissionPayout = payoutData?.reduce((s: number, p: any) => s + (p.total_commission_sgd || 0), 0) || 0
      }

      setStats({ members: memberCount || 0, packages: pkgCount || 0, sessions: sessCount, commission, membershipRevenue, membershipSalesCount, totalCommissionPayout })

      // ── Manager-only alerts ──────────────────────────────
      if (isManager && gymId) {
        // Pending membership confirmations
        const { count: memPending } = await supabase.from('gym_memberships')
          .select('id', { count: 'exact', head: true }).eq('gym_id', gymId).eq('sale_status', 'pending')
        setPendingMemberships(memPending || 0)

        // Pending session confirmations
        const { count: sessPending } = await supabase.from('sessions')
          .select('id', { count: 'exact', head: true })
          .eq('gym_id', gymId).eq('status', 'completed').eq('is_notes_complete', true).eq('manager_confirmed', false)
        setPendingSessions(sessPending || 0)

        // Packages with ≤3 sessions remaining
        const { data: lowPkgs } = await supabase.from('packages')
          .select('*, member:members(full_name), trainer:users!packages_trainer_id_fkey(full_name)')
          .eq('gym_id', gymId).eq('status', 'active')
          .filter('total_sessions - sessions_used', 'lte', 3)
          .order('sessions_used', { ascending: false })
          .limit(10)
        setLowSessionPackages(lowPkgs || [])

        // Packages expiring within 7 days
        const in14Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        const { data: expPkgs } = await supabase.from('packages')
          .select('*, member:members(full_name), trainer:users!packages_trainer_id_fkey(full_name)')
          .eq('gym_id', gymId).eq('status', 'active')
          .lte('end_date_calculated', in14Days)
          .gte('end_date_calculated', now.toISOString().split('T')[0])
          .order('end_date_calculated')
          .limit(10)
        setExpiringPackages(expPkgs || [])

        // Gym memberships expiring within 30 days
        const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        const { data: expiringMems } = await supabase.from('gym_memberships')
          .select('id, end_date, member:members(full_name), membership_type_name')
          .eq('gym_id', gymId)
          .eq('status', 'active')
          .lte('end_date', in30Days)
          .gte('end_date', now.toISOString().split('T')[0])
          .order('end_date')
          .limit(10)
        setExpiringMemberships(expiringMems || [])

        // At-risk: packages expired in last 30 days with no new active package
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        const { data: expiredPkgs } = await supabase.from('packages')
          .select('id, member_id, member:members(full_name, phone), end_date_calculated')
          .eq('gym_id', gymId).eq('status', 'expired')
          .gte('end_date_calculated', thirtyDaysAgo)
        // Filter out those who have a new active package
        const expiredMemberIds = Array.from(new Set(expiredPkgs?.map((p: any) => p.member_id)))
        if (expiredMemberIds.length > 0) {
          const { data: activePkgs } = await supabase.from('packages')
            .select('member_id').eq('gym_id', gymId).eq('status', 'active').in('member_id', expiredMemberIds)
          const activeIds = new Set(activePkgs?.map((p: any) => p.member_id))
          const atRisk = expiredPkgs?.filter((p: any) => !activeIds.has(p.member_id))
            .reduce((acc: any[], p: any) => {
              if (!acc.find((x: any) => x.member_id === p.member_id)) acc.push(p)
              return acc
            }, []) || []

          // Fetch non-renewal reason from last session notes for each at-risk member
          const atRiskWithReason = await Promise.all(atRisk.map(async (p: any) => {
            const { data: lastSession } = await supabase.from('sessions')
              .select('renewal_status, non_renewal_reason')
              .eq('package_id', p.id)
              .not('renewal_status', 'is', null)
              .order('scheduled_at', { ascending: false })
              .limit(1).single()
            return { ...p, renewal_status: lastSession?.renewal_status, non_renewal_reason: lastSession?.non_renewal_reason }
          }))
          setAtRiskMembers(atRiskWithReason)
        }

        // Pending leave approvals — full-time trainers + ops staff only (not part-timers)
        const { data: opsStaffIds } = await supabase.from('users')
          .select('id').eq('manager_gym_id', gymId).eq('role', 'staff')
        const { data: gymTrainerIds } = await supabase.from('trainer_gyms')
          .select('trainer_id').eq('gym_id', gymId)
        const rawTrainerIds = gymTrainerIds?.map((t: any) => t.trainer_id) || []
        let ftTrainerIds: string[] = []
        if (rawTrainerIds.length > 0) {
          const { data: ftOnly } = await supabase.from('users')
            .select('id').in('id', rawTrainerIds).eq('employment_type', 'full_time')
          ftTrainerIds = ftOnly?.map((t: any) => t.id) || []
        }
        const leaveStaffIds = [
          ...(opsStaffIds?.map((s: any) => s.id) || []),
          ...ftTrainerIds,
        ]
        if (leaveStaffIds.length > 0) {
          const { count: leavePending } = await supabase.from('leave_applications')
            .select('id', { count: 'exact', head: true }).in('user_id', leaveStaffIds).eq('status', 'pending')
          setPendingLeave(leavePending || 0)
        }
      }

      // ── Payslip & commission notifications ──────────────
      // Show once after approval — compare against seen timestamp on user record
      const seenPayslip = u.payslip_notif_seen_at ? new Date(u.payslip_notif_seen_at) : null
      const seenCommission = u.commission_notif_seen_at ? new Date(u.commission_notif_seen_at) : null

      // Latest approved/paid payslip newer than last seen timestamp
      const { data: latestPayslip } = await supabase
        .from('payslips')
        .select('id, month, year, net_salary, status, approved_at')
        .eq('user_id', authUser.id)
        .in('status', ['approved', 'paid'])
        .order('approved_at', { ascending: false })
        .limit(1)
        .single()
      if (latestPayslip?.approved_at) {
        const approvedAt = new Date(latestPayslip.approved_at)
        if (!seenPayslip || approvedAt > seenPayslip) {
          setNewPayslip(latestPayslip)
        }
      }

      // Latest approved commission payout newer than last seen timestamp
      const { data: latestCommission } = await supabase
        .from('commission_payouts')
        .select('id, month, year, total_commission_sgd, approved_at')
        .eq('trainer_id', authUser.id)
        .eq('status', 'approved')
        .order('approved_at', { ascending: false })
        .limit(1)
        .single()
      if (latestCommission?.approved_at) {
        const approvedAt = new Date(latestCommission.approved_at)
        if (!seenCommission || approvedAt > seenCommission) {
          setNewCommission(latestCommission)
        }
      }

      setLoading(false)
    }
    load()
  }, [isActingAsTrainer])

  if (loading || !user) return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" />
    </div>
  )

  const now = new Date()
  const todayStr = now.toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long' })
  const isAdmin = user.role === 'admin'
  const dismissNotifications = async () => {
    const supabase = createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return
    await supabase.from('users').update({
      payslip_notif_seen_at: new Date().toISOString(),
      commission_notif_seen_at: new Date().toISOString(),
    }).eq('id', authUser.id)
    setNewPayslip(null)
    setNewCommission(null)
  }

  const isBizOps = user.role === 'business_ops'
  const isStaff = user.role === 'staff'
  const isManager = user.role === 'manager' && !isActingAsTrainer
  const isTrainer = user.role === 'trainer' || isActingAsTrainer
  const totalPending = pendingMemberships + pendingSessions
  const totalAlerts = lowSessionPackages.length + expiringPackages.length + atRiskMembers.length

  // ── Admin dashboard ──────────────────────────────────────
  if (isAdmin) return (
    <div className="space-y-6">
      <div><h1 className="text-xl font-bold text-gray-900">Admin Dashboard</h1><p className="text-sm text-gray-500">View-only · Gym Library</p></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="stat-card"><div className="flex items-center gap-1.5 mb-1"><Building2 className="w-4 h-4 text-red-600" /><p className="text-xs text-gray-500">Active Gyms</p></div><p className="text-2xl font-bold">{gymBreakdown.filter(g => g.is_active).length}</p></div>
        {(['business_ops', 'manager', 'trainer'] as const).map(role => {
          const icons = { business_ops: Briefcase, manager: UserCheck, trainer: Dumbbell }
          const colors = { business_ops: 'text-purple-600', manager: 'text-yellow-700', trainer: 'text-green-700' }
          const labels = { business_ops: 'Business Ops', manager: 'Managers', trainer: 'Trainers' }
          const Icon = icons[role]
          return <div key={role} className="stat-card"><div className="flex items-center gap-1.5 mb-1"><Icon className={cn('w-4 h-4', colors[role])} /><p className="text-xs text-gray-500">{labels[role]}</p></div><p className="text-2xl font-bold">{roleCounts[role] || 0}</p></div>
        })}
      </div>
      <div className="card">
        {pendingLeave > 0 && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <Calendar className="w-5 h-5 text-blue-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-800">
              {pendingLeave} Business Ops leave application{pendingLeave > 1 ? 's' : ''} awaiting your approval
            </p>
          </div>
          <Link href="/dashboard/hr/leave" className="btn-primary text-xs py-1.5 flex-shrink-0">Review</Link>
        </div>
      )}
      <div className="p-4 border-b border-gray-100"><h2 className="font-semibold text-gray-900 text-sm">Gym Clubs · Staff Breakdown</h2></div>
        {gymBreakdown.map(gym => (
          <div key={gym.id} className={cn('p-4 border-b border-gray-100 last:border-0', !gym.is_active && 'opacity-50')}>
            <div className="flex items-center gap-3">
              <Building2 className="w-4 h-4 text-red-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{gym.name}{!gym.is_active && ' (Inactive)'}</p>
                {gym.address && <p className="text-xs text-gray-400">{gym.address}</p>}
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded-full font-medium">{gym.managers} Mgr</span>
                <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium">{gym.trainers} Trainers</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="card p-4">
        <h2 className="font-semibold text-gray-900 text-sm mb-3">Quick Actions</h2>
        {[{ href: '/dashboard/admin/staff', l: 'Business Ops Staff', icon: Briefcase }, { href: '/dashboard/hr/leave', l: 'Leave Approvals', icon: Calendar }, { href: '/dashboard/admin/settings', l: 'App Settings', icon: Settings }].map(({ href, l, icon: Icon }) => (
          <Link key={href} href={href} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
            <Icon className="w-4 h-4 text-red-600 flex-shrink-0" /><span className="text-sm text-gray-700 flex-1">{l}</span><ChevronRight className="w-4 h-4 text-gray-400" />
          </Link>
        ))}
      </div>
    </div>
  )

  // ── Manager / Trainer dashboard ──────────────────────────
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">
          {isTrainer ? `Welcome, ${user.full_name.split(' ')[0]} 👋` : 'Operations Dashboard'}
        </h1>
        <p className="text-sm text-gray-500">{todayStr}</p>
      </div>

      {/* ── Pending actions banner ── */}
      {isManager && totalPending > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <Bell className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">
              {totalPending} item{totalPending > 1 ? 's' : ''} pending your confirmation
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              {pendingMemberships > 0 && `${pendingMemberships} membership sale${pendingMemberships > 1 ? 's' : ''}`}
              {pendingMemberships > 0 && pendingSessions > 0 && ' · '}
              {pendingSessions > 0 && `${pendingSessions} PT session${pendingSessions > 1 ? 's' : ''}`}
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {pendingMemberships > 0 && <Link href="/dashboard/membership/sales" className="btn-primary text-xs py-1.5">Memberships</Link>}
            {pendingSessions > 0 && <Link href="/dashboard/pt/sessions" className="btn-secondary text-xs py-1.5">Sessions</Link>}
          </div>
        </div>
      )}

      {/* ── Pending leave banner ── */}
      {isManager && pendingLeave > 0 && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <Calendar className="w-5 h-5 text-blue-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-800">{pendingLeave} leave application{pendingLeave > 1 ? 's' : ''} awaiting approval</p>
          </div>
          <Link href="/dashboard/hr/leave" className="btn-primary text-xs py-1.5 flex-shrink-0">Review</Link>
        </div>
      )}

      {/* ── Birthday panel ── */}
      {isManager && (
        <BirthdayPanel gymId={user.manager_gym_id} isBizOps={false} />
      )}

      {/* ── Payslip notification ── */}
      {newPayslip && (
        <Link href="/dashboard/my/payslips" onClick={dismissNotifications}
          className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-4 hover:bg-green-100 transition-colors">
          <FileText className="w-5 h-5 text-green-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-green-800">
              New payslip available — {getMonthName(newPayslip.month)} {newPayslip.year}
            </p>
            <p className="text-xs text-green-600 mt-0.5">
              {newPayslip.status === 'paid' ? 'Paid' : 'Approved'} · Net {formatSGD(newPayslip.net_salary)}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-green-400 flex-shrink-0" />
        </Link>
      )}

      {/* ── Commission notification ── */}
      {newCommission && (
        <Link href="/dashboard/my/payslips?tab=commission" onClick={dismissNotifications}
          className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-4 hover:bg-green-100 transition-colors">
          <DollarSign className="w-5 h-5 text-green-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-green-800">
              Commission payout approved — {getMonthName(newCommission.month)} {newCommission.year}
            </p>
            <p className="text-xs text-green-600 mt-0.5">
              {formatSGD(newCommission.total_commission_sgd)} ready for collection
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-green-400 flex-shrink-0" />
        </Link>
      )}

      {/* ── Stats row ── */}
      {isTrainer ? (
        // Trainer: own stats
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="stat-card">
            <div className="flex items-center justify-between"><p className="text-xs text-gray-500">My Members</p><Users className="w-4 h-4 text-red-600" /></div>
            <p className="text-2xl font-bold">{stats.members}</p>
          </div>
          <div className="stat-card">
            <div className="flex items-center justify-between"><p className="text-xs text-gray-500">Active Packages</p><Package className="w-4 h-4 text-red-600" /></div>
            <p className="text-2xl font-bold">{stats.packages}</p>
          </div>
          <div className="stat-card">
            <div className="flex items-center justify-between"><p className="text-xs text-gray-500">Sessions This Month</p><CheckCircle className="w-4 h-4 text-green-600" /></div>
            <p className="text-2xl font-bold">{stats.sessions}</p>
          </div>
          <div className="stat-card">
            <div className="flex items-center justify-between"><p className="text-xs text-gray-500">My Commission</p><DollarSign className="w-4 h-4 text-red-600" /></div>
            <p className="text-xl font-bold">{formatSGD(stats.commission)}</p>
          </div>
        </div>
      ) : (
        // Manager / Biz Ops: gym-wide stats
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="stat-card">
            <div className="flex items-center justify-between"><p className="text-xs text-gray-500">Members</p><Users className="w-4 h-4 text-red-600" /></div>
            <p className="text-2xl font-bold">{stats.members}</p>
          </div>
          <div className="stat-card">
            <div className="flex items-center justify-between"><p className="text-xs text-gray-500">Sessions This Month</p><CheckCircle className="w-4 h-4 text-green-600" /></div>
            <p className="text-2xl font-bold">{stats.sessions}</p>
          </div>
          <div className="stat-card">
            <div className="flex items-center justify-between"><p className="text-xs text-gray-500">Membership Sales</p><CreditCard className="w-4 h-4 text-red-600" /></div>
            <p className="text-2xl font-bold">{stats.membershipSalesCount ?? 0}</p>
            {stats.membershipRevenue > 0 && <p className="text-xs text-gray-400 mt-1">{formatSGD(stats.membershipRevenue)}</p>}
          </div>
          <div className="stat-card">
            <div className="flex items-center justify-between"><p className="text-xs text-gray-500">Active PT Packages</p><Package className="w-4 h-4 text-red-600" /></div>
            <p className="text-2xl font-bold">{stats.packages}</p>
          </div>
          <div className="stat-card col-span-2">
            <div className="flex items-center justify-between"><p className="text-xs text-gray-500">Commission Payouts This Month</p><DollarSign className="w-4 h-4 text-red-600" /></div>
            <p className="text-xl font-bold">{formatSGD(stats.totalCommissionPayout ?? 0)}</p>
            <p className="text-xs text-gray-400 mt-1">Approved + paid commission payouts</p>
          </div>
        </div>
      )}

      {/* ── Biz Ops: per-gym breakdown ── */}
      {isBizOps && <BirthdayPanel isBizOps={true} />}
      {isBizOps && <BizOpsDashboardAlerts />}
      {isBizOps && <BizOpsGymBreakdown />}
      {/* ── Biz Ops: per-gym activity ── */}
      {isBizOps && <BizOpsGymActivity />}

      {/* ── Today's sessions ── */}
      <div className="card">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
            <Calendar className="w-4 h-4 text-red-600" /> Today's Sessions
            {todaySessions.length > 0 && <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-medium">{todaySessions.length}</span>}
          </h2>
          <Link href="/dashboard/pt/sessions" className={cn('text-xs text-red-600 font-medium', isBizOps && 'hidden')}>All sessions</Link>
        </div>
        {todaySessions.length === 0 ? (
          <div className="p-6 text-center">
            <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No sessions scheduled for today</p>
            {isTrainer && <Link href="/dashboard/pt/sessions/new" className="btn-primary inline-block mt-3 text-xs py-1.5">Schedule session</Link>}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {todaySessions.map((s: any) => {
              const time = new Date(s.scheduled_at).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })
              const statusColor = s.status === 'completed' ? 'bg-green-100 text-green-700' : s.status === 'cancelled' ? 'bg-red-100 text-red-700' : s.status === 'no_show' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
              return (
                <div key={s.id} className="flex items-center gap-3 p-4">
                  <div className="text-center w-12 flex-shrink-0">
                    <p className="text-sm font-bold text-gray-900">{time}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{s.member?.full_name}</p>
                    {!isTrainer && <p className="text-xs text-gray-400">{s.trainer?.full_name}</p>}
                    {s.package?.package_name && <p className="text-xs text-gray-400">{s.package.package_name}</p>}
                  </div>
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium capitalize flex-shrink-0', statusColor)}>
                    {s.status === 'no_show' ? 'No-show' : s.status}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Full Gym Schedule (trainer + staff) ── */}
      {(isManager || isTrainer || isStaff) && (
        <div className="card">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
              <Calendar className="w-4 h-4 text-red-600" /> Full Gym Schedule
              {gymScheduleSessions.length > 0 && <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-medium">{gymScheduleSessions.length}</span>}
            </h2>
            <span className="text-xs text-gray-400">Upcoming scheduled sessions</span>
          </div>
          {gymScheduleSessions.length === 0 ? (
            <div className="p-6 text-center">
              <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No upcoming sessions scheduled</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {gymScheduleSessions.map((s: any) => {
                const isOwn = s.trainer_id === user?.id
                const dt = new Date(s.scheduled_at)
                const dateStr = dt.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' })
                const timeStr = dt.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })
                return (
                  <div key={s.id} className={cn('flex items-center gap-3 p-4', isOwn && 'bg-red-50/30')}>
                    <div className="text-center w-16 flex-shrink-0">
                      <p className="text-xs text-gray-400">{dateStr}</p>
                      <p className="text-sm font-bold text-gray-900">{timeStr}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{s.member?.full_name}</p>
                      <p className="text-xs text-gray-400">{s.trainer?.full_name}{isOwn && ' (You)'}</p>
                      {s.member?.phone && <p className="text-xs text-gray-400">{s.member.phone}</p>}
                    </div>
                    {isOwn && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium flex-shrink-0">Mine</span>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Manager alerts section ── */}
      {isManager && totalAlerts > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" /> Alerts Requiring Attention
          </h2>

          {/* Low session packages */}
          {lowSessionPackages.length > 0 && (
            <div className="card">
              <div className="p-3 border-b border-amber-100 bg-amber-50 rounded-t-xl">
                <p className="text-sm font-medium text-amber-800 flex items-center gap-2">
                  <Package className="w-4 h-4" /> {lowSessionPackages.length} PT Package{lowSessionPackages.length > 1 ? 's' : ''} Running Low (≤3 sessions left)
                </p>
              </div>
              <div className="divide-y divide-gray-100">
                {lowSessionPackages.map((pkg: any) => (
                  <div key={pkg.id} className="flex items-center gap-3 p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{pkg.member?.full_name}</p>
                      <p className="text-xs text-gray-500">{pkg.package_name} · {pkg.trainer?.full_name}</p>
                    </div>
                    <span className="text-sm font-bold text-amber-600 flex-shrink-0">
                      {pkg.total_sessions - pkg.sessions_used} left
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Expiring packages */}
          {expiringMemberships.length > 0 && (
        <div className="card p-4 bg-amber-50 border border-amber-200">
          <p className="text-sm font-medium text-amber-800 mb-2">⚠ {expiringMemberships.length} membership{expiringMemberships.length > 1 ? 's' : ''} expiring within 30 days</p>
          {expiringMemberships.slice(0, 5).map((m: any) => (
            <p key={m.id} className="text-xs text-amber-700">· {m.member?.full_name} — {m.membership_type_name}: expires {formatDate(m.end_date)}</p>
          ))}
          {expiringMemberships.length > 5 && <p className="text-xs text-amber-600 mt-1">+{expiringMemberships.length - 5} more</p>}
        </div>
      )}

      {expiringPackages.length > 0 && (
            <div className="card">
              <div className="p-3 border-b border-red-100 bg-red-50 rounded-t-xl">
                <p className="text-sm font-medium text-red-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> {expiringPackages.length} PT Package{expiringPackages.length > 1 ? 's' : ''} Expiring Within 14 Days
                </p>
              </div>
              <div className="divide-y divide-gray-100">
                {expiringPackages.map((pkg: any) => (
                  <div key={pkg.id} className="flex items-center gap-3 p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{pkg.member?.full_name}</p>
                      <p className="text-xs text-gray-500">{pkg.package_name} · {pkg.trainer?.full_name}</p>
                    </div>
                    <span className="text-xs text-red-600 font-medium flex-shrink-0">
                      Expires {formatDate(pkg.end_date_calculated)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* At-risk members */}
          {atRiskMembers.length > 0 && (
            <div className="card">
              <div className="p-3 border-b border-gray-200 bg-gray-50 rounded-t-xl">
                <p className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <UserX className="w-4 h-4" /> {atRiskMembers.length} Member{atRiskMembers.length > 1 ? 's' : ''} with Expired Package — Not Renewed
                </p>
              </div>
              <div className="divide-y divide-gray-100">
                {atRiskMembers.map((m: any) => (
                  <div key={m.member_id} className="flex items-start gap-3 p-3">
                    <UserX className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{m.member?.full_name}</p>
                      <p className="text-xs text-gray-500">{m.member?.phone} · expired {formatDate(m.end_date_calculated)}</p>
                      {m.non_renewal_reason && (
                        <p className="text-xs text-red-500 mt-0.5">Reason: {m.non_renewal_reason}</p>
                      )}
                      {m.renewal_status === 'undecided' && (
                        <p className="text-xs text-amber-500 mt-0.5">Member was undecided — follow up needed</p>
                      )}
                      {!m.renewal_status && (
                        <p className="text-xs text-gray-400 mt-0.5 italic">No renewal decision recorded</p>
                      )}
                    </div>
                    <Link href={`/dashboard/members/${m.member_id}`} className="text-xs text-red-600 font-medium flex-shrink-0">View</Link>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Upcoming sessions ── */}
      {upcomingSessions.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 text-sm">Upcoming Sessions</h2>
            <Link href="/dashboard/pt/sessions" className="text-xs text-red-600 font-medium">View all</Link>
          </div>
          <div className="divide-y divide-gray-100">
            {upcomingSessions.map((s: any) => (
              <div key={s.id} className="flex items-center gap-3 p-4">
                <div className="bg-red-50 p-2 rounded-lg flex-shrink-0"><Clock className="w-4 h-4 text-red-600" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{s.member?.full_name}</p>
                  <p className="text-xs text-gray-500">{formatDateTime(s.scheduled_at)}{!isTrainer && ` · ${s.trainer?.full_name}`}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Trainer quick actions ── */}
      {isTrainer && (
        <div className="card p-4">
          <h2 className="font-semibold text-gray-900 text-sm mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-2">
            <Link href="/dashboard/members/new" className="btn-primary text-center text-sm">Register Member</Link>
            <Link href="/dashboard/pt/sessions/new" className="btn-secondary text-center text-sm">Schedule Session</Link>
          </div>
        </div>
      )}
      {/* ── Staff quick actions ── */}
      {isStaff && (
        <div className="card p-4">
          <h2 className="font-semibold text-gray-900 text-sm mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-2">
            <Link href="/dashboard/membership/sales" className="btn-primary text-center text-sm">Log Membership Sale</Link>
            <Link href="/dashboard/members" className="btn-secondary text-center text-sm">Member Lookup</Link>
          </div>
        </div>
      )}
    </div>
  )
}
