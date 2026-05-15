import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createAdminClient } from '@/lib/supabase-server'

// GET /api/staff-rates?ids=uuid1,uuid2
// Returns { id, hourly_rate } for the given user IDs.
// Used by roster page to get hourly_rate for shift gross_pay calculation.
// hourly_rate is excluded from users_safe view — requires adminClient.
// Requires authenticated session — manager or biz_ops only.

export async function GET(request: NextRequest) {
  const serverClient = await createSupabaseServerClient()
  const { data: { user }, error } = await serverClient.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  // Only manager and biz_ops can fetch rates (for roster shift creation)
  const adminClient = createAdminClient()
  const { data: requester } = await adminClient
    .from('users').select('role, manager_gym_id').eq('id', user.id).maybeSingle()
  if (!requester || !['manager', 'business_ops', 'admin'].includes(requester.role)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const ids = request.nextUrl.searchParams.get('ids')
  if (!ids) return NextResponse.json([])

  const idList = ids.split(',').filter(Boolean)
  if (idList.length === 0) return NextResponse.json([])

  let query = adminClient.from('users').select('id, hourly_rate').in('id', idList)

  // Managers: scope to staff in their gym only — prevents cross-gym salary enumeration
  if (requester.role === 'manager') {
    const { data: gymStaff } = await adminClient
      .from('trainer_gyms').select('trainer_id').eq('gym_id', requester.manager_gym_id)
    const gymStaffIds = (gymStaff || []).map((r: any) => r.trainer_id)
    // Also include full-time staff assigned to manager's gym
    const { data: ftStaff } = await adminClient
      .from('users').select('id').eq('manager_gym_id', requester.manager_gym_id)
    const allAllowedIds = Array.from(new Set([
      ...gymStaffIds,
      ...(ftStaff || []).map((r: any) => r.id),
    ]))
    // Filter requested IDs to only those in manager's gym
    const allowedIds = idList.filter(id => allAllowedIds.includes(id))
    if (allowedIds.length === 0) return NextResponse.json([])
    query = adminClient.from('users').select('id, hourly_rate').in('id', allowedIds)
  }

  const { data, error: fetchErr } = await query
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

  return NextResponse.json(data || [])
}
