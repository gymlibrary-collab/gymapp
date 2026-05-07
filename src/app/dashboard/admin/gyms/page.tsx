'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { formatDate, formatSGD } from '@/lib/utils'
import { Building2, Users, UserCheck, Dumbbell, MapPin, Maximize2, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCurrentUser } from '@/hooks/useCurrentUser'

export default function AdminGymsPage() {

  const { user, loading } = useCurrentUser({ allowedRoles: ['admin'] })
  const [gyms, setGyms] = useState<any[]>([])
  const { logActivity } = useActivityLog()
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    const load = async () => {
      logActivity('page_view', 'Gym Clubs', 'Viewed gym clubs list')

      const { data: gymsData } = await supabase
        .from('gyms').select('*').order('name')

      const { data: allStaff } = await supabase
        .from('users')
        .select('id, role, manager_gym_id, trainer_gyms(gym_id)')
        .eq('is_archived', false)

      const rows = (gymsData || []).map(g => ({
        ...g,
        managers: allStaff?.filter((s: any) => s.role === 'manager' && s.manager_gym_id === g.id).length || 0,
        fullTimeTrainers: allStaff?.filter((s: any) =>
          s.role === 'trainer' &&
          (s.employment_type === 'full_time' || !s.employment_type) &&
          (s.trainer_gyms as any[])?.some((tg: any) => tg.gym_id === g.id)
        ).length || 0,
        partTimeTrainers: allStaff?.filter((s: any) =>
          s.role === 'staff' &&
          s.employment_type === 'part_time' &&
          (s.trainer_gyms as any[])?.some((tg: any) => tg.gym_id === g.id)
        ).length || 0,
      }))

      setGyms(rows)
    }
    load()
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600" />
    </div>
  )

  const activeGyms = gyms.filter(g => g.is_active)
  const inactiveGyms = gyms.filter(g => !g.is_active)

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Gym Clubs</h1>
        <p className="text-sm text-gray-500">
          View-only · {activeGyms.length} active · {inactiveGyms.length} inactive ·
          Contact Business Ops to add or edit gym clubs
        </p>
      </div>

      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
        <Building2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
        Gym club management (add, edit, deactivate) is handled by Business Operations.
      </div>

      {gyms.length === 0 ? (
        <div className="card p-8 text-center">
          <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No gym clubs configured yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {gyms.map(gym => (
            <div key={gym.id} className={cn('card p-4', !gym.is_active && 'opacity-60')}>
              <div className="flex items-start gap-3">
                <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                  gym.is_active ? 'bg-red-100' : 'bg-gray-100')}>
                  <Building2 className={cn('w-5 h-5', gym.is_active ? 'text-red-600' : 'text-gray-400')} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900">{gym.name}</p>
                    <span className={gym.is_active ? 'badge-active' : 'badge-inactive'}>
                      {gym.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  {gym.address && (
                    <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3 flex-shrink-0" /> {gym.address}
                    </p>
                  )}

                  <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-gray-400">
                    {gym.size_sqft && (
                      <span className="flex items-center gap-1">
                        <Maximize2 className="w-3 h-3" /> {gym.size_sqft.toLocaleString('en-SG', { maximumFractionDigits: 2 })} sq ft
                      </span>
                    )}
                    {gym.date_opened && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> Opened {formatDate(gym.date_opened)}
                      </span>
                    )}
                  </div>

                  {/* Staff breakdown */}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <div className="flex items-center gap-1.5 bg-yellow-50 border border-yellow-100 rounded-lg px-2 py-1">
                      <UserCheck className="w-3 h-3 text-yellow-700" />
                      <span className="text-xs font-medium text-yellow-800">
                        {gym.managers} Manager{gym.managers !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-green-50 border border-green-100 rounded-lg px-2 py-1">
                      <Dumbbell className="w-3 h-3 text-green-700" />
                      <span className="text-xs font-medium text-green-800">
                        {gym.fullTimeTrainers} FT Trainer{gym.fullTimeTrainers !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {gym.partTimeTrainers > 0 && (
                      <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-100 rounded-lg px-2 py-1">
                        <Users className="w-3 h-3 text-blue-700" />
                        <span className="text-xs font-medium text-blue-800">
                          {gym.partTimeTrainers} PT Staff
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1">
                      <Users className="w-3 h-3 text-gray-500" />
                      <span className="text-xs font-medium text-gray-600">
                        {gym.managers + gym.fullTimeTrainers + gym.partTimeTrainers} Total
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
