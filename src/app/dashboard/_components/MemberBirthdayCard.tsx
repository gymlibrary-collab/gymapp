'use client'

// ============================================================
// src/app/dashboard/_components/MemberBirthdayCard.tsx
//
// PURPOSE:
//   Shows a slide-out panel of members with birthdays today.
//   Displayed on manager, trainer and staff dashboards.
//
//   All roles see gym-wide rows (trainer_id IS NULL) —
//   all members at their gym with birthday today.
//
//   For trainer's PT Sessions page, a separate banner shows
//   only their active package members (see pt/sessions/page.tsx).
//
// DATA SOURCE:
//   Reads from member_birthday_reminders table — pre-computed
//   daily by /api/cron/check-member-birthdays (0001 SGT).
//
// USED BY: ManagerDashboard, TrainerDashboard, StaffDashboard
// ============================================================

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Gift, ChevronRight, X } from 'lucide-react'

interface MemberBirthdayCardProps {
  gymId?: string | null
}

export default function MemberBirthdayCard({ gymId }: MemberBirthdayCardProps) {
  const [members, setMembers] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    if (!gymId) return
    const load = async () => {
      const { data } = await supabase
        .from('member_birthday_reminders')
        .select('*')
        .eq('gym_id', gymId)
        .is('trainer_id', null)
        .order('full_name', { ascending: true })
      setMembers(data || [])
    }
    load()
  }, [gymId])

  if (members.length === 0) return null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-left hover:bg-yellow-100 transition-colors"
      >
        <Gift className="w-5 h-5 text-yellow-500 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-yellow-800">
            {members.length} member{members.length > 1 ? 's' : ''} celebrating {members.length > 1 ? 'birthdays' : 'a birthday'} today 🎂
          </p>
          <p className="text-xs text-yellow-600 mt-0.5">
            {members.slice(0, 2).map((m: any) => m.full_name.split(' ')[0]).join(', ')}
            {members.length > 2 ? ` +${members.length - 2} more` : ''}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-yellow-400 flex-shrink-0" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setOpen(false)}>
          <div className="fixed inset-0 bg-black/20" />
          <div
            className="relative w-full max-w-sm bg-white h-full shadow-xl flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Gift className="w-5 h-5 text-yellow-500" />
                <h2 className="font-semibold text-gray-900 text-sm">Member Birthdays Today</h2>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {members.map((m: any) => {
                const dob = new Date(m.date_of_birth)
                return (
                  <div key={m.id} className="p-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-medium text-yellow-700">
                        {m.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{m.full_name}</p>
                      <p className="text-xs text-gray-500">
                        Turns {m.age} · {dob.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
                      </p>
                    </div>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 flex-shrink-0">
                      Today! 🎂
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
