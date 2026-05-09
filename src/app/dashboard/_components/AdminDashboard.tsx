'use client'

// ============================================================
// src/app/dashboard/_components/AdminDashboard.tsx
//
// PURPOSE:
//   Dashboard for the 'admin' role. Shows a system-wide health
//   overview: active gyms, staff counts by role, pending biz-ops
//   leave, and quick navigation links.
//
// DATA:
//   Fetches its own data independently — does not share state with
//   the parent dashboard/page.tsx. Uses the admin Supabase client
//   so RLS does not restrict the queries.
//
// PROPS:
//   user — the authenticated user object from useCurrentUser or
//          the auth+users fetch in dashboard/page.tsx. Must have:
//          { id, full_name, role }
//
// QUERIES (4 total):
//   1. gyms — all gyms with name, address, is_active
//   2. users — all non-archived staff for role counts + gym mapping
//   3. leave_applications — pending leave count for biz-ops staff
//
// ROUTING:
//   Rendered by dashboard/page.tsx when user.role === 'admin'.
//   See dashboard/page.tsx for the routing logic.
// ============================================================

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Building2, Briefcase, UserCheck, Dumbbell, Calendar, Settings, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

// ── Helpers ───────────────────────────────────────────────────

function getGreeting(firstName: string): string {
  const hour = new Date().getHours()
  if (hour < 12) return `Good morning, ${firstName}`
  if (hour < 18) return `Good afternoon, ${firstName}`
  return `Good evening, ${firstName}`
}

// ── Types ─────────────────────────────────────────────────────

interface AdminDashboardProps {
  /** The authenticated admin user — passed from dashboard/page.tsx */
  user: {
    id: string
    full_name: string
    role: string
  }
}

// ── Component ─────────────────────────────────────────────────

export default function AdminDashboard({ user }: AdminDashboardProps) {
  const supabase = createClient()

  const [gymBreakdown, setGymBreakdown] = useState<any[]>([])
  const [roleCounts, setRoleCounts] = useState<Record<string, number>>({})
  const [pendingLeave, setPendingLeave] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      // Query 1: all gyms for the gym breakdown card
      const { data: gyms } = await supabase
        .from('gyms')
        .select('*')
        .order('name')

      // Query 2: all non-archived staff for role counts and gym mapping
      // trainer_gyms join needed to count trainers per gym
      const { data: allStaff } = await supabase
        .from('users')
        .select('id, role, manager_gym_id, trainer_gyms(gym_id)')
        .eq('is_archived', false)

      // Build role count map: { manager: 3, trainer: 8, ... }
      const rc: Record<string, number> = {}
      allStaff?.forEach((s: any) => { rc[s.role] = (rc[s.role] || 0) + 1 })
      setRoleCounts(rc)

      // Build gym breakdown: each gym with manager + trainer counts
      setGymBreakdown((gyms || []).map(g => ({
        ...g,
        managers: allStaff?.filter((s: any) =>
          s.role === 'manager' && s.manager_gym_id === g.id
        ).length || 0,
        trainers: allStaff?.filter((s: any) =>
          s.role === 'trainer' && (s.trainer_gyms as any[])?.some((tg: any) => tg.gym_id === g.id)
        ).length || 0,
      })))

      // Query 3: pending leave for biz-ops staff (admin approves these)
      const bizOpsIds = allStaff?.filter((s: any) => s.role === 'business_ops').map((s: any) => s.id) || []
      if (bizOpsIds.length > 0) {
        const { count: leavePending } = await supabase
          .from('leave_applications')
          .select('id', { count: 'exact', head: true })
          .in('user_id', bizOpsIds)
          .eq('status', 'pending')
        setPendingLeave(leavePending || 0)
      }

      setLoading(false)
    }
    load()
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600" />
    </div>
  )

  const quickLinks = [
    { href: '/dashboard/admin/staff', label: 'Business Ops Staff', icon: Briefcase },
    { href: '/dashboard/hr/leave', label: 'Leave Approvals', icon: Calendar },
    { href: '/dashboard/admin/settings', label: 'App Settings', icon: Settings },
  ]

  const roleCards = [
    { role: 'business_ops' as const, label: 'Business Ops', icon: Briefcase, color: 'text-purple-600' },
    { role: 'manager' as const, label: 'Managers', icon: UserCheck, color: 'text-yellow-700' },
    { role: 'trainer' as const, label: 'Trainers', icon: Dumbbell, color: 'text-green-700' },
  ]

  return (
    <div className="space-y-6">

      {/* Greeting */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">
          {getGreeting(user.full_name.split(' ')[0])} 👋
        </h1>
        <p className="text-sm text-gray-500">Admin · View only</p>
      </div>

      {/* Staff count cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="stat-card">
          <div className="flex items-center gap-1.5 mb-1">
            <Building2 className="w-4 h-4 text-red-600" />
            <p className="text-xs text-gray-500">Active Gyms</p>
          </div>
          <p className="text-2xl font-bold">{gymBreakdown.filter(g => g.is_active).length}</p>
        </div>
        {roleCards.map(({ role, label, icon: Icon, color }) => (
          <div key={role} className="stat-card">
            <div className="flex items-center gap-1.5 mb-1">
              <Icon className={cn('w-4 h-4', color)} />
              <p className="text-xs text-gray-500">{label}</p>
            </div>
            <p className="text-2xl font-bold">{roleCounts[role] || 0}</p>
          </div>
        ))}
      </div>

      {/* Pending leave alert */}
      <div className="card">
        {pendingLeave > 0 && (
          <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4">
            <Calendar className="w-5 h-5 text-blue-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-800">
                {pendingLeave} Business Ops leave application{pendingLeave > 1 ? 's' : ''} awaiting your approval
              </p>
            </div>
            <Link href="/dashboard/hr/leave" className="btn-primary text-xs py-1.5 flex-shrink-0">
              Review
            </Link>
          </div>
        )}

        {/* Gym breakdown */}
        <div className="p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm">Gym Clubs · Staff Breakdown</h2>
        </div>
        {gymBreakdown.map(gym => (
          <div key={gym.id} className={cn('p-4 border-b border-gray-100 last:border-0', !gym.is_active && 'opacity-50')}>
            <div className="flex items-center gap-3">
              <Building2 className="w-4 h-4 text-red-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">
                  {gym.name}{!gym.is_active && ' (Inactive)'}
                </p>
                {gym.address && <p className="text-xs text-gray-400">{gym.address}</p>}
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded-full font-medium">
                  {gym.managers} Mgr
                </span>
                <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium">
                  {gym.trainers} Trainers
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="card p-4">
        <h2 className="font-semibold text-gray-900 text-sm mb-3">Quick Actions</h2>
        {quickLinks.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Icon className="w-4 h-4 text-red-600 flex-shrink-0" />
            <span className="text-sm text-gray-700 flex-1">{label}</span>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </Link>
        ))}
      </div>

    </div>
  )
}
