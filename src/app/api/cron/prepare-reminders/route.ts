import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

// ============================================================
// /api/cron/prepare-reminders
//
// PURPOSE:
//   Runs at 0600 SGT daily. Truncates session_reminder_members_list
//   then populates it with all scheduled PT sessions for tomorrow.
//   The 0800 reminders cron reads this table to send WhatsApp.
//
// SCHEDULE:
//   0600 SGT = 2200 UTC previous day
//   Registered in vercel.json: { "schedule": "0 22 * * *" }
//
// TIMEZONE: All date calculations in SGT (UTC+8)
// ============================================================

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const startedAt = new Date()

  // Log start
  const { data: logRow } = await supabase.from('cron_logs').insert({
    cron_name: 'prepare-reminders',
    source: 'reminder',
    run_by: 'scheduled',
    started_at: startedAt.toISOString(),
    status: 'running',
  }).select('id').single()
  const logId = logRow?.id

  try {
    // ── Calculate tomorrow's date range in SGT ────────────────
    const nowUtc = new Date()
    const nowSgt = new Date(nowUtc.getTime() + 8 * 60 * 60 * 1000)
    const tomorrowSgt = new Date(nowSgt)
    tomorrowSgt.setDate(tomorrowSgt.getDate() + 1)
    const tomorrowStr = tomorrowSgt.toISOString().split('T')[0]
    const tomorrowStart = `${tomorrowStr}T00:00:00+08:00`
    const tomorrowEnd = `${tomorrowStr}T23:59:59+08:00`

    // ── Truncate existing rows ────────────────────────────────
    await supabase.from('session_reminder_members_list')
      .delete().gte('created_at', '2000-01-01')  // delete all rows

    // ── Fetch tomorrow's scheduled sessions ───────────────────
    const { data: sessions, error: sessErr } = await supabase
      .from('sessions')
      .select(`
        id, scheduled_at, location,
        member:members!sessions_member_id_fkey(full_name, phone),
        trainer:users!sessions_trainer_id_fkey(full_name, nickname),
        gym:gyms!sessions_gym_id_fkey(name)
      `)
      .eq('status', 'scheduled')
      .gte('scheduled_at', tomorrowStart)
      .lte('scheduled_at', tomorrowEnd)
      .order('scheduled_at')

    if (sessErr) throw new Error(`Sessions fetch error: ${sessErr.message}`)

    // ── Build reminder rows ───────────────────────────────────
    const rows: any[] = []
    for (const s of sessions || []) {
      const member = s.member as any
      const trainer = s.trainer as any
      const gym = s.gym as any

      if (!member?.phone) continue  // skip members with no phone

      // Format session date and time in SGT
      const sessionDt = new Date(s.scheduled_at)
      const sessionDateStr = sessionDt.toLocaleDateString('en-SG', {
        timeZone: 'Asia/Singapore',
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
      })
      const sessionTimeStr = sessionDt.toLocaleTimeString('en-SG', {
        timeZone: 'Asia/Singapore',
        hour: '2-digit', minute: '2-digit', hour12: true
      })

      rows.push({
        session_id: s.id,
        member_name: member.full_name,
        member_phone: member.phone,
        trainer_nickname: trainer?.nickname || trainer?.full_name?.split(' ')[0] || 'your trainer',
        session_date: sessionDateStr,
        session_time: sessionTimeStr,
        gym_name: gym?.name || 'the gym',
        reminder_sent: false,
        reminder_failed: false,
        created_at: nowUtc.toISOString(),
      })
    }

    // ── Insert rows ───────────────────────────────────────────
    if (rows.length > 0) {
      const { error: insertErr } = await supabase
        .from('session_reminder_members_list')
        .insert(rows)
      if (insertErr) throw new Error(`Insert error: ${insertErr.message}`)
    }

    const endedAt = new Date()
    const durationMs = endedAt.getTime() - startedAt.getTime()
    const result = {
      ok: true,
      date_sgt: tomorrowStr,
      sessions_found: sessions?.length || 0,
      members_queued: rows.length,
      skipped_no_phone: (sessions?.length || 0) - rows.length,
    }

    if (logId) {
      await supabase.from('cron_logs').update({
        ended_at: endedAt.toISOString(),
        duration_ms: durationMs,
        status: 'success',
        result,
      }).eq('id', logId)
    }

    console.log(`[cron/prepare-reminders] ${rows.length} members queued for ${tomorrowStr}`)
    return NextResponse.json(result)

  } catch (err: any) {
    const endedAt = new Date()
    if (logId) {
      await supabase.from('cron_logs').update({
        ended_at: endedAt.toISOString(),
        duration_ms: endedAt.getTime() - startedAt.getTime(),
        status: 'error',
        error: err.message,
      }).eq('id', logId)
    }
    console.error('[cron/prepare-reminders] Error:', err.message)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
