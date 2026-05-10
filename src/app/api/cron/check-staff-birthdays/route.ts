import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

// ============================================================
// /api/cron/check-staff-birthdays
//
// PURPOSE:
//   Pre-computes staff birthdays falling within the next 7 days
//   (inclusive of today) and stores them in staff_birthday_reminders.
//   Dashboard components read this table directly instead of
//   running a live query + client-side date filter on every load.
//
// SCHEDULE:
//   Runs daily at 0050 SGT (1650 UTC previous day) — just before
//   midnight so the table is ready when managers log in at the
//   start of the day.
//   Registered in vercel.json:
//     { "path": "/api/cron/check-staff-birthdays", "schedule": "50 16 * * *" }
//
// STRATEGY:
//   Truncate + re-insert (not upsert). Brief empty window is
//   acceptable — confirmed in requirements.
//
// TIMEZONE:
//   All date calculations in SGT (UTC+8).
//
// YEAR-END ROLLOVER:
//   Handles birthdays spanning Dec → Jan correctly.
//   e.g. on 28 Dec, a birthday on 1 Jan = 4 days away.
//
// SCOPE:
//   Non-archived staff and trainers with date_of_birth set.
//   Managers included (biz-ops sees manager birthdays too).
//   Admin and biz-ops excluded (handled outside system).
//
// SECURITY:
//   Requires CRON_SECRET header.
//   Uses admin client (bypasses RLS) for truncate + insert.
// ============================================================

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // ── Current date in SGT (UTC+8) ──────────────────────────
  const nowUtc = new Date()
  const nowSgt = new Date(nowUtc.getTime() + 8 * 60 * 60 * 1000)
  const todaySgt = new Date(nowSgt.getFullYear(), nowSgt.getMonth(), nowSgt.getDate())

  // ── Fetch all eligible staff ──────────────────────────────
  // Include manager, trainer, staff roles
  // Exclude admin and business_ops (not shown in birthday panel)
  // Exclude archived staff
  const { data: allStaff, error: staffErr } = await supabase
    .from('users')
    .select(`
      id, full_name, role, date_of_birth, is_archived,
      manager_gym_id,
      manager_gym:gyms!users_manager_gym_id_fkey(id, name),
      trainer_gyms(gym_id, gyms(id, name))
    `)
    .in('role', ['manager', 'trainer', 'staff'])
    .eq('is_archived', false)
    .not('date_of_birth', 'is', null)

  if (staffErr) {
    console.error('[cron/refresh-staff-birthdays] Fetch error:', staffErr)
    return NextResponse.json({ ok: false, error: staffErr.message }, { status: 500 })
  }

  // ── Calculate birthdays in next 7 days ───────────────────
  const reminders: any[] = []

  for (const staff of (allStaff || [])) {
    const dob = new Date(staff.date_of_birth)
    const birthMonth = dob.getUTCMonth()  // use UTC to avoid timezone shift on date-only field
    const birthDay = dob.getUTCDate()

    // Birthday this year in SGT
    let birthdayThisYear = new Date(todaySgt.getFullYear(), birthMonth, birthDay)

    // If already passed this year, use next year
    if (birthdayThisYear < todaySgt) {
      birthdayThisYear = new Date(todaySgt.getFullYear() + 1, birthMonth, birthDay)
    }

    // Days until birthday (handles year-end rollover correctly)
    const daysUntil = Math.round(
      (birthdayThisYear.getTime() - todaySgt.getTime()) / (1000 * 60 * 60 * 24)
    )

    // Only include if within next 7 days (0 = today, 7 = one week away)
    if (daysUntil < 0 || daysUntil > 7) continue

    // Resolve gym — manager uses manager_gym_id, trainer uses first trainer_gym
    let gymId: string | null = null
    let gymName: string | null = null

    if (staff.role === 'manager' && staff.manager_gym) {
      gymId = (staff.manager_gym as any).id
      gymName = (staff.manager_gym as any).name
    } else if (staff.role === 'trainer' || staff.role === 'staff') {
      const firstGym = (staff.trainer_gyms as any[])?.[0]
      if (firstGym) {
        gymId = firstGym.gyms?.id || firstGym.gym_id
        gymName = firstGym.gyms?.name || null
      }
      // Full-time staff may use manager_gym_id instead
      if (!gymId && staff.manager_gym_id) {
        gymId = staff.manager_gym_id
        gymName = (staff.manager_gym as any)?.name || null
      }
    }

    reminders.push({
      user_id: staff.id,
      full_name: staff.full_name,
      role: staff.role,
      gym_id: gymId,
      gym_name: gymName,
      date_of_birth: staff.date_of_birth,
      days_until_birthday: daysUntil,
      birthday_date: birthdayThisYear.toISOString().split('T')[0],
      refreshed_at: nowUtc.toISOString(),
    })
  }

  // ── Truncate then re-insert ───────────────────────────────
  const { error: truncateErr } = await supabase
    .from('staff_birthday_reminders')
    .delete()
    .gte('days_until_birthday', 0)  // delete all rows (condition always true)

  if (truncateErr) {
    console.error('[cron/refresh-staff-birthdays] Truncate error:', truncateErr)
    return NextResponse.json({ ok: false, error: truncateErr.message }, { status: 500 })
  }

  if (reminders.length > 0) {
    const { error: insertErr } = await supabase
      .from('staff_birthday_reminders')
      .insert(reminders)

    if (insertErr) {
      console.error('[cron/refresh-staff-birthdays] Insert error:', insertErr)
      return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 })
    }
  }

  console.log(`[cron/refresh-staff-birthdays] ${reminders.length} birthdays in next 7 days (SGT: ${todaySgt.toISOString().split('T')[0]})`)

  return NextResponse.json({
    ok: true,
    date_sgt: todaySgt.toISOString().split('T')[0],
    birthdays_found: reminders.length,
    staff: reminders.map(r => ({
      name: r.full_name,
      days_until: r.days_until_birthday,
      birthday: r.birthday_date,
      gym: r.gym_name,
    })),
  })
}
