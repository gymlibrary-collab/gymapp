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
// DATA SOURCE:
//   Reads from staff_birthday_reminders table — pre-computed
//   daily by /api/cron/check-staff-birthdays (0050 SGT).
//   Replaces the previous live query + client-side date filter.
//
// USED BY: ManagerDashboard, BizOpsDashboard
// ============================================================

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Gift, ChevronRight, X } from 'lucide-react'

export default function StaffBirthdayPanel({ gymId, isBizOps }: { gymId?: string | null, isBizOps?: boolean }) {
  const [birthdays, setBirthdays] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      // Read from pre-computed table — no date calculation needed
      let query = supabase
        .from('staff_birthday_reminders')
        .select('*')
        .order('days_until_birthday', { ascending: true })

      // Manager: filter to their gym only
      if (!isBizOps && gymId) {
        query = query.eq('gym_id', gymId)
      }

      const { data } = await query
      setBirthdays(data || [])
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
            {birthdays.slice(0, 2).map((b: any) => b.nickname || b.full_name.split(' ')[0]).join(', ')}
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
                const age = nowSGT().getUTCFullYear() - dob.getUTCFullYear()
                return (
                  <div key={b.id} className="p-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-pink-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-medium text-pink-700">
                        {b.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{b.full_name}{b.nickname && b.nickname !== b.full_name.split(' ')[0] ? ` (${b.nickname})` : ''}</p>
                      <p className="text-xs text-gray-500">
                        {isBizOps && <span className="mr-1">{b.gym_name} ·</span>}
                        Turns {age} · {dob.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
                      </p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                      b.days_until_birthday === 0 ? 'bg-pink-100 text-pink-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {b.days_until_birthday === 0 ? 'Today! 🎂' : `In ${b.days_until_birthday}d`}
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
