'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { formatDate, formatSGD } from '@/lib/utils'
import { CalendarDays, Clock, DollarSign, CheckCircle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function MyRosterPage() {
  const { logActivity } = useActivityLog()
  const [user, setUser] = useState<any>(null)
  const [shifts, setShifts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    const load = async () => {
      logActivity('page_view', 'My Roster', 'Viewed own duty roster')
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return
      const { data: userData } = await supabase.from('users').select('*').eq('id', authUser.id).single()
      // Roster is only for part-time ops staff
      if (!userData || !(userData.role === 'staff' && userData.employment_type === 'part_time')) {
        router.replace('/dashboard'); return
      }
      setUser(userData)

      const today = new Date().toISOString().split('T')[0]
      const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

      const { data } = await supabase.from('duty_roster')
        .select('*, gym:gyms(name)')
        .eq('user_id', authUser.id)
        .gte('shift_date', today)
        .lte('shift_date', in30Days)
        .order('shift_date').order('shift_start')

      setShifts(data || [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600" /></div>

  const totalHours = shifts.reduce((s, r) => s + (r.hours_worked || 0), 0)
  const totalPay = shifts.reduce((s, r) => s + (r.gross_pay || 0), 0)

  // Group by week
  const grouped: Record<string, any[]> = {}
  shifts.forEach(shift => {
    const d = new Date(shift.shift_date)
    const mon = new Date(d); mon.setDate(d.getDate() - (d.getDay() || 7) + 1)
    const key = mon.toISOString().split('T')[0]
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(shift)
  })

  return (
    <div className="space-y-5 max-w-lg mx-auto">
      <div>
        <h1 className="text-xl font-bold text-gray-900">My Roster</h1>
        <p className="text-sm text-gray-500">Your upcoming shifts for the next 30 days</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="stat-card text-center">
          <CalendarDays className="w-5 h-5 text-red-600 mx-auto mb-1" />
          <p className="text-2xl font-bold text-gray-900">{shifts.length}</p>
          <p className="text-xs text-gray-500">Shifts</p>
        </div>
        <div className="stat-card text-center">
          <Clock className="w-5 h-5 text-red-600 mx-auto mb-1" />
          <p className="text-2xl font-bold text-gray-900">{totalHours.toFixed(1)}</p>
          <p className="text-xs text-gray-500">Hours</p>
        </div>
        <div className="stat-card text-center">
          <DollarSign className="w-5 h-5 text-red-600 mx-auto mb-1" />
          <p className="text-xl font-bold text-gray-900">{formatSGD(totalPay)}</p>
          <p className="text-xs text-gray-500">Estimated pay</p>
        </div>
      </div>

      {shifts.length === 0 ? (
        <div className="card p-8 text-center">
          <CalendarDays className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No shifts rostered in the next 30 days</p>
          <p className="text-xs text-gray-400 mt-1">Check with your manager if you expected to be scheduled</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([weekMon, weekShifts]) => {
            const weekEnd = new Date(weekMon); weekEnd.setDate(weekEnd.getDate() + 6)
            const weekLabel = `${formatDate(weekMon)} — ${formatDate(weekEnd.toISOString().split('T')[0])}`
            const weekHours = weekShifts.reduce((s, r) => s + r.hours_worked, 0)
            const weekPay = weekShifts.reduce((s, r) => s + r.gross_pay, 0)
            return (
              <div key={weekMon} className="card">
                <div className="p-3 border-b border-gray-100 bg-gray-50 rounded-t-xl flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Week of {formatDate(weekMon)}</p>
                  <p className="text-xs text-gray-400">{weekHours.toFixed(1)}h · {formatSGD(weekPay)}</p>
                </div>
                <div className="divide-y divide-gray-100">
                  {weekShifts.map(shift => {
                    const isToday = shift.shift_date === new Date().toISOString().split('T')[0]
                    const isTomorrow = shift.shift_date === new Date(Date.now() + 86400000).toISOString().split('T')[0]
                    return (
                      <div key={shift.id} className={cn('p-4 flex items-center gap-3', isToday && 'bg-red-50', shift.is_locked && 'opacity-80')}>
                        <div className={cn('w-12 text-center flex-shrink-0 rounded-lg py-2', isToday ? 'bg-red-600' : 'bg-gray-100')}>
                          <p className={cn('text-xs font-medium', isToday ? 'text-red-100' : 'text-gray-500')}>
                            {new Date(shift.shift_date).toLocaleDateString('en-SG', { weekday: 'short' })}
                          </p>
                          <p className={cn('text-lg font-bold', isToday ? 'text-white' : 'text-gray-900')}>
                            {new Date(shift.shift_date).getDate()}
                          </p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-gray-900">{shift.gym?.name}</p>
                            {isToday && <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-medium">Today</span>}
                            {isTomorrow && <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full font-medium">Tomorrow</span>}
                            {shift.is_locked && <span className="text-xs text-gray-400">Confirmed</span>}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {shift.shift_start} – {shift.shift_end} · {shift.hours_worked?.toFixed(1)} hrs · {formatSGD(shift.gross_pay)}
                          </p>
                        </div>
                        {shift.whatsapp_reminder_sent && (
                          <span className="text-xs text-green-600 flex-shrink-0 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> Reminded
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p className="text-xs text-gray-400 text-center">
        Estimated pay is based on confirmed hourly rate. Actual payout may vary. Contact your manager for any roster queries.
      </p>
    </div>
  )
}
