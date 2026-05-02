'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useViewMode } from '@/lib/view-mode-context'
import { formatSGD, formatDateTime } from '@/lib/utils'
import {
  Users, Building2, Settings, ChevronRight,
  CheckCircle, Clock, TrendingUp, DollarSign,
  UserCheck, Dumbbell, Shield, Briefcase, MapPin, Maximize2
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface GymStats {
  id: string
  name: string
  address?: string
  size_sqft?: number
  date_opened?: string
  is_active: boolean
  managers: number
  trainers: number
  bizOps: number
  totalStaff: number
}

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null)
  const [gymStats, setGymStats] = useState<GymStats[]>([])
  const [roleCounts, setRoleCounts] = useState<Record<string, number>>({})
  const [totalGyms, setTotalGyms] = useState(0)
  const [stats, setStats] = useState<any>({})
  const [upcomingSessions, setUpcomingSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const { isActingAsTrainer } = useViewMode()

  useEffect(() => {
    const load = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return
      const { data: userData } = await supabase.from('users').select('*').eq('id', authUser.id).single()
      if (!userData) return
      setUser(userData)

      if (userData.role === 'admin') {
        // Load gyms
        const { data: gyms } = await supabase.from('gyms').select('*').order('name')

        // Load all active staff with their gym assignments
        const { data: allStaff } = await supabase
          .from('users')
          .select('id, role, manager_gym_id, trainer_gyms(gym_id)')
          .eq('is_archived', false)

        // Count by role globally
        const rc: Record<string, number> = {}
        allStaff?.forEach((s: any) => { rc[s.role] = (rc[s.role] || 0) + 1 })
        setRoleCounts(rc)

        // Per-gym breakdown
        const rows: GymStats[] = (gyms || []).map(g => {
          const managers = allStaff?.filter((s: any) =>
            s.role === 'manager' && s.manager_gym_id === g.id).length || 0
          const trainers = allStaff?.filter((s: any) =>
            s.role === 'trainer' && (s.trainer_gyms as any[])?.some((tg: any) => tg.gym_id === g.id)).length || 0
          const bizOps = rc['business_ops'] || 0 // biz ops see all gyms
          return {
            id: g.id, name: g.name, address: g.address,
            size_sqft: g.size_sqft, date_opened: g.date_opened,
            is_active: g.is_active,
            managers, trainers, bizOps: 0, // biz ops not per-gym
            totalStaff: managers + trainers,
          }
        })

        setGymStats(rows)
        setTotalGyms(rows.filter(g => g.is_active).length)
        setLoading(false)
        return
      }

      // Non-admin: operational dashboard
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString()
      const gymId = userData.manager_gym_id
      const actingAsTrainer = userData.role === 'trainer'

      let memberQ = supabase.from('clients').select('id', { count: 'exact', head: true }).eq('status', 'active')
      if (actingAsTrainer) memberQ = memberQ.eq('trainer_id', authUser.id)
      else if (gymId) memberQ = memberQ.eq('gym_id', gymId)
      const { count: members } = await memberQ

      let pkgQ = supabase.from('packages').select('id', { count: 'exact', head: true }).eq('status', 'active')
      if (actingAsTrainer) pkgQ = pkgQ.eq('trainer_id', authUser.id)
      else if (gymId) pkgQ = pkgQ.eq('gym_id', gymId)
      const { count: pkgs } = await pkgQ

      let sessQ = supabase.from('sessions').select('session_commission_sgd')
        .eq('status', 'completed').gte('marked_complete_at', monthStart).lte('marked_complete_at', monthEnd)
      if (actingAsTrainer) sessQ = sessQ.eq('trainer_id', authUser.id)
      else if (gymId) sessQ = sessQ.eq('gym_id', gymId)
      const { data: sessData } = await sessQ
      const commission = sessData?.reduce((s: number, r: any) => s + (r.session_commission_sgd || 0), 0) || 0

      let upQ = supabase.from('sessions').select('*, clients(full_name), gyms(name)')
        .eq('status', 'scheduled').gte('scheduled_at', now.toISOString())
        .order('scheduled_at', { ascending: true }).limit(5)
      if (actingAsTrainer) upQ = upQ.eq('trainer_id', authUser.id)
      else if (gymId) upQ = upQ.eq('gym_id', gymId)
      const { data: upcoming } = await upQ

      setStats({ members: members || 0, packages: pkgs || 0, sessions: sessData?.length || 0, commission })
      setUpcomingSessions(upcoming || [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading || !user) return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" />
    </div>
  )

  const now = new Date()
  const monthName = now.toLocaleString('default', { month: 'long' })

  const roleColors: Record<string, string> = {
    admin: 'text-red-600 bg-red-50',
    business_ops: 'text-purple-600 bg-purple-50',
    manager: 'text-yellow-700 bg-yellow-50',
    trainer: 'text-green-700 bg-green-50',
  }
  const roleLabels: Record<string, string> = {
    admin: 'Admins', business_ops: 'Business Ops', manager: 'Managers', trainer: 'Trainers',
  }
  const roleIcons: Record<string, any> = {
    admin: Shield, business_ops: Briefcase, manager: UserCheck, trainer: Dumbbell,
  }

  // ── Admin view ──────────────────────────────────────────────
  if (user.role === 'admin') return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-sm text-gray-500">View-only overview — Gym Library</p>
      </div>

      {/* Summary tiles — fixed order, always shown even if count is 0 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="stat-card">
          <div className="flex items-center gap-1.5 mb-1"><Building2 className="w-4 h-4 text-red-600" /><p className="text-xs text-gray-500">Active Gyms</p></div>
          <p className="text-2xl font-bold text-gray-900">{totalGyms}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-1.5 mb-1"><Briefcase className="w-4 h-4 text-purple-600" /><p className="text-xs text-gray-500">Business Ops</p></div>
          <p className="text-2xl font-bold text-gray-900">{roleCounts['business_ops'] || 0}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-1.5 mb-1"><UserCheck className="w-4 h-4 text-yellow-700" /><p className="text-xs text-gray-500">Managers</p></div>
          <p className="text-2xl font-bold text-gray-900">{roleCounts['manager'] || 0}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-1.5 mb-1"><Dumbbell className="w-4 h-4 text-green-700" /><p className="text-xs text-gray-500">Trainers</p></div>
          <p className="text-2xl font-bold text-gray-900">{roleCounts['trainer'] || 0}</p>
        </div>
      </div>

      {/* Per-gym breakdown */}
      <div className="card">
        <div className="p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm">Gym Clubs & Staff Breakdown</h2>
          <p className="text-xs text-gray-400 mt-0.5">View only — contact Business Ops to make changes</p>
        </div>
        {gymStats.length === 0 ? (
          <p className="p-4 text-sm text-gray-400 text-center">No gyms configured yet</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {gymStats.map(gym => (
              <div key={gym.id} className={cn('p-4', !gym.is_active && 'opacity-50')}>
                <div className="flex items-start gap-3">
                  <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
                    gym.is_active ? 'bg-red-100' : 'bg-gray-100')}>
                    <Building2 className={cn('w-4 h-4', gym.is_active ? 'text-red-600' : 'text-gray-400')} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900 text-sm">{gym.name}</p>
                      {!gym.is_active && <span className="badge-inactive">Inactive</span>}
                    </div>
                    {gym.address && (
                      <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 flex-shrink-0" /> {gym.address}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {gym.size_sqft && (
                        <p className="text-xs text-gray-400 flex items-center gap-1">
                          <Maximize2 className="w-3 h-3" /> {gym.size_sqft.toLocaleString()} sq ft
                        </p>
                      )}
                    </div>
                    {/* Staff counts */}
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <div className="flex items-center gap-1.5 bg-yellow-50 border border-yellow-100 rounded-lg px-2 py-1">
                        <UserCheck className="w-3 h-3 text-yellow-700" />
                        <span className="text-xs font-medium text-yellow-800">
                          {gym.managers} Manager{gym.managers !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 bg-green-50 border border-green-100 rounded-lg px-2 py-1">
                        <Dumbbell className="w-3 h-3 text-green-700" />
                        <span className="text-xs font-medium text-green-800">
                          {gym.trainers} Trainer{gym.trainers !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1">
                        <Users className="w-3 h-3 text-gray-600" />
                        <span className="text-xs font-medium text-gray-700">
                          {gym.totalStaff} Total
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick actions — admin only has settings and biz ops staff */}
      <div className="card p-4">
        <h2 className="font-semibold text-gray-900 text-sm mb-3">Quick Actions</h2>
        <div className="space-y-2">
          {[
            { href: '/dashboard/admin-staff', label: 'Manage Business Ops Accounts', icon: Briefcase },
            { href: '/dashboard/settings', label: 'App Settings', icon: Settings },
          ].map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
              <Icon className="w-4 h-4 text-red-600 flex-shrink-0" />
              <span className="text-sm text-gray-700 flex-1">{label}</span>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  )

  // ── Non-admin operational dashboard ─────────────────────────
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">
          Welcome back, {user.full_name.split(' ')[0]} 👋
        </h1>
        <p className="text-sm text-gray-500">{monthName} {now.getFullYear()} overview</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="stat-card">
          <div className="flex items-center justify-between"><p className="text-xs text-gray-500">Active Members</p><Users className="w-4 h-4 text-red-600" /></div>
          <p className="text-2xl font-bold text-gray-900">{stats.members}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between"><p className="text-xs text-gray-500">Active Packages</p><TrendingUp className="w-4 h-4 text-red-600" /></div>
          <p className="text-2xl font-bold text-gray-900">{stats.packages}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between"><p className="text-xs text-gray-500">Sessions Done</p><CheckCircle className="w-4 h-4 text-green-600" /></div>
          <p className="text-2xl font-bold text-gray-900">{stats.sessions}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between"><p className="text-xs text-gray-500">Commission</p><DollarSign className="w-4 h-4 text-red-600" /></div>
          <p className="text-xl font-bold text-gray-900">{formatSGD(stats.commission)}</p>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm">Upcoming Sessions</h2>
          <Link href="/dashboard/sessions" className="text-xs text-red-600 font-medium">View all</Link>
        </div>
        {upcomingSessions.length === 0 ? (
          <div className="p-6 text-center">
            <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No upcoming sessions</p>
            {isActingAsTrainer && (
              <Link href="/dashboard/sessions/new" className="btn-primary inline-block mt-3">
                Schedule a session
              </Link>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {upcomingSessions.map((s: any) => (
              <div key={s.id} className="flex items-center gap-3 p-4">
                <div className="bg-red-50 p-2 rounded-lg flex-shrink-0">
                  <Clock className="w-4 h-4 text-red-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{s.clients?.full_name}</p>
                  <p className="text-xs text-gray-500">{formatDateTime(s.scheduled_at)}</p>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">{s.gyms?.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick actions — trainer view only */}
      {isActingAsTrainer && (
        <div className="card p-4">
          <h2 className="font-semibold text-gray-900 text-sm mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-2">
            <Link href="/dashboard/clients/new" className="btn-primary text-center">+ Add Member</Link>
            <Link href="/dashboard/sessions/new" className="btn-secondary text-center">+ Schedule Session</Link>
          </div>
        </div>
      )}
    </div>
  )
}
