'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { User } from '@/types'
import { formatSGD, formatDateTime } from '@/lib/utils'
import { Users, Calendar, DollarSign, TrendingUp, Clock, CheckCircle } from 'lucide-react'
import Link from 'next/link'

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null)
  const [stats, setStats] = useState({
    totalClients: 0,
    activePackages: 0,
    sessionsThisMonth: 0,
    commissionThisMonth: 0,
    upcomingSessions: [] as any[],
  })
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return

      const { data: userData } = await supabase
        .from('users').select('*').eq('id', authUser.id).single()
      if (!userData) return
      setUser(userData)

      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString()

      // Build queries based on role
      const isTrainer = userData.role === 'trainer'
      const trainerFilter = isTrainer ? { trainer_id: authUser.id } : {}

      // Clients count
      let clientQuery = supabase.from('clients').select('id', { count: 'exact', head: true }).eq('status', 'active')
      if (isTrainer) clientQuery = clientQuery.eq('trainer_id', authUser.id)
      const { count: clientCount } = await clientQuery

      // Active packages
      let pkgQuery = supabase.from('packages').select('id', { count: 'exact', head: true }).eq('status', 'active')
      if (isTrainer) pkgQuery = pkgQuery.eq('trainer_id', authUser.id)
      const { count: pkgCount } = await pkgQuery

      // Sessions this month
      let sessQuery = supabase.from('sessions').select('id, session_commission_sgd', { count: 'exact' })
        .eq('status', 'completed')
        .gte('marked_complete_at', monthStart)
        .lte('marked_complete_at', monthEnd)
      if (isTrainer) sessQuery = sessQuery.eq('trainer_id', authUser.id)
      const { data: sessData, count: sessCount } = await sessQuery

      const commission = sessData?.reduce((sum, s) => sum + (s.session_commission_sgd || 0), 0) || 0

      // Upcoming sessions (next 5)
      let upcomingQuery = supabase.from('sessions')
        .select('*, clients(full_name, phone), gyms(name)')
        .eq('status', 'scheduled')
        .gte('scheduled_at', now.toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(5)
      if (isTrainer) upcomingQuery = upcomingQuery.eq('trainer_id', authUser.id)
      const { data: upcoming } = await upcomingQuery

      setStats({
        totalClients: clientCount || 0,
        activePackages: pkgCount || 0,
        sessionsThisMonth: sessCount || 0,
        commissionThisMonth: commission,
        upcomingSessions: upcoming || [],
      })
    }
    load()
  }, [])

  if (!user) return <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600" /></div>

  const isTrainer = user.role === 'trainer'
  const now = new Date()
  const monthName = now.toLocaleString('default', { month: 'long' })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Welcome back, {user.full_name.split(' ')[0]} 👋</h1>
        <p className="text-sm text-gray-500 mt-0.5">{monthName} {now.getFullYear()} overview</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">Active Clients</p>
            <Users className="w-4 h-4 text-green-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.totalClients}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">Active Packages</p>
            <TrendingUp className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.activePackages}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">Sessions {isTrainer ? 'Done' : 'Completed'}</p>
            <CheckCircle className="w-4 h-4 text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.sessionsThisMonth}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">Commission {isTrainer ? 'Earned' : 'Payable'}</p>
            <DollarSign className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-xl font-bold text-gray-900">{formatSGD(stats.commissionThisMonth)}</p>
        </div>
      </div>

      {/* Upcoming Sessions */}
      <div className="card">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm">Upcoming Sessions</h2>
          <Link href="/dashboard/sessions" className="text-xs text-green-600 font-medium">View all</Link>
        </div>
        {stats.upcomingSessions.length === 0 ? (
          <div className="p-6 text-center">
            <Calendar className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No upcoming sessions scheduled</p>
            {isTrainer && (
              <Link href="/dashboard/sessions" className="btn-primary inline-block mt-3">
                Schedule a session
              </Link>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {stats.upcomingSessions.map((session: any) => (
              <div key={session.id} className="flex items-center gap-3 p-4">
                <div className="bg-green-50 p-2 rounded-lg">
                  <Clock className="w-4 h-4 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {session.clients?.full_name}
                  </p>
                  <p className="text-xs text-gray-500">{formatDateTime(session.scheduled_at)}</p>
                </div>
                <span className="text-xs text-gray-400">{session.gyms?.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      {isTrainer && (
        <div className="card p-4">
          <h2 className="font-semibold text-gray-900 text-sm mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-2">
            <Link href="/dashboard/clients/new" className="btn-primary text-center">
              + Add Client
            </Link>
            <Link href="/dashboard/sessions/new" className="btn-secondary text-center">
              + Schedule Session
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
