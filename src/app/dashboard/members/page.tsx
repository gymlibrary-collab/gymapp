'use client'

import { useActivityLog } from '@/hooks/useActivityLog'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useViewMode } from '@/lib/view-mode-context'
import { formatDate } from '@/lib/utils'
import { Search, Plus, Users, CreditCard } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { PageSpinner } from '@/components/PageSpinner'

export default function MembersPage() {
  const { user, loading } = useCurrentUser({ allowedRoles: ['manager', 'business_ops', 'trainer', 'staff'] })


  const [members, setMembers] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const supabase = createClient()
  const router = useRouter()
  const { logActivity } = useActivityLog()
  const { isActingAsTrainer } = useViewMode()


  useEffect(() => {
    if (!user) return
    const load = async () => {
      logActivity('page_view', 'Members', 'Viewed members list')

      // Load members with their current active membership
      let q = supabase.from('members')
        .select(`
          *,
          gym:gyms(name),
          gym_memberships(
            id, membership_type_name, end_date, status, sale_status,
            sold_by_user_id
          )
        `)
        .order('full_name')

      // Scope by role/view
      // Trainers see all active members at their gym — not just ones they created.
      // This allows them to renew memberships and onboard any active gym member onto PT.
      if ((user!.role === 'manager' || user!.role === 'staff' || user!.role === 'trainer') && user!.manager_gym_id) {
        q = q.eq('gym_id', user!.manager_gym_id)
      } else if (isActingAsTrainer && user!.manager_gym_id) {
        q = q.eq('gym_id', user!.manager_gym_id)
      }

      const { data } = await q
      setMembers(data || [])
    }
    load()
  }, [user, isActingAsTrainer])

  if (loading) return <PageSpinner />
  if (!user) return null

  const getActiveMembership = (member: any) => {
    const memberships = member.gym_memberships || []
    return memberships.find((m: any) => m.status === 'active' && m.sale_status === 'confirmed')
  }

  const filtered = members.filter(m => {
    const membership = getActiveMembership(m)
    const hasMembership = !!membership
    const matchSearch = m.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      m.phone?.includes(search) || m.membership_number?.includes(search)
    const matchStatus = statusFilter === 'all' ||
      (statusFilter === 'active' && hasMembership) ||
      (statusFilter === 'expired' && !hasMembership)
    return matchSearch && matchStatus
  })

  const canAddMember = user?.role === 'manager' || user?.role === 'business_ops' || isActingAsTrainer || user?.role === 'trainer' || user?.role === 'staff'


  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Members</h1>
          <p className="text-sm text-gray-500">{filtered.length} member{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        {canAddMember && (
          <Link href="/dashboard/members/new" className="btn-primary flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> New Member
          </Link>
        )}
      </div>

      <div className="card p-3 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="input pl-9" placeholder="Search by name, phone or membership no..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1">
          {[{ k: 'active', l: 'Active membership' }, { k: 'expired', l: 'No membership' }, { k: 'all', l: 'All' }].map(({ k, l }) => (
            <button key={k} onClick={() => setStatusFilter(k)}
              className={cn('px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap',
                statusFilter === k ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card p-8 text-center">
          <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No members found</p>
          {canAddMember && <Link href="/dashboard/members/new" className="btn-primary inline-block mt-3">Register first member</Link>}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(member => {
            const membership = getActiveMembership(member)
            return (
              <Link key={member.id} href={`/dashboard/members/${member.id}`}
                className="card p-4 flex items-center gap-3 hover:border-red-200 transition-colors block">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-red-700 font-semibold text-sm">{member.full_name.charAt(0)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-gray-900 text-sm">{member.full_name}</p>
                    {member.membership_number && <span className="text-xs text-gray-400">#{member.membership_number}</span>}
                  </div>
                  <p className="text-xs text-gray-500">{member.phone}</p>
                  {membership ? (
                    <p className="text-xs text-green-600 flex items-center gap-1 mt-0.5">
                      <CreditCard className="w-3 h-3" />
                      {membership.membership_type_name} · valid until {formatDate(membership.end_date)}
                    </p>
                  ) : (
                    <p className="text-xs text-amber-500 mt-0.5">No active membership</p>
                  )}
                </div>
                <div className="text-xs text-gray-400 flex-shrink-0">
                  {member.gym?.name}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
