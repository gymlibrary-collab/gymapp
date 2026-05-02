import { createAdminClient, createSupabaseServerClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

// Add trainer to gym (manager or admin)
export async function POST(request: Request) {
  try {
    const serverClient = await createSupabaseServerClient()
    const { data: { user } } = await serverClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: currentUser } = await serverClient
      .from('users').select('role, manager_gym_id').eq('id', user.id).single()

    if (!currentUser || !['admin', 'manager'].includes(currentUser.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { trainer_id, gym_id } = body

    // Manager can only assign to their own gym
    if (currentUser.role === 'manager' && gym_id !== currentUser.manager_gym_id) {
      return NextResponse.json({ error: 'You can only assign trainers to your own gym' }, { status: 403 })
    }

    const adminClient = createAdminClient()

    // Check trainer exists and is not already assigned
    const { data: existing } = await adminClient
      .from('trainer_gyms')
      .select('id')
      .eq('trainer_id', trainer_id)
      .single()

    if (existing) {
      return NextResponse.json({ error: 'Trainer is already assigned to a gym' }, { status: 400 })
    }

    const { error } = await adminClient.from('trainer_gyms').insert({
      trainer_id,
      gym_id,
      is_primary: true,
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// Remove trainer from gym (manager or admin)
export async function DELETE(request: Request) {
  try {
    const serverClient = await createSupabaseServerClient()
    const { data: { user } } = await serverClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: currentUser } = await serverClient
      .from('users').select('role, manager_gym_id').eq('id', user.id).single()

    if (!currentUser || !['admin', 'manager'].includes(currentUser.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { trainer_id, gym_id } = body

    if (currentUser.role === 'manager' && gym_id !== currentUser.manager_gym_id) {
      return NextResponse.json({ error: 'You can only remove trainers from your own gym' }, { status: 403 })
    }

    const adminClient = createAdminClient()
    const { error } = await adminClient.from('trainer_gyms').delete()
      .eq('trainer_id', trainer_id)
      .eq('gym_id', gym_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
