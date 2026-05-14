import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createSupabaseServerClient } from '@/lib/supabase-server'

// GET /api/gyms?ids=uuid1,uuid2
// Returns gym id+name only for the given IDs using adminClient (bypasses RLS)
// Requires authenticated session — used by manager portal for gym name lookups

export async function GET(req: NextRequest) {
  // Verify authenticated session — no access for unauthenticated requests
  const serverClient = await createSupabaseServerClient()
  const { data: { user } } = await serverClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const adminClient = createAdminClient()

  // ?staff_id=uuid — returns all gym assignments for a staff member (bypasses trainer_gyms RLS)
  const staffId = req.nextUrl.searchParams.get('staff_id')
  if (staffId) {
    // Verify the requesting user has access to this staff member
    // Managers can only query staff assigned to their gym
    // Biz Ops and Admin can query any staff member
    const { data: requester } = await adminClient
      .from('users').select('role, manager_gym_id').eq('id', user.id).maybeSingle()

    if (!requester) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    if (requester.role === 'manager') {
      // Check staff member has at least one row in manager's gym
      const { data: check } = await adminClient
        .from('trainer_gyms')
        .select('trainer_id')
        .eq('trainer_id', staffId)
        .eq('gym_id', requester.manager_gym_id)
        .maybeSingle()
      if (!check) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    } else if (!['admin', 'business_ops'].includes(requester.role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const { data: tgData, error: tgErr } = await adminClient
      .from('trainer_gyms')
      .select('gym_id, gyms(id, name)')
      .eq('trainer_id', staffId)
    if (tgErr) return NextResponse.json({ error: tgErr.message }, { status: 500 })
    const gyms = (tgData || []).map((r: any) => ({ id: r.gym_id, name: r.gyms?.name || '' }))
    return NextResponse.json(gyms)
  }

  // ?ids=uuid1,uuid2 — returns gym names for given IDs
  const ids = req.nextUrl.searchParams.get('ids')
  if (!ids) return NextResponse.json([])

  const gymIds = ids.split(',').filter(Boolean)
  if (gymIds.length === 0) return NextResponse.json([])

  const { data, error } = await adminClient
    .from('gyms')
    .select('id, name')
    .in('id', gymIds)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}
