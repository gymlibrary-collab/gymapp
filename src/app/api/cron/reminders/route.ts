import { NextRequest } from 'next/server'
import { runCron } from '@/lib/cron'

export async function GET(request: NextRequest) {
  return runCron(request, 'reminders', 'reminder', async (supabase) => {
    const { data: clientConfig } = await supabase.from('whatsapp_notifications_config')
      .select('is_enabled').eq('id', 'pt_reminder_client_24h').maybeSingle()
    if (!clientConfig?.is_enabled)
      return { sent: 0, message: 'Reminders disabled in WhatsApp config' }

    const { data: templateData } = await supabase.from('whatsapp_templates')
      .select('template').eq('notification_type', 'pt_reminder_client_24h').eq('is_active', true).maybeSingle()
    if (!templateData?.template) throw new Error('pt_reminder_client_24h template not found or inactive')

    const { data: queue, error: queueErr } = await supabase.from('session_reminder_members_list')
      .select('*').eq('reminder_sent', false).eq('reminder_failed', false)
    if (queueErr) throw new Error(`Queue fetch error: ${queueErr.message}`)
    if (!queue || queue.length === 0) return { sent: 0, message: 'No reminders in queue' }

    const nowSgt = new Date(new Date().getTime() + 8 * 60 * 60 * 1000)
    const todayStr = nowSgt.toISOString().split('T')[0]

    const twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    let sentCount = 0, skippedCount = 0
    const logs: any[] = []

    for (const row of queue) {
      const { data: session } = await supabase.from('sessions').select('status').eq('id', row.session_id).maybeSingle()
      if (session?.status !== 'scheduled') { skippedCount++; continue }

      const message = templateData.template.replace(/\{\{(\w+)\}\}/g, (_: string, key: string) =>
        ({ member_name: row.member_name, trainer_nickname: row.trainer_nickname, session_date: row.session_date, session_time: row.session_time, gym_name: row.gym_name } as any)[key] || `{{${key}}}`
      )

      try {
        const phone = row.member_phone.replace(/\s/g, '')
        const msg = await twilioClient.messages.create({ from: process.env.TWILIO_WHATSAPP_FROM, to: `whatsapp:${phone}`, body: message })
        await supabase.from('session_reminder_members_list').update({ reminder_sent: true }).eq('id', row.id)
        logs.push({ session_id: row.session_id, recipient_type: 'client', recipient_phone: phone, message, status: 'sent', twilio_sid: msg.sid })
        sentCount++
      } catch (err: any) {
        await supabase.from('session_reminder_members_list').update({ reminder_failed: true }).eq('id', row.id)
        logs.push({ session_id: row.session_id, recipient_type: 'client', recipient_phone: row.member_phone, message, status: 'failed', error_message: err.message })
      }
    }

    if (logs.length > 0) await supabase.from('whatsapp_logs').insert(logs)
    return { date_sgt: todayStr, queue_size: queue.length, sent: sentCount, skipped_cancelled: skippedCount, failed: queue.length - sentCount - skippedCount }
  })
}
