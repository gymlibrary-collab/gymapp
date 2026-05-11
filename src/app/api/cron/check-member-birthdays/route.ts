import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

// ============================================================
// /api/cron/check-member-birthdays
//
// PURPOSE:
//   Pre-computes members with birthdays today and stores them
//   in member_birthday_reminders. Two row types per member:
//     1. Gym-wide row (trainer_id = NULL) — manager/staff/trainer dashboard
//     2. Trainer row (trainer_id = uuid)  — PT Sessions page notification
//
// SECONDARY MEMBERS:
//   Members who share a PT package as secondary_member are
//   linked to a trainer via packages.secondary_member_id.
//   Both primary and secondary birthday members get trainer rows.
//
// SCHEDULE:
//   Runs daily at 0001 SGT (1701 UTC previous day).
//   Registered in vercel.json:
//     { "path": "/api/cron/check-member-birthdays", "schedule": "1 17 * * *" }
//
// STRATEGY:
//   Truncate + re-insert. Brief empty window acceptable.
//
// TIMEZONE:
//   All date calculations in SGT (UTC+8).
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
  const todayStr = todaySgt.toISOString().split('T')[0]
  const todayMonth = todaySgt.getMonth() + 1  // 1-12
  const todayDay = todaySgt.getDate()          // 1-31

  // ── Step 1: Fetch all active members with date_of_birth ──
  const { data: allMembers, error: membersErr } = await supabase
    .from('members')
    .select('id, full_name, date_of_birth, gym_id, gym:gyms(name)')
    .eq('status', 'active')
    .not('date_of_birth', 'is', null)

  if (membersErr) {
    console.error('[cron/check-member-birthdays] Members fetch error:', membersErr)
    return NextResponse.json({ ok: false, error: membersErr.message }, { status: 500 })
  }

  // Filter to today's birthdays (SGT month/day comparison)
  const birthdayMembers = (allMembers || []).filter((m: any) => {
    const dob = new Date(m.date_of_birth)
    return dob.getUTCMonth() + 1 === todayMonth && dob.getUTCDate() === todayDay
  })

  // ── Truncate existing rows ────────────────────────────────
  const { error: truncateErr } = await supabase
    .from('member_birthday_reminders')
    .delete()
    .eq('birthday_date', todayStr)  // only delete today's rows

  // Also clear any stale rows from previous days
  const { error: staleErr } = await supabase
    .from('member_birthday_reminders')
    .delete()
    .lt('birthday_date', todayStr)

  if (truncateErr || staleErr) {
    console.error('[cron/check-member-birthdays] Delete error:', truncateErr || staleErr)
    return NextResponse.json({ ok: false, error: (truncateErr || staleErr)?.message }, { status: 500 })
  }

  if (birthdayMembers.length === 0) {
    console.log(`[cron/check-member-birthdays] No member birthdays today (${todayStr} SGT)`)
    return NextResponse.json({ ok: true, date_sgt: todayStr, birthdays_found: 0, members: [] })
  }

  const birthdayMemberIds = birthdayMembers.map((m: any) => m.id)

  // ── Step 2: Find trainer associations ─────────────────────
  // Primary members: member_id IN birthdayMemberIds
  const { data: primaryPkgs } = await supabase
    .from('packages')
    .select('member_id, trainer_id, trainer:users!packages_trainer_id_fkey(id, full_name)')
    .in('member_id', birthdayMemberIds)
    .eq('status', 'active')
    .not('trainer_id', 'is', null)

  // Secondary members: secondary_member_id IN birthdayMemberIds
  const { data: secondaryPkgs } = await supabase
    .from('packages')
    .select('secondary_member_id, trainer_id, trainer:users!packages_trainer_id_fkey(id, full_name)')
    .in('secondary_member_id', birthdayMemberIds)
    .eq('status', 'active')
    .eq('is_shared', true)
    .not('trainer_id', 'is', null)

  // Build member → Set<trainer_id> map (deduplicates multiple packages same trainer)
  const memberTrainerMap: Record<string, Map<string, string>> = {}
  birthdayMemberIds.forEach((id: string) => { memberTrainerMap[id] = new Map() })

  primaryPkgs?.forEach((p: any) => {
    if (p.trainer_id) memberTrainerMap[p.member_id]?.set(p.trainer_id, (p.trainer as any)?.full_name || '')
  })
  secondaryPkgs?.forEach((p: any) => {
    if (p.trainer_id) memberTrainerMap[p.secondary_member_id]?.set(p.trainer_id, (p.trainer as any)?.full_name || '')
  })

  // ── Step 3: Build rows ────────────────────────────────────
  const rows: any[] = []

  for (const member of birthdayMembers) {
    const dob = new Date(member.date_of_birth)
    const age = todaySgt.getFullYear() - dob.getUTCFullYear()
    const gymId = member.gym_id
    const gymName = (member.gym as any)?.name || null

    if (!gymId) continue  // skip members with no gym assigned

    // Gym-wide row — manager, staff, trainer dashboard (all gym members)
    rows.push({
      member_id: member.id,
      trainer_id: null,
      full_name: member.full_name,
      gym_id: gymId,
      gym_name: gymName,
      date_of_birth: member.date_of_birth,
      age,
      birthday_date: todayStr,
      trainer_names: Array.from(memberTrainerMap[member.id].values()).filter(Boolean).join(', ') || null,
      refreshed_at: nowUtc.toISOString(),
    })

    // Trainer rows — one per active trainer association
    for (const [trainerId, trainerName] of Array.from(memberTrainerMap[member.id].entries())) {
      rows.push({
        member_id: member.id,
        trainer_id: trainerId,
        full_name: member.full_name,
        gym_id: gymId,
        gym_name: gymName,
        date_of_birth: member.date_of_birth,
        age,
        birthday_date: todayStr,
        trainer_names: trainerName || null,
        refreshed_at: nowUtc.toISOString(),
      })
    }
  }

  // ── Step 4: Insert all rows ───────────────────────────────
  if (rows.length > 0) {
    const { error: insertErr } = await supabase
      .from('member_birthday_reminders')
      .insert(rows)

    if (insertErr) {
      console.error('[cron/check-member-birthdays] Insert error:', insertErr)
      return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 })
    }
  }

  const gymWideCount = rows.filter(r => r.trainer_id === null).length
  const trainerRowCount = rows.filter(r => r.trainer_id !== null).length
  console.log(`[cron/check-member-birthdays] ${gymWideCount} birthday members, ${trainerRowCount} trainer rows (${todayStr} SGT)`)

  return NextResponse.json({
    ok: true,
    date_sgt: todayStr,
    birthdays_found: gymWideCount,
    trainer_rows: trainerRowCount,
    members: birthdayMembers.map((m: any) => ({
      name: m.full_name,
      age: todaySgt.getFullYear() - new Date(m.date_of_birth).getUTCFullYear(),
      gym: (m.gym as any)?.name,
      trainers: Array.from(memberTrainerMap[m.id]).length,
    })),
  })
}