'use client'

// ============================================================
// src/app/dashboard/_components/MemberBirthdayCard.tsx
//
// PURPOSE:
//   Shows a banner for members with birthdays today.
//   Dismissed per-user per-day via localStorage.
//   Not shown to biz-ops (no gym assignment).
//
// USED BY: ManagerDashboard
// ============================================================

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { X } from 'lucide-react'

// Dismissed per-day via localStorage — won't reappear until tomorrow.
// Not shown to Biz Ops (they have no gym assignment).
interface MemberBirthdayCardProps {
  gymId: string | null         // manager's gym
  trainerGymIds: string[]      // trainer's gyms
  role: string
  userId: string
}


export default function MemberBirthdayCard({ gymId, trainerGymIds, role, userId }: MemberBirthdayCardProps) {
  const [members, setMembers] = useState<{ id: string; full_name: string; age: number }[]>([])
  const [dismissed, setDismissed] = useState(false)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  // localStorage key: unique per user per day
  const storageKey = `member_birthday_dismissed_${userId}_${new Date().toISOString().split('T')[0]}`

  useEffect(() => {
    // Check if already dismissed today
    try {
      if (localStorage.getItem(storageKey) === 'true') {
        setDismissed(true)
        setLoading(false)
        return
      }
    } catch {}

    const load = async () => {
      const today = new Date()
      const todayMonth = today.getMonth() + 1
      const todayDay = today.getDate()
      const todayYear = today.getFullYear()

      // Build gym filter — manager uses gymId, trainer uses trainerGymIds
      const gymIds: string[] = []
      if (gymId) gymIds.push(gymId)
      trainerGymIds.forEach(id => { if (!gymIds.includes(id)) gymIds.push(id) })
      if (gymIds.length === 0) { setLoading(false); return }

      // Query members at relevant gyms with a birthday today
      // Use month/day extracted from date_of_birth via filter
      const { data } = await supabase
        .from('members')
        .select('id, full_name, date_of_birth, gym_id')
        .in('gym_id', gymIds)
        .eq('status', 'active')
        .not('date_of_birth', 'is', null)

      const todayBirthdays = (data || [])
        .filter((m: any) => {
          if (!m.date_of_birth) return false
          const dob = new Date(m.date_of_birth)
          return dob.getMonth() + 1 === todayMonth && dob.getDate() === todayDay
        })
        .map((m: any) => {
          const dob = new Date(m.date_of_birth)
          const age = todayYear - dob.getFullYear()
          return { id: m.id, full_name: m.full_name, age }
        })
        .sort((a: any, b: any) => a.full_name.localeCompare(b.full_name))

      setMembers(todayBirthdays)
      setLoading(false)
    }
    load()
  }, [gymId, userId])

  const handleDismiss = () => {
    try { localStorage.setItem(storageKey, 'true') } catch {}
    setDismissed(true)
  }

  if (loading || dismissed || members.length === 0) return null

  return (
    <div className="bg-pink-50 border border-pink-200 rounded-xl p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <span className="text-xl flex-shrink-0" aria-label="birthday cake">🎂</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-pink-800">
              {members.length === 1
                ? `${members[0].full_name} turns ${members[0].age} today!`
                : `${members.length} members have birthdays today`}
            </p>
            {members.length > 1 && (
              <p className="text-xs text-pink-700 mt-1 leading-relaxed">
                {members.map(m => `${m.full_name} (${m.age})`).join(' · ')}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 text-pink-400 hover:text-pink-600 transition-colors p-0.5"
          aria-label="Dismiss birthday notification for today"
          title="Dismiss — won't show again today"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
