'use client'

// ============================================================
// src/app/dashboard/_components/StaffBirthdayPanel.tsx
//
// PURPOSE:
//   Shows a slide-out panel of staff/trainer birthdays in the
//   next 7 days. Displays on manager and biz-ops dashboards.
//
//   Manager view (isBizOps=false): only their gym's staff
//   Biz-ops view (isBizOps=true): all staff across all gyms
//
// USED BY: ManagerDashboard, BizOpsDashboard
// ============================================================

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Gift, ChevronRight, X } from 'lucide-react'

// Hidden when empty. Slide-out panel on click.
export default function StaffBirthdayPanel({ gymId, isBizOps }: { gymId?: string | null, isBizOps?: boolean }) {
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
