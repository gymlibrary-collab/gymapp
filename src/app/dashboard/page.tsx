'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { formatSGD, formatDateTime } from '@/lib/utils'
import {
  Users, Package, Building2, Settings, ChevronRight,
  CheckCircle, Clock, TrendingUp, DollarSign, Briefcase,
  UserCheck, Dumbbell, Shield
} from 'lucide-react'
import Link from 'next/link'

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null)
  const [stats, setStats] = useState<any>({})
  const [gymBreakdown, setGymBreakdown] = useState<any[]>([])
  const [upcomingSessions, setUpcomingSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return
      const { data: userData } = await supabase.from('users').select('*').eq('id', authUser.id).single()
      if (!userData) return
      setUser(userData)

      if (userData.role === 'admin') {
        // Admin stats: gyms, staff counts by role
        const { data: gyms } = await supabase.from('gyms').select('id, name, is_active').order('name')
        const { data: allStaff } = await supabase.from('users').select('id, role, manager_gym_id, trainer_gyms(gym_id)').eq('is_archived', false)

        const roleCount: Record<string, number> = {}
        const roleLabelMap: Record<string, string> = { admin: 'Admin', business_ops: 'Business Ops', manager: 'Manager', trainer: 'Trainer' }
        allStaff?.forEach(s => { roleCount[s.role] = (roleCount[s.role] || 0) + 1 })

        // Per-gym breakdown
        const gymRows = (gyms || []).map(g => {
          const managers = allStaff?.filter(s => s.role === 'manager' && s.manager_gym_id === g.id).length || 0
          const trainers = allStaff?.filter(s => s.role === 'trainer' && (s.trainer_gyms as any[])?.some((tg: any) => tg.gym_id === g.id)).length || 0
          return { ...g, managers, trainers }
        })

        const { count: pkgCount } = await supabase.from('package_templates').select('id', { count: 'exact', head: true }).eq('is_archived', false)

        setStats({ gyms: gyms?.filter(g => g.is_active).length || 0, totalStaff: allStaff?.length || 0, roleCount, pkgCount: pkgCount || 0 })
        setGymBreakdown(gymRows)
        setLoading(false)
        return
      }

      // Non-admin stats
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString()
      const isTrainer = userData.role === 'trainer' || (userData.role === 'manager' && userData.is_also_trainer)
      const gymId = userData.manager_gym_id

      let memberQ = supabase.from('clients').select('id', { count: 'exact', head: true }).eq('status', 'active')
      if (isTrainer) memberQ = memberQ.eq('trainer_id', authUser.id)
      else if (gymId) memberQ = memberQ.eq('gym_id', gymId)
      const { count: members } = await memberQ

      let pkgQ = supabase.from('packages').select('id', { count: 'exact', head: true }).eq('status', 'active')
      if (isTrainer) pkgQ = pkgQ.eq('trainer_id', authUser.id)
      else if (gymId) pkgQ = pkgQ.eq('gym_id', gymId)
      const { count: pkgs } = await pkgQ

      let sessQ = supabase.from('sessions').select('session_commission_sgd').eq('status', 'completed')
        .gte('marked_complete_at', monthStart).lte('marked_complete_at', monthEnd)
      if (isTrainer) sessQ = sessQ.eq('trainer_id', authUser.id)
      else if (gymId) sessQ = sessQ.eq('gym_id', gymId)
      const { data: sessData } = await sessQ
      const commission = sessData?.reduce((s, r) => s + (r.session_commission_sgd || 0), 0) || 0

      let upcomingQ = supabase.from('sessions')
        .select('*, clients(full_name), gyms(name)').eq('status', 'scheduled')
        .gte('scheduled_at', now.toISOString()).order('scheduled_at', { ascending: true }).limit(5)
      if (isTrainer) upcomingQ = upcomingQ.eq('trainer_id', authUser.id)
      else if (gymId) upcomingQ = upcomingQ.eq('gym_id', gymId)
      const { data: upcoming } = await upcomingQ

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
  const isAdmin = user.role === 'admin'
  const isTrainer = user.role === 'trainer' || (user.role === 'manager' && user.is_also_trainer)

  const roleIcons: Record<string, any> = {
    admin: Shield, business_ops: Briefcase, manager: UserCheck, trainer: Dumbbell,
  }
  const roleColors: Record<string, string> = {
    admin: 'text-red-600 bg-red-100', business_ops: 'text-purple-600 bg-purple-100',
    manager: 'text-yellow-700 bg-yellow-100', trainer: 'text-green-700 bg-green-100',
  }
  const roleLabels: Record<string, string> = {
    admin: 'Admin', business_ops: 'Business Ops', manager: 'Manager', trainer: 'Trainer',
  }

  if (isAdmin) return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-sm text-gray-500">Gym Library overview</p>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="stat-card">
          <div className="flex items-center gap-1.5 mb-1">
            <Building2 className="w-4 h-4 text-red-600" />
            <p className="text-xs text-gray-500">Active Gyms</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.gyms}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-1.5 mb-1">
            <Users className="w-4 h-4 text-red-600" />
            <p className="text-xs text-gray-500">Total Staff</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.totalStaff}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-1.5 mb-1">
            <Package className="w-4 h-4 text-red-600" />
            <p className="text-xs text-gray-500">Active Packages</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.pkgCount}</p>
        </div>
      </div>

      {/* Staff by role */}
      <div className="card p-4">
        <h2 className="font-semibold text-gray-900 text-sm mb-3">Staff Breakdown by Role</h2>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(stats.roleCount || {}).map(([role, count]) => {
            const Icon = roleIcons[role] || Users
            return (
              <div key={role} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', roleColors[role] || 'text-gray-600 bg-gray-100')}>
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900">{count as number}</p>
                  <p className="text-xs text-gray-500">{roleLabels[role] || role}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Per-gym breakdown */}
      <div className="card">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm">Staff per Gym Club</h2>
          <Link href="/dashboard/admin-gyms" className="text-xs text-red-600 font-medium">Manage Gyms</Link>
        </div>
        {gymBreakdown.length === 0 ? (
          <p className="p-4 text-sm text-gray-400 text-center">No gyms configured yet</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {gymBreakdown.map(gym => (
              <div key={gym.id} className="flex items-center gap-3 p-4">
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                  gym.is_active ? 'bg-red-100' : 'bg-gray-100')}>
                  <Building2 className={cn('w-4 h-4', gym.is_active ? 'text-red-600' : 'text-gray-400')} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm font-medium', gym.is_active ? 'text-gray-900' : 'text-gray-400')}>
                    {gym.name}{!gym.is_active && ' (Inactive)'}
                  </p>
                  <p className="text-xs text-gray-400">
                    {gym.managers} manager{gym.managers !== 1 ? 's' : ''} · {gym.trainers} trainer{gym.trainers !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="card p-4">
        <h2 className="font-semibold text-gray-900 text-sm mb-3">Quick Actions</h2>
        <div className="space-y-2">
          {[
            { href: '/dashboard/admin-gyms', label: 'Manage Gym Clubs', icon: Building2 },
            { href: '/dashboard/packages', label: 'Manage PT Packages', icon: Package },
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

  // Non-admin dashboard
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
            {isTrainer && (
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

      {isTrainer && (
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

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}
