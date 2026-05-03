import { createAdminClient, createSupabaseServerClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const serverClient = await createSupabaseServerClient()
    const { data: { user } } = await serverClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: currentUser } = await serverClient
      .from('users').select('role, manager_gym_id').eq('id', user.id).single()

    if (!currentUser || !['admin', 'manager', 'business_ops'].includes(currentUser.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { full_name, email, phone, role, commission_signup_pct, commission_session_pct,
      gym_ids, manager_gym_id, is_also_trainer } = body

    if (currentUser.role === 'manager' && !['trainer', 'manager'].includes(role)) {
      return NextResponse.json({ error: 'Managers can only create trainer or manager accounts' }, { status: 403 })
    }

    const adminClient = createAdminClient()

    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email, email_confirm: true, user_metadata: { full_name },
    })
    if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })

    const { employment_type, hourly_rate, membership_commission_pct, nric, nationality, leave_entitlement_days } = body
    const resolvedRole = role || 'trainer'
    const resolvedEmployment = employment_type || 'full_time'
    // Leave entitlement: null for roles excluded from the leave system (admin, part-timers).
    // For everyone else, Business Ops sets the value explicitly during onboarding — no silent default.
    const isLeaveExcluded = resolvedRole === 'admin' || resolvedEmployment === 'part_time'
    const resolvedLeaveEntitlement = isLeaveExcluded
      ? null
      : (leave_entitlement_days != null && leave_entitlement_days !== '' ? parseInt(leave_entitlement_days) : null)
    const userPayload: any = {
      id: authData.user.id, full_name, email,
      phone: phone || null, role: resolvedRole,
      employment_type: resolvedEmployment,
      hourly_rate: hourly_rate ? parseFloat(hourly_rate) : null,
      commission_signup_pct: parseFloat(commission_signup_pct) || 10,
      commission_session_pct: parseFloat(commission_session_pct) || 15,
      membership_commission_pct: parseFloat(membership_commission_pct) || 5,
      nric: nric || null, nationality: nationality || null,
      leave_entitlement_days: resolvedLeaveEntitlement,
    }
    if (role === 'manager' && manager_gym_id) userPayload.manager_gym_id = manager_gym_id
    if (role === 'manager') userPayload.is_also_trainer = !!is_also_trainer

    const gymIdsToAssign = currentUser.role === 'manager' && currentUser.manager_gym_id
      ? [currentUser.manager_gym_id] : gym_ids || []

    const { error: userError } = await adminClient.from('users').insert(userPayload)
    if (userError) return NextResponse.json({ error: userError.message }, { status: 400 })

    // Assign trainer gyms — also for manager-trainers
    const finalGymIds = role === 'manager' && manager_gym_id ? [manager_gym_id]
      : role === 'trainer' ? gymIdsToAssign : []

    if (finalGymIds.length > 0) {
      await adminClient.from('trainer_gyms').insert(
        finalGymIds.map((gymId: string, idx: number) => ({
          trainer_id: authData.user.id, gym_id: gymId, is_primary: idx === 0,
        }))
      )
    }

    return NextResponse.json({ success: true, userId: authData.user.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const serverClient = await createSupabaseServerClient()
    const { data: { user } } = await serverClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: currentUser } = await serverClient
      .from('users').select('role, manager_gym_id').eq('id', user.id).single()

    const body = await request.json()
    const { userId, full_name, email, phone, role, is_active, date_of_birth, date_of_joining, date_of_departure, departure_reason,
      commission_signup_pct, commission_session_pct,
      gym_ids, manager_gym_id, reset_login, is_also_trainer } = body

    const adminClient = createAdminClient()
    const isSelf = userId === user.id
    const isAdmin = currentUser?.role === 'admin'
    const isManager = currentUser?.role === 'manager'

    if (!isAdmin && !isSelf) {
      if (isManager) {
        const { data: gymCheck } = await serverClient
          .from('trainer_gyms').select('trainer_id')
          .eq('trainer_id', userId).eq('gym_id', currentUser.manager_gym_id || '').single()
        if (!gymCheck) return NextResponse.json({ error: 'Forbidden — trainer not in your gym' }, { status: 403 })
      } else {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    // Update auth
    const authUpdates: any = {}
    if (email) authUpdates.email = email
    if (full_name) authUpdates.user_metadata = { full_name }
    if (Object.keys(authUpdates).length > 0) {
      const { error: authErr } = await adminClient.auth.admin.updateUserById(userId, authUpdates)
      if (authErr) return NextResponse.json({ error: `Auth update failed: ${authErr.message}` }, { status: 400 })
    }

    if (reset_login) {
      const { data: targetUser } = await adminClient.from('users').select('email').eq('id', userId).single()
      if (targetUser?.email) {
        await adminClient.auth.admin.generateLink({ type: 'recovery', email: targetUser.email })
      }
    }

    // Build update payload
    const updatePayload: any = {}
    if (full_name !== undefined) updatePayload.full_name = full_name
    if (email !== undefined) updatePayload.email = email
    if (phone !== undefined) updatePayload.phone = phone || null

    if (isAdmin) {
      if (role !== undefined) updatePayload.role = role
      if (is_active !== undefined) updatePayload.is_active = is_active
      if (commission_signup_pct !== undefined) updatePayload.commission_signup_pct = parseFloat(commission_signup_pct)
      if (commission_session_pct !== undefined) updatePayload.commission_session_pct = parseFloat(commission_session_pct)
      if (body.leave_entitlement_days !== undefined) updatePayload.leave_entitlement_days = parseInt(body.leave_entitlement_days)
      if (is_also_trainer !== undefined) updatePayload.is_also_trainer = is_also_trainer
      if (role === 'manager' || manager_gym_id !== undefined) {
        updatePayload.manager_gym_id = manager_gym_id || null
      }
    }

    if (isManager) {
      if (commission_signup_pct !== undefined) updatePayload.commission_signup_pct = parseFloat(commission_signup_pct)
      if (commission_session_pct !== undefined) updatePayload.commission_session_pct = parseFloat(commission_session_pct)
    }
    // Biz Ops can update leave entitlement
    if (currentUser?.role === 'business_ops') {
      if (body.leave_entitlement_days !== undefined) updatePayload.leave_entitlement_days = parseInt(body.leave_entitlement_days)
    }

    if (Object.keys(updatePayload).length > 0) {
      const { error } = await adminClient.from('users').update(updatePayload).eq('id', userId)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // Update gym assignments for trainers and manager-trainers
    if (isAdmin && (role === 'trainer' || role === 'manager') && gym_ids !== undefined) {
      await adminClient.from('trainer_gyms').delete().eq('trainer_id', userId)
      const idsToAssign = role === 'manager' && manager_gym_id ? [manager_gym_id]
        : role === 'trainer' ? gym_ids : []
      if (idsToAssign.length > 0) {
        await adminClient.from('trainer_gyms').insert(
          idsToAssign.map((gymId: string, idx: number) => ({
            trainer_id: userId, gym_id: gymId, is_primary: idx === 0,
          }))
        )
      }
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

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
    const { error } = await adminClient.from('users').update({
      is_archived: true, is_active: false,
      archived_at: new Date().toISOString(), archived_by: user.id,
    }).eq('id', userId)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    await adminClient.auth.admin.updateUserById(userId, { ban_duration: '876600h' })
    await adminClient.from('trainer_gyms').delete().eq('trainer_id', userId)
    await adminClient.from('users').update({ manager_gym_id: null }).eq('id', userId)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
