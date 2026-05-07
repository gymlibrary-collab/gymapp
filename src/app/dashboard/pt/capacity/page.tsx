'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { formatSGD } from '@/lib/utils'
import { Dumbbell, TrendingUp, Clock, CheckCircle, XCircle, AlertTriangle, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { StatusBanner } from '@/components/StatusBanner'
import { useCurrentUser } from '@/hooks/useCurrentUser'

export default function TrainerCapacityPage() {
  const { user, loading } = useCurrentUser({ allowedRoles: ['manager', 'business_ops'] })


  const { logActivity } = useActivityLog()
  const [trainers, setTrainers] = useState<any[]>([])
  const { success, showMsg } = useToast()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState({ max_sessions_per_week: 0, monthly_session_target: 0 })
  const [saving, setSaving] = useState(false)

  const supabase = createClient()
  const router = useRouter()

  useEffect(() => { load() }, [])

  if (loading || !user) return null

  const load = async () => {
      // Auth guard handled by useCurrentUser hook

    const now = new Date()
    // Week bounds (Mon-Sun)
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - (now.getDay() || 7) + 1); weekStart.setHours(0,0,0,0)
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6); weekEnd.setHours(23,59,59,999)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

    // Load trainers for this gym
    let trainerQ = supabase.from('users').select('*').eq('role', 'trainer').eq('is_archived', false)
    if (user.role === 'manager' && user.manager_gym_id) {
      const { data: tg } = await supabase.from('trainer_gyms').select('trainer_id').eq('gym_id', user.manager_gym_id)
      const tIds = tg?.map((t: any) => t.trainer_id) || []
      if (tIds.length > 0) trainerQ = trainerQ.in('id', tIds)
    }
    const { data: trainerData } = await trainerQ.order('full_name')

    // For each trainer, get session counts
    const enriched = await Promise.all((trainerData || []).map(async (t: any) => {
      // This week: scheduled sessions
      const { count: weekScheduled } = await supabase.from('sessions')
        .select('id', { count: 'exact', head: true })
        .eq('trainer_id', t.id).in('status', ['scheduled'])
        .gte('scheduled_at', weekStart.toISOString()).lte('scheduled_at', weekEnd.toISOString())

      // This week: completed
      const { count: weekCompleted } = await supabase.from('sessions')
        .select('id', { count: 'exact', head: true })
        .eq('trainer_id', t.id).eq('status', 'completed')
        .gte('scheduled_at', weekStart.toISOString()).lte('scheduled_at', weekEnd.toISOString())

      // This month: completed
      const { count: monthCompleted } = await supabase.from('sessions')
        .select('id', { count: 'exact', head: true })
        .eq('trainer_id', t.id).eq('status', 'completed')
        .gte('marked_complete_at', monthStart.toISOString()).lte('marked_complete_at', monthEnd.toISOString())

      // This month: cancelled + no-show
      const { count: monthCancelled } = await supabase.from('sessions')
        .select('id', { count: 'exact', head: true })
        .eq('trainer_id', t.id).in('status', ['cancelled', 'no_show'])
        .gte('scheduled_at', monthStart.toISOString()).lte('scheduled_at', monthEnd.toISOString())

      // Active packages count
      const { count: activePackages } = await supabase.from('packages')
        .select('id', { count: 'exact', head: true })
        .eq('trainer_id', t.id).eq('status', 'active')

      const weekTotal = (weekScheduled || 0) + (weekCompleted || 0)
      const weekMax = t.max_sessions_per_week || 20
      const weekPct = Math.min(Math.round(weekTotal / weekMax * 100), 100)
      const monthTarget = t.monthly_session_target || 80
      const monthPct = Math.min(Math.round((monthCompleted || 0) / monthTarget * 100), 100)

      return {
        ...t, weekScheduled: weekScheduled || 0, weekCompleted: weekCompleted || 0,
        weekTotal, weekMax, weekPct,
        monthCompleted: monthCompleted || 0, monthCancelled: monthCancelled || 0,
        monthTarget, monthPct, activePackages: activePackages || 0,
      }
    }))

    setTrainers(enriched)
  }

  const handleSaveCapacity = async (trainerId: string) => {
    setSaving(true)
    await supabase.from('users').update({
      max_sessions_per_week: editValues.max_sessions_per_week,
      monthly_session_target: editValues.monthly_session_target,
    }).eq('id', trainerId)
    await load(); setEditingId(null); setSaving(false)
    showMsg('Capacity updated')
  }

  const utilizationColor = (pct: number) =>
    pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-green-500'

  const utilizationBg = (pct: number) =>
    pct >= 90 ? 'text-red-700 bg-red-50' : pct >= 70 ? 'text-amber-700 bg-amber-50' : 'text-green-700 bg-green-50'

  const now = new Date()
  const monthName = now.toLocaleString('default', { month: 'long' })
  const weekLabel = `Week of ${new Date(now.getDate() - (now.getDay() || 7) + 1 + now.valueOf() - now.valueOf()).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}`


  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Trainer Capacity</h1>
        <p className="text-sm text-gray-500">{trainers.length} trainer{trainers.length !== 1 ? 's' : ''} · {monthName} {now.getFullYear()}</p>
      </div>

      <StatusBanner success={success} />

      {trainers.length === 0 ? (
        <div className="card p-8 text-center"><Dumbbell className="w-10 h-10 text-gray-300 mx-auto mb-3" /><p className="text-gray-500 text-sm">No trainers assigned to your gym</p></div>
      ) : (
        <div className="space-y-4">
          {trainers.map(t => (
            <div key={t.id} className="card p-4 space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-red-700 font-semibold text-sm">{t.full_name.charAt(0)}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{t.full_name}</p>
                    <p className="text-xs text-gray-500">{t.employment_type === 'part_time' ? 'Part-time' : 'Full-time'} · {t.activePackages} active client{t.activePackages !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                {user?.role === 'manager' && (
                  editingId === t.id ? (
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button onClick={() => handleSaveCapacity(t.id)} disabled={saving} className="btn-primary text-xs py-1.5 flex items-center gap-1"><Save className="w-3.5 h-3.5" />Save</button>
                      <button onClick={() => setEditingId(null)} className="btn-secondary text-xs py-1.5">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => { setEditingId(t.id); setEditValues({ max_sessions_per_week: t.weekMax, monthly_session_target: t.monthTarget }) }}
                      className="btn-secondary text-xs py-1.5 flex-shrink-0">Set Targets</button>
                  )
                )}
              </div>

              {/* Edit capacity */}
              {editingId === t.id && (
                <div className="grid grid-cols-2 gap-3 bg-gray-50 rounded-lg p-3">
                  <div>
                    <label className="label text-xs">Max sessions/week</label>
                    <input className="input" type="number" min="1" value={editValues.max_sessions_per_week}
                      onChange={e => setEditValues(v => ({ ...v, max_sessions_per_week: parseInt(e.target.value) }))} />
                  </div>
                  <div>
                    <label className="label text-xs">Monthly session target</label>
                    <input className="input" type="number" min="1" value={editValues.monthly_session_target}
                      onChange={e => setEditValues(v => ({ ...v, monthly_session_target: parseInt(e.target.value) }))} />
                  </div>
                </div>
              )}

              {/* Week utilisation */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-medium text-gray-600">This week — {t.weekTotal}/{t.weekMax} sessions</p>
                  <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', utilizationBg(t.weekPct))}>{t.weekPct}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={cn('h-full rounded-full transition-all', utilizationColor(t.weekPct))} style={{ width: `${t.weekPct}%` }} />
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                  <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" />{t.weekCompleted} done</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-blue-500" />{t.weekScheduled} upcoming</span>
                  <span className="text-gray-300">{t.weekMax - t.weekTotal} slots free</span>
                </div>
              </div>

              {/* Monthly progress */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-medium text-gray-600">{monthName} — {t.monthCompleted}/{t.monthTarget} target</p>
                  <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', utilizationBg(t.monthPct))}>{t.monthPct}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={cn('h-full rounded-full transition-all', utilizationColor(t.monthPct))} style={{ width: `${t.monthPct}%` }} />
                </div>
                {t.monthCancelled > 0 && (
                  <div className="flex items-center gap-1 mt-1 text-xs text-red-500">
                    <XCircle className="w-3 h-3" /> {t.monthCancelled} cancelled / no-show this month
                  </div>
                )}
              </div>

              {/* Alerts */}
              {t.weekPct >= 90 && (
                <div className="flex items-center gap-2 bg-red-50 rounded-lg px-3 py-2 text-xs text-red-700">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> At or near weekly capacity — consider redistributing clients
                </div>
              )}
              {t.activePackages === 0 && (
                <div className="flex items-center gap-2 bg-amber-50 rounded-lg px-3 py-2 text-xs text-amber-700">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> No active PT clients
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
