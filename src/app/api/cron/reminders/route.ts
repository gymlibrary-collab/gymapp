import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

// ============================================================
// /api/cron/reminders
//
// PURPOSE:
//   Runs at 0800 SGT daily. Reads session_reminder_members_list
//   (pre-populated at 0600 by /api/cron/prepare-reminders) and
//   sends WhatsApp reminders to members with scheduled PT sessions
//   today (i.e. tomorrow from when the list was prepared).
//
//   Uses the pt_reminder_client_24h template from whatsapp_templates
//   so biz-ops can configure the message in the portal.
//
//   Re-verifies session status before sending — skips cancelled sessions.
//   Trainer reminders removed — member only.
//
// SCHEDULE:
//   0800 SGT = 0000 UTC
//   Registered in vercel.json: { "schedule": "0 0 * * *" }
//
// FALLBACK:
//   If session_reminder_members_list is empty (0600 cron failed),
//   logs the failure and returns — no direct session query fallback
//   to keep the logic simple and predictable.
// ============================================================

function replacePlaceholders(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] || `{{${key}}}`)
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const startedAt = new Date()

  // Log start
  const { data: logRow } = await supabase.from('cron_logs').insert({
    cron_name: 'reminders',
    source: 'reminder',
    run_by: 'scheduled',
    started_at: startedAt.toISOString(),
    status: 'running',
  }).select('id').single()
  const logId = logRow?.id

  try {
    // ── Check reminder is enabled ─────────────────────────────
    const { data: clientConfig } = await supabase
      .from('whatsapp_notifications_config')
      .select('is_enabled').eq('id', 'pt_reminder_client_24h').single()

    if (!clientConfig?.is_enabled) {
      const result = { ok: true, sent: 0, message: 'Reminders disabled in WhatsApp config' }
      if (logId) await supabase.from('cron_logs').update({
        ended_at: new Date().toISOString(),
        duration_ms: new Date().getTime() - startedAt.getTime(),
        status: 'success', result,
      }).eq('id', logId)
      return NextResponse.json(result)
    }

    // ── Load template ─────────────────────────────────────────
    const { data: templateData } = await supabase
      .from('whatsapp_templates')
      .select('template')
      .eq('notification_type', 'pt_reminder_client_24h')
      .eq('is_active', true)
      .single()

    if (!templateData?.template) {
      throw new Error('pt_reminder_client_24h template not found or inactive')
    }

    // ── Load today's reminder queue ───────────────────────────
    const { data: queue, error: queueErr } = await supabase
      .from('session_reminder_members_list')
      .select('*')
      .eq('reminder_sent', false)
      .eq('reminder_failed', false)

    if (queueErr) throw new Error(`Queue fetch error: ${queueErr.message}`)

    if (!queue || queue.length === 0) {
      const result = { ok: true, sent: 0, message: 'No reminders in queue (prepare-reminders may not have run)' }
      if (logId) await supabase.from('cron_logs').update({
        ended_at: new Date().toISOString(),
        duration_ms: new Date().getTime() - startedAt.getTime(),
        status: 'success', result,
      }).eq('id', logId)
      return NextResponse.json(result)
    }

    // ── Verify today's date matches queue ─────────────────────
    // created_at should be today — warn if queue is stale
    const nowSgt = new Date(new Date().getTime() + 8 * 60 * 60 * 1000)
    const todayStr = nowSgt.toISOString().split('T')[0]
    const queueDate = new Date(queue[0].created_at)
    const queueDateStr = new Date(queueDate.getTime() + 8 * 60 * 60 * 1000).toISOString().split('T')[0]
    if (queueDateStr !== todayStr) {
      console.warn(`[cron/reminders] Queue date ${queueDateStr} does not match today ${todayStr} — proceeding anyway`)
    }

    const twilioClient = require('twilio')(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    )

    let sentCount = 0
    let skippedCount = 0
    const logs: any[] = []

    for (const row of queue) {
      // ── Re-verify session is still scheduled ─────────────────
      const { data: session } = await supabase
        .from('sessions')
        .select('status')
        .eq('id', row.session_id)
        .single()

      if (session?.status !== 'scheduled') {
        skippedCount++
        console.log(`[cron/reminders] Skipping session ${row.session_id} — status: ${session?.status}`)
        continue
      }

      // ── Build message from template ───────────────────────────
      const message = replacePlaceholders(templateData.template, {
        member_name: row.member_name,
        trainer_nickname: row.trainer_nickname,
        session_date: row.session_date,
        session_time: row.session_time,
        gym_name: row.gym_name,
      })

      // ── Send WhatsApp ─────────────────────────────────────────
      try {
        const phone = row.member_phone.replace(/\s/g, '')
        const msg = await twilioClient.messages.create({
          from: process.env.TWILIO_WHATSAPP_FROM,
          to: `whatsapp:${phone}`,
          body: message,
        })

        await supabase.from('session_reminder_members_list')
          .update({ reminder_sent: true })
          .eq('id', row.id)

        logs.push({
          session_id: row.session_id,
          recipient_type: 'client',
          recipient_phone: phone,
          message,
          status: 'sent',
          twilio_sid: msg.sid,
        })
        sentCount++

      } catch (err: any) {
        await supabase.from('session_reminder_members_list')
          .update({ reminder_failed: true })
          .eq('id', row.id)

        logs.push({
          session_id: row.session_id,
          recipient_type: 'client',
          recipient_phone: row.member_phone,
          message,
          status: 'failed',
          error_message: err.message,
        })
        console.error(`[cron/reminders] Failed to send to ${row.member_phone}:`, err.message)
      }
    }

    // ── Save WhatsApp logs ────────────────────────────────────
    if (logs.length > 0) {
      await supabase.from('whatsapp_logs').insert(logs)
    }

    const endedAt = new Date()
    const result = {
      ok: true,
      date_sgt: todayStr,
      queue_size: queue.length,
      sent: sentCount,
      skipped_cancelled: skippedCount,
      failed: queue.length - sentCount - skippedCount,
    }

    if (logId) {
      await supabase.from('cron_logs').update({
        ended_at: endedAt.toISOString(),
        duration_ms: endedAt.getTime() - startedAt.getTime(),
        status: 'success',
        result,
      }).eq('id', logId)
    }

    console.log(`[cron/reminders] Sent ${sentCount}/${queue.length} reminders`)
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
    console.error('[cron/reminders] Error:', err.message)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
