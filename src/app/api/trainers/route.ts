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

    const { employment_type, hourly_rate, membership_commission_sgd, nric, nationality, leave_entitlement_days, address } = body
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
      membership_commission_sgd: membership_commission_sgd ? parseFloat(membership_commission_sgd) : 0,
      nric: nric || null, nationality: nationality || null,
      address: address || null,
      leave_entitlement_days: resolvedLeaveEntitlement,
    }
    if (role === 'manager' && manager_gym_id) userPayload.manager_gym_id = manager_gym_id
    if (role === 'manager') userPayload.is_also_trainer = !!is_also_trainer

    const gymIdsToAssign = currentUser.role === 'manager' && currentUser.manager_gym_id
      ? [currentUser.manager_gym_id] : gym_ids || []

    const { error: userError } = await adminClient.from('users').insert(userPayload)
    if (userError) return NextResponse.json({ error: userError.message }, { status: 400 })

    // Assign trainer gyms — also for manager-trainers
    // Part-time ops staff (role='staff', employment_type='part_time') also need
    // trainer_gyms entries so the roster page can filter available staff by gym.
    const finalGymIds = role === 'manager' && manager_gym_id ? [manager_gym_id]
      : (role === 'trainer' || (role === 'staff' && resolvedEmployment === 'part_time')) ? gymIdsToAssign : []

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
    const {
      userId, full_name, email, phone, role, is_active,
      date_of_birth, date_of_joining, date_of_departure, departure_reason,
      probation_end_date, probation_passed, leave_carry_forward_days,
      commission_signup_pct, commission_session_pct,
      gym_ids, gym_id, manager_gym_id, reset_login, is_also_trainer,
      employment_type: bodyEmploymentType,
    } = body

    const adminClient = createAdminClient()
    const isSelf       = userId === user.id
    const isBizOps     = currentUser?.role === 'business_ops'
    const isManager    = currentUser?.role === 'manager'
    const isAdmin      = currentUser?.role === 'admin'

    // ── Access guard ─────────────────────────────────────────
    // Business Ops: full access to all staff records across all gyms.
    // Admin: basic fields only (name, email, phone, status) — used by admin/staff page
    //   to manage Biz Ops accounts.
    // Manager: can edit trainers assigned to their own gym (commission only).
    // Any user: can edit their own record (basic details only — see payload below).
    // Everyone else: forbidden.
    if (!isBizOps && !isSelf && !isAdmin) {
      if (isManager) {
        const { data: gymCheck } = await serverClient
          .from('trainer_gyms').select('trainer_id')
          .eq('trainer_id', userId).eq('gym_id', currentUser.manager_gym_id || '').single()
        if (!gymCheck) return NextResponse.json({ error: 'Forbidden — trainer not in your gym' }, { status: 403 })
      } else {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    // ── Auth update (email / display name) ───────────────────
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

    // ── User record update ───────────────────────────────────
    const updatePayload: any = {}

    // Fields any user can update on their own record
    if (full_name !== undefined) updatePayload.full_name = full_name
    if (email !== undefined)     updatePayload.email = email
    if (phone !== undefined)     updatePayload.phone = phone || null
    if (body.address !== undefined) updatePayload.address = body.address || null

    // Business Ops: full staff record management
    if (isBizOps) {
      if (role !== undefined)                    updatePayload.role = role
      if (is_active !== undefined)               updatePayload.is_active = is_active
      if (is_also_trainer !== undefined)         updatePayload.is_also_trainer = is_also_trainer
      if (bodyEmploymentType !== undefined)      updatePayload.employment_type = bodyEmploymentType
      if (commission_signup_pct !== undefined)   updatePayload.commission_signup_pct = parseFloat(commission_signup_pct)
      if (commission_session_pct !== undefined)  updatePayload.commission_session_pct = parseFloat(commission_session_pct)
      if (body.membership_commission_sgd !== undefined) updatePayload.membership_commission_sgd = parseFloat(body.membership_commission_sgd)
      if (body.leave_entitlement_days !== undefined)    updatePayload.leave_entitlement_days = parseInt(body.leave_entitlement_days)
      if (body.hourly_rate !== undefined)        updatePayload.hourly_rate = body.hourly_rate ? parseFloat(body.hourly_rate) : null
      if (body.nric !== undefined)               updatePayload.nric = body.nric || null
      if (body.nationality !== undefined)        updatePayload.nationality = body.nationality || null
      if (body.address !== undefined)            updatePayload.address = body.address || null
      if (body.date_of_birth !== undefined)      updatePayload.date_of_birth = body.date_of_birth || null
      if (body.date_of_joining !== undefined)    updatePayload.date_of_joining = body.date_of_joining || null
      if (body.date_of_departure !== undefined) {
        updatePayload.date_of_departure = body.date_of_departure || null
        // Auto-reject all pending leave applications when departure date is set
        if (body.date_of_departure) {
          await adminClient.from('leave_applications')
            .update({
              status: 'rejected',
              rejection_reason: 'Staff departure — auto-rejected by system',
              rejected_at: new Date().toISOString(),
            })
            .eq('user_id', userId)
            .eq('status', 'pending')
        }
      }
      if (body.departure_reason !== undefined)   updatePayload.departure_reason = body.departure_reason || null
      if (probation_end_date !== undefined)      updatePayload.probation_end_date = probation_end_date || null
      if (body.offboarding_completed_at !== undefined) updatePayload.offboarding_completed_at = body.offboarding_completed_at || null
      if (probation_passed !== undefined)        updatePayload.probation_passed_at = probation_passed ? new Date().toISOString() : null
      if (leave_carry_forward_days !== undefined) updatePayload.leave_carry_forward_days = parseInt(leave_carry_forward_days) || 0
      // manager_gym_id: written for all roles so the DB stays consistent
      // with the gym dropdown selection regardless of role
      if (manager_gym_id !== undefined)          updatePayload.manager_gym_id = manager_gym_id || null
    }

    // Admin: basic fields for managing Biz Ops accounts.
    // Gym assignment and role changes remain Biz Ops only.
    if (isAdmin) {
      if (is_active !== undefined)                   updatePayload.is_active = is_active
      if (body.date_of_joining !== undefined)        updatePayload.date_of_joining = body.date_of_joining || null
      if (body.nric !== undefined)                   updatePayload.nric = body.nric || null
      if (body.nationality !== undefined)            updatePayload.nationality = body.nationality || null
      if (body.address !== undefined)                updatePayload.address = body.address || null
      if (body.date_of_birth !== undefined)          updatePayload.date_of_birth = body.date_of_birth || null
      if (body.leave_entitlement_days !== undefined) updatePayload.leave_entitlement_days = body.leave_entitlement_days ? parseInt(body.leave_entitlement_days) : null
    }

    // Manager: can update commission rates for trainers in their gym
    if (isManager) {
      if (commission_signup_pct !== undefined)   updatePayload.commission_signup_pct = parseFloat(commission_signup_pct)
      if (commission_session_pct !== undefined)  updatePayload.commission_session_pct = parseFloat(commission_session_pct)
    }

    if (Object.keys(updatePayload).length > 0) {
      const { error } = await adminClient.from('users').update(updatePayload).eq('id', userId)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // ── Gym assignment (Business Ops and Manager) ────────────
    // Full-time staff (all roles): gym_id single dropdown → one trainer_gyms row.
    // Part-time ops staff: gym_ids multi-select → multiple trainer_gyms rows
    //   (they can be rostered at any gym and paid per gym per month).
    // Manager: can assign gym but only within their own gym.
    if ((isBizOps || isManager) && (gym_id !== undefined || gym_ids !== undefined)) {
      const targetEmployment = bodyEmploymentType
        ?? (await adminClient.from('users').select('employment_type').eq('id', userId).single()).data?.employment_type

      let idsToAssign: string[] = []
      if (targetEmployment === 'part_time' && gym_ids !== undefined) {
        // Part-time ops staff: multi-gym from checkboxes
        // Manager: filter to only their own gym for security
        idsToAssign = isManager && currentUser?.manager_gym_id
          ? gym_ids.filter((id: string) => id === currentUser.manager_gym_id)
          : gym_ids
      } else if (gym_id) {
        // Full-time staff: single gym from dropdown
        idsToAssign = [gym_id]
      }

      // Always delete existing assignments first (clean slate), then re-insert.
      await adminClient.from('trainer_gyms').delete().eq('trainer_id', userId)
      if (idsToAssign.length > 0) {
        const { error: gymErr } = await adminClient.from('trainer_gyms').insert(
          idsToAssign.map((gymId: string, idx: number) => ({
            trainer_id: userId, gym_id: gymId, is_primary: idx === 0,
          }))
        )
        if (gymErr) return NextResponse.json({ error: `Gym assignment failed: ${gymErr.message}` }, { status: 400 })
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
