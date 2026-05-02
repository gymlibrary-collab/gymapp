import { createAdminClient, createSupabaseServerClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

// ── CREATE ──────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const serverClient = await createSupabaseServerClient()
    const { data: { user } } = await serverClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: currentUser } = await serverClient
      .from('users').select('role').eq('id', user.id).single()

    if (!currentUser || !['admin', 'manager', 'business_ops'].includes(currentUser.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { full_name, email, phone, role, commission_signup_pct, commission_session_pct, gym_ids, manager_gym_id } = body

    if (currentUser.role === 'manager' && !['trainer', 'manager'].includes(role)) {
      return NextResponse.json({ error: 'Managers can only create trainer or manager accounts' }, { status: 403 })
    }

    const adminClient = createAdminClient()

    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name },
    })
    if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })

    const userPayload: any = {
      id: authData.user.id,
      full_name,
      email,
      phone: phone || null,
      role: role || 'trainer',
      commission_signup_pct: parseFloat(commission_signup_pct) || 10,
      commission_session_pct: parseFloat(commission_session_pct) || 15,
    }
    if (role === 'manager' && manager_gym_id) userPayload.manager_gym_id = manager_gym_id

    const { error: userError } = await adminClient.from('users').insert(userPayload)
    if (userError) return NextResponse.json({ error: userError.message }, { status: 400 })

    if (role === 'trainer' && gym_ids?.length > 0) {
      await adminClient.from('trainer_gyms').insert(
        gym_ids.map((gymId: string, idx: number) => ({
          trainer_id: authData.user.id,
          gym_id: gymId,
          is_primary: idx === 0,
        }))
      )
    }

    return NextResponse.json({ success: true, userId: authData.user.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ── EDIT ─────────────────────────────────────────────────────
export async function PATCH(request: Request) {
  try {
    const serverClient = await createSupabaseServerClient()
    const { data: { user } } = await serverClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: currentUser } = await serverClient
      .from('users').select('role').eq('id', user.id).single()
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
    }

    const body = await request.json()
    const { userId, full_name, phone, role, is_active, commission_signup_pct, commission_session_pct, gym_ids, manager_gym_id, reset_login } = body

    const adminClient = createAdminClient()

    // Update auth user email/name if needed
    if (full_name) {
      await adminClient.auth.admin.updateUserById(userId, {
        user_metadata: { full_name },
      })
    }

    // Reset login — send magic link / password reset
    if (reset_login) {
      const { data: targetUser } = await adminClient.from('users').select('email').eq('id', userId).single()
      if (targetUser?.email) {
        await adminClient.auth.admin.generateLink({
          type: 'recovery',
          email: targetUser.email,
        })
      }
    }

    // Update user profile
    const updatePayload: any = {}
    if (full_name !== undefined) updatePayload.full_name = full_name
    if (phone !== undefined) updatePayload.phone = phone || null
    if (role !== undefined) updatePayload.role = role
    if (is_active !== undefined) updatePayload.is_active = is_active
    if (commission_signup_pct !== undefined) updatePayload.commission_signup_pct = parseFloat(commission_signup_pct)
    if (commission_session_pct !== undefined) updatePayload.commission_session_pct = parseFloat(commission_session_pct)

    // Handle manager gym assignment
    if (role === 'manager' || manager_gym_id !== undefined) {
      updatePayload.manager_gym_id = manager_gym_id || null
    }

    if (Object.keys(updatePayload).length > 0) {
      const { error } = await adminClient.from('users').update(updatePayload).eq('id', userId)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // Update gym assignments for trainers
    if (role === 'trainer' && gym_ids !== undefined) {
      await adminClient.from('trainer_gyms').delete().eq('trainer_id', userId)
      if (gym_ids.length > 0) {
        await adminClient.from('trainer_gyms').insert(
          gym_ids.map((gymId: string, idx: number) => ({
            trainer_id: userId,
            gym_id: gymId,
            is_primary: idx === 0,
          }))
        )
      }
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ── ARCHIVE (soft delete) ─────────────────────────────────────
export async function DELETE(request: Request) {
  try {
    const serverClient = await createSupabaseServerClient()
    const { data: { user } } = await serverClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: currentUser } = await serverClient
      .from('users').select('role').eq('id', user.id).single()
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
    }

    const { userId } = await request.json()
    if (userId === user.id) {
      return NextResponse.json({ error: 'You cannot archive your own account' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    // Soft archive — mark as archived, deactivate
    const { error } = await adminClient.from('users').update({
      is_archived: true,
      is_active: false,
      archived_at: new Date().toISOString(),
      archived_by: user.id,
    }).eq('id', userId)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // Disable their auth login
    await adminClient.auth.admin.updateUserById(userId, { ban_duration: '876600h' })

    // Remove gym assignments
    await adminClient.from('trainer_gyms').delete().eq('trainer_id', userId)
    await adminClient.from('users').update({ manager_gym_id: null }).eq('id', userId)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
