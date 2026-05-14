'use client'

// ============================================================
// src/app/dashboard/_components/PartTimerDashboardWrapper.tsx
//
// PURPOSE:
//   Wrapper for part-time staff dashboard.
//   Detects whether the part-timer has an active rostered shift
//   right now (using SGT). If yes, shows StaffDashboard scoped
//   to the shift's gym. If no active shift, shows a placeholder.
// ============================================================

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { todaySGT, currentTimeSGT, getDisplayName, getGreeting } from '@/lib/utils'
import StaffDashboard from './StaffDashboard'
import { PageSpinner } from '@/components/PageSpinner'
import { CalendarDays } from 'lucide-react'

interface Props { user: any }

export default function PartTimerDashboardWrapper({ user }: Props) {
  const supabase = createClient()
  const [loading, setLoading]     = useState(true)
  const [activeGymId, setActiveGymId] = useState<string | null>(null)
  const [activeGymName, setActiveGymName] = useState<string>('')

  useEffect(() => {
    const detect = async () => {
      const today = todaySGT()
      const now   = currentTimeSGT()
      const { data: activeShift } = await supabase.from('duty_roster')
        .select('gym_id, gyms:gym_id(name)')
        .eq('user_id', user.id)
        .eq('shift_date', today)
        .lte('shift_start', now)
        .gte('shift_end', now)
        .limit(1)
        .maybeSingle()

      if (activeShift?.gym_id) {
        setActiveGymId(activeShift.gym_id)
        setActiveGymName((activeShift.gyms as any)?.name || '')
      }
      setLoading(false)
    }
    detect()
  }, [user.id])

  if (loading) return <PageSpinner />

  // Active shift found — show full staff dashboard scoped to shift gym
  if (activeGymId) {
    const userWithGym = { ...user, manager_gym_id: activeGymId }
    return <StaffDashboard user={userWithGym} />
  }

  // No active shift — show placeholder
  const todayStr = new Date().toLocaleDateString('en-SG', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{getGreeting(getDisplayName(user))} 👋</h1>
        <p className="text-sm text-gray-500">{todayStr}</p>
      </div>
      <div className="card p-8 text-center space-y-4">
        <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
          <CalendarDays className="w-7 h-7 text-gray-400" />
        </div>
        <div>
          <p className="font-semibold text-gray-900">No Active Shift</p>
          <p className="text-sm text-gray-500 mt-1">
            You don't have an active rostered shift right now.
            Dashboard information is available during your scheduled shift hours.
          </p>
        </div>
        <p className="text-xs text-gray-400">
          Check <strong>My Roster</strong> in the sidebar to see your upcoming shifts.
        </p>
      </div>
    </div>
  )
}
