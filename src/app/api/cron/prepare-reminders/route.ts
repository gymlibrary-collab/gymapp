import { nowSGT } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { runCron } from '@/lib/cron'

export async function GET(request: NextRequest) {
  return runCron(request, 'prepare-reminders', 'reminder', async (supabase) => {
    const nowUtc = nowSGT() // SGT — renamed for backwards compat
    const nowSgt = new Date(nowUtc.getTime() + 8 * 60 * 60 * 1000)
    const tomorrowSgt = new Date(nowSgt)
    tomorrowSgt.setUTCDate(tomorrowSgt.getUTCDate() + 1)
    const tomorrowStr = `${tomorrowSgt.getUTCFullYear()}-${String(tomorrowSgt.getUTCMonth()+1).padStart(2,'0')}-${String(tomorrowSgt.getUTCDate()).padStart(2,'0')}`
    const tomorrowStart = `${tomorrowStr}T00:00:00+08:00`
    const tomorrowEnd = `${tomorrowStr}T23:59:59+08:00`

    await supabase.from('session_reminder_members_list')
      .delete().gte('created_at', '2000-01-01')

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

    const rows: any[] = []
    for (const s of sessions || []) {
      const member = s.member as any
      const trainer = s.trainer as any
      const gym = s.gym as any
      if (!member?.phone) continue
      const sessionDt = new Date(s.scheduled_at)
      const sessionDateStr = sessionDt.toLocaleDateString('en-SG', { timeZone: 'Asia/Singapore', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
      const sessionTimeStr = sessionDt.toLocaleTimeString('en-SG', { timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', hour12: true })
      rows.push({
        session_id: s.id, member_name: member.full_name, member_phone: member.phone,
        trainer_nickname: trainer?.nickname || trainer?.full_name?.split(' ')[0] || 'your trainer',
        session_date: sessionDateStr, session_time: sessionTimeStr,
        gym_name: gym?.name || 'the gym', reminder_sent: false, reminder_failed: false,
        created_at: nowUtc.toISOString(),
      })
    }

    if (rows.length > 0) {
      const { error: insertErr } = await supabase.from('session_reminder_members_list').insert(rows)
      if (insertErr) throw new Error(`Insert error: ${insertErr.message}`)
    }

    return { date_sgt: tomorrowStr, sessions_found: sessions?.length || 0, members_queued: rows.length, skipped_no_phone: (sessions?.length || 0) - rows.length }
  })
}
