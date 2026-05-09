'use client'

// ============================================================
// src/app/dashboard/_components/SessionSchedule.tsx
//
// PURPOSE:
//   Renders two sections of the dashboard session view:
//     1. Today's Sessions — list of sessions scheduled for today
//     2. Gym Schedule — 7-day colour-coded calendar grid
//
// CALENDAR:
//   Colour-coded by trainer (up to 10 trainers, cycling a palette).
//   Manager can click a session block to see full detail modal.
//   Manager can navigate backwards (previous weeks); trainer/staff
//   can only navigate forward from today.
//   calendarOffset: 0 = week containing today, 7 = next week, etc.
//
// USED BY:
//   dashboard/page.tsx — manager, trainer, staff roles
//   biz-ops sees today's sessions but NOT the calendar
// ============================================================

import { Calendar, Clock, X } from 'lucide-react'
import Link from 'next/link'
import { cn, formatDate, formatDateTime } from '@/lib/utils'

interface SessionScheduleProps {
  /** Today's sessions (from fetchTodaySessions) */
  todaySessions: any[]
  /** Sessions for the 14-day schedule window (from fetchGymSchedule) */
  gymScheduleSessions: any[]
  /** Calendar week offset: 0=this week, 7=next week, -7=last week */
  calendarOffset: number
  /** Called when user navigates the calendar */
  onCalendarOffsetChange: (offset: number) => void
  /** Whether this is a trainer view (affects session display and navigation limits) */
  isTrainer: boolean
  /** Whether this is a manager view (enables back navigation + session detail modal) */
  isManager: boolean
  /** Whether this is biz-ops (hides "All sessions" link, hides calendar) */
  isBizOps: boolean
  /** Whether to show the gym schedule calendar (manager/trainer/staff only) */
  showCalendar: boolean
  /** Whether upcoming sessions section is shown (passed from parent, rendered separately) */
  upcomingSessions?: any[]
}

const PALETTE = [
  '#E24B4A','#3B82F6','#10B981','#F59E0B','#8B5CF6',
  '#EC4899','#06B6D4','#84CC16','#F97316','#6366F1',
]
const HOURS = Array.from({ length: 19 }, (_, i) => i + 5) // 5am–11pm
const HOUR_H = 56 // px per hour
const DAY_W = 160 // px per day column

export default function SessionSchedule({
  todaySessions,
  gymScheduleSessions,
  calendarOffset,
  onCalendarOffsetChange,
  isTrainer,
  isManager,
  isBizOps,
  showCalendar,
}: SessionScheduleProps) {
  // Build trainer colour map from schedule sessions
  const trainerIds = Array.from(new Set(gymScheduleSessions.map((s: any) => s.trainer?.id))).filter(Boolean)
  const trainerColor: Record<string, string> = {}
  trainerIds.forEach((id: any, i) => { trainerColor[id] = PALETTE[i % PALETTE.length] })

  // Calendar days — 7 from today + offset
  const safeOffset = isManager ? calendarOffset : Math.max(0, calendarOffset)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today); d.setDate(d.getDate() + safeOffset + i); return d
  })

  // Group sessions by day
  const byDay: Record<string, any[]> = {}
  days.forEach(d => { byDay[d.toDateString()] = [] })
  gymScheduleSessions.forEach((s: any) => {
    const sd = new Date(s.scheduled_at); sd.setHours(0, 0, 0, 0)
    const key = sd.toDateString()
    if (byDay[key]) byDay[key].push(s)
  })

  // Session detail modal state (manager only)
  const [calendarModal, setCalendarModal] = (typeof window !== 'undefined'
    ? require('react').useState(null)
    : [null, () => {}]) as [any, (v: any) => void]

  return (
    <>
      {/* ── Today's Sessions ── */}
      <div className="card">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
            <Calendar className="w-4 h-4 text-red-600" /> Today's Sessions
            {todaySessions.length > 0 && (
              <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-medium">
                {todaySessions.length}
              </span>
            )}
          </h2>
          <Link
            href="/dashboard/pt/sessions"
            className={cn('text-xs text-red-600 font-medium', isBizOps && 'hidden')}
          >
            All sessions
          </Link>
        </div>

        {todaySessions.length === 0 ? (
          <div className="p-6 text-center">
            <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No sessions scheduled for today</p>
            {isTrainer && (
              <Link href="/dashboard/pt/sessions/new" className="btn-primary inline-block mt-3 text-xs py-1.5">
                Schedule session
              </Link>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {todaySessions.map((s: any) => {
              const time = new Date(s.scheduled_at).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })
              const statusColor = s.status === 'completed'
                ? 'bg-green-100 text-green-700'
                : s.status === 'cancelled'
                  ? 'bg-red-100 text-red-700'
                  : s.status === 'no_show'
                    ? 'bg-orange-100 text-orange-700'
                    : 'bg-blue-100 text-blue-700'
              return (
                <div key={s.id} className="flex items-center gap-3 p-4">
                  <div className="text-center w-12 flex-shrink-0">
                    <p className="text-sm font-bold text-gray-900">{time}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-medium text-gray-900">{s.member?.full_name}</p>
                      {s.package?.total_sessions && (() => {
                        const used = s.package.sessions_used || 0
                        const total = s.package.total_sessions
                        const isLast = used >= total - 1
                        return (
                          <span className={cn(
                            'text-xs font-medium px-1.5 py-0.5 rounded-full flex-shrink-0',
                            isLast ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                          )}>
                            Session {used + 1}/{total}
                          </span>
                        )
                      })()}
                    </div>
                    {!isTrainer && <p className="text-xs text-gray-400">{s.trainer?.full_name}</p>}
                    {s.package?.package_name && <p className="text-xs text-gray-400">{s.package.package_name}</p>}
                  </div>
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium capitalize flex-shrink-0', statusColor)}>
                    {s.status === 'no_show' ? 'No-show' : s.status}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── 7-Day Calendar ── */}
      {showCalendar && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
              <Calendar className="w-4 h-4 text-red-600" /> Gym Schedule
            </h2>
            <div className="flex items-center gap-2">
              {isManager && (
                <button
                  onClick={() => onCalendarOffsetChange(calendarOffset - 7)}
                  className="text-xs text-gray-500 hover:text-gray-900 px-2 py-1 rounded border border-gray-200 hover:border-gray-300"
                >← Prev</button>
              )}
              <button
                onClick={() => onCalendarOffsetChange(0)}
                className="text-xs text-red-600 hover:text-red-700 px-2 py-1 rounded border border-red-200"
              >Today</button>
              <button
                onClick={() => onCalendarOffsetChange(calendarOffset + 7)}
                className="text-xs text-gray-500 hover:text-gray-900 px-2 py-1 rounded border border-gray-200 hover:border-gray-300"
              >Next →</button>
            </div>
          </div>

          {/* Trainer legend */}
          {trainerIds.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 py-2 border-b border-gray-100 bg-gray-50">
              {trainerIds.map((tid: any) => {
                const s = gymScheduleSessions.find((s: any) => s.trainer?.id === tid)
                return (
                  <div key={tid} className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: trainerColor[tid] }} />
                    <span className="text-xs text-gray-600">{s?.trainer?.full_name}</span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Calendar grid */}
          <div className="overflow-x-auto">
            <div style={{ display: 'flex', minWidth: `${52 + DAY_W * 7}px` }}>
              {/* Y-axis hours */}
              <div style={{ width: 52, flexShrink: 0, paddingTop: 48 }}>
                {HOURS.map(h => (
                  <div key={h} style={{ height: HOUR_H, display: 'flex', alignItems: 'flex-start', paddingTop: 2 }}>
                    <span style={{ fontSize: 10, color: '#9CA3AF', paddingRight: 4, lineHeight: 1 }}>
                      {h === 12 ? '12pm' : h < 12 ? `${h}am` : `${h - 12}pm`}
                    </span>
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {days.map(day => {
                const isToday = day.toDateString() === new Date().toDateString()
                const daySessions = byDay[day.toDateString()] || []
                const byHour: Record<number, any[]> = {}
                daySessions.forEach((s: any) => {
                  const h = new Date(s.scheduled_at).getHours()
                  if (!byHour[h]) byHour[h] = []
                  byHour[h].push(s)
                })

                return (
                  <div key={day.toDateString()} style={{ width: DAY_W, flexShrink: 0, borderLeft: '1px solid #F3F4F6' }}>
                    <div style={{ height: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: isToday ? '#E24B4A' : '#F9FAFB', borderBottom: isToday ? '2px solid #C73B3A' : '1px solid #F3F4F6' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: isToday ? 'rgba(255,255,255,0.85)' : '#6B7280', letterSpacing: '0.05em' }}>
                        {day.toLocaleDateString('en-SG', { weekday: 'short' }).toUpperCase()}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: isToday ? 'white' : '#111827' }}>
                        {day.toLocaleDateString('en-SG', { day: '2-digit', month: 'short' })}
                      </span>
                    </div>

                    {HOURS.map(h => {
                      const slotSessions = byHour[h] || []
                      const slotH = slotSessions.length > 0
                        ? Math.max(HOUR_H, slotSessions.length * HOUR_H)
                        : HOUR_H

                      return (
                        <div key={h} style={{ height: slotH, borderBottom: '1px solid #F9FAFB', position: 'relative', background: h % 2 === 0 ? '#FAFAFA' : 'white' }}>
                          {slotSessions.map((s: any, idx: number) => {
                            const color = trainerColor[s.trainer?.id] || '#6B7280'
                            const durH = Math.max(0.5, (s.duration_minutes || 60) / 60)
                            const blockH = Math.min(durH * HOUR_H - 2, HOUR_H - 2)
                            const firstName = s.trainer?.full_name?.split(' ')[0] || '?'
                            const timeStr = new Date(s.scheduled_at).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })
                            const isCompleted = s.status === 'completed'
                            return (
                              <div key={s.id}
                                onClick={() => isManager ? setCalendarModal(s) : undefined}
                                style={{ position: 'absolute', left: 2, right: 2, top: idx * HOUR_H + 1, height: blockH, background: color, opacity: isCompleted ? 0.55 : 0.9, borderRadius: 4, padding: '2px 4px', cursor: isManager ? 'pointer' : 'default', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: 'white', lineHeight: 1.2 }}>{firstName}</span>
                                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.85)', lineHeight: 1.2 }}>{timeStr}</span>
                                {isCompleted && <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.7)' }}>done</span>}
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Session detail modal — manager only */}
          {calendarModal && isManager && (
            <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setCalendarModal(null)}>
              <div className="fixed inset-0 bg-black/30" />
              <div className="relative bg-white rounded-2xl shadow-xl p-5 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900 text-sm">Session Details</h3>
                  <button onClick={() => setCalendarModal(null)}><X className="w-4 h-4 text-gray-400" /></button>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: trainerColor[calendarModal.trainer?.id] || '#6B7280' }} />
                    <div>
                      <p className="text-xs text-gray-400">Trainer</p>
                      <p className="text-sm font-medium text-gray-900">{calendarModal.trainer?.full_name}</p>
                    </div>
                  </div>
                  <div><p className="text-xs text-gray-400">Client</p><p className="text-sm font-medium text-gray-900">{calendarModal.member?.full_name}</p></div>
                  <div><p className="text-xs text-gray-400">PT Package</p><p className="text-sm font-medium text-gray-900">{calendarModal.package?.package_name || '—'}</p></div>
                  <div>
                    <p className="text-xs text-gray-400">Session Progress</p>
                    {calendarModal.package ? (() => {
                      const used = calendarModal.package.sessions_used || 0
                      const total = calendarModal.package.total_sessions || 0
                      return <p className="text-sm font-medium text-gray-900">Session {used}/{total} · {total - used} remaining</p>
                    })() : <p className="text-sm text-gray-400">—</p>}
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Date & Time</p>
                    <p className="text-sm font-medium text-gray-900">
                      {formatDate(calendarModal.scheduled_at?.split('T')[0])} · {new Date(calendarModal.scheduled_at).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div><p className="text-xs text-gray-400">Duration</p><p className="text-sm font-medium text-gray-900">{calendarModal.duration_minutes || 60} minutes</p></div>
                  <div>
                    <p className="text-xs text-gray-400">Status</p>
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', calendarModal.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700')}>
                      {calendarModal.status}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}
