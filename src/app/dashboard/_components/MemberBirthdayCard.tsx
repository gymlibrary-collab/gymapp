'use client'

// ============================================================
// src/app/dashboard/_components/MemberBirthdayCard.tsx
//
// PURPOSE:
//   Stat tile showing count of members with birthdays today.
//   Clicking opens a slide-out panel from the right listing
//   all birthday members. If a member has an active PT package,
//   their trainer's name appears in <angle brackets>.
//
//   Positioned as the rightmost tile in the stats row so the
//   slide-out panel looks natural sliding from the edge.
//
// DATA SOURCE:
//   Reads from member_birthday_reminders (trainer_id IS NULL rows)
//   pre-computed by /api/cron/check-member-birthdays (0001 SGT).
//
// USED BY: ManagerDashboard, TrainerDashboard, StaffDashboard
// ============================================================

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Gift, X } from 'lucide-react'

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
      {/* Stat tile — matches stats row style */}
      <div
        className="stat-card cursor-pointer hover:border-pink-300 hover:bg-pink-50 transition-colors"
        onClick={() => setOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && setOpen(true)}
      >
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-gray-500">Birthdays Today</p>
          <Gift className="w-4 h-4 text-pink-500" />
        </div>
        <p className="text-2xl font-bold text-pink-600">{members.length}</p>
        <p className="text-xs text-pink-500 mt-1 truncate">
          {members.slice(0, 2).map((m: any) => m.full_name.split(' ')[0]).join(', ')}
          {members.length > 2 ? ` +${members.length - 2}` : ''}
        </p>
      </div>

      {/* Slide-out panel from right */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          onClick={() => setOpen(false)}
        >
          <div className="fixed inset-0 bg-black/20" />
          <div
            className="relative w-full max-w-sm bg-white h-full shadow-xl flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Gift className="w-5 h-5 text-pink-500" />
                <h2 className="font-semibold text-gray-900 text-sm">Member Birthdays Today</h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 hover:bg-gray-100 rounded-lg"
                aria-label="Close panel"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* Member list */}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {members.map((m: any) => {
                const dob = new Date(m.date_of_birth)
                return (
                  <div key={m.id} className="p-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-pink-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-medium text-pink-700">
                        {m.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {m.full_name}
                        {m.trainer_names && (
                          <span className="text-gray-400 font-normal"> &lt;{m.trainer_names}&gt;</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">
                        Turns {m.age} · {dob.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
                      </p>
                    </div>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 flex-shrink-0">
                      🎂
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Footer close button */}
            <div className="p-4 border-t border-gray-100">
              <button
                onClick={() => setOpen(false)}
                className="w-full btn-secondary text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
