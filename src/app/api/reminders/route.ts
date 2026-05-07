import { createAdminClient } from '@/lib/supabase-server'
import { formatWhatsAppReminder } from '@/lib/utils'
import { NextResponse } from 'next/server'

// This route is called by a cron job (e.g. Vercel Cron or external scheduler)
// Set up in vercel.json: runs daily at 8am SGT (00:00 UTC)
export async function GET(request: Request) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Check if reminder notifications are enabled before processing
  const { data: clientConfig } = await supabase.from('whatsapp_notifications_config')
    .select('is_enabled').eq('id', 'pt_reminder_client_24h').single()
  const { data: trainerConfig } = await supabase.from('whatsapp_notifications_config')
    .select('is_enabled').eq('id', 'pt_reminder_trainer_24h').single()
  const clientEnabled = clientConfig?.is_enabled === true
  const trainerEnabled = trainerConfig?.is_enabled === true

  if (!clientEnabled && !trainerEnabled) {
    return NextResponse.json({ sent: 0, message: 'Reminders disabled in WhatsApp notification config' })
  }

  const now = new Date()
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const windowStart = new Date(in24h.getTime() - 30 * 60 * 1000) // 30min window
  const windowEnd = new Date(in24h.getTime() + 30 * 60 * 1000)

  // Find sessions in the next 24h that haven't been reminded
  const { data: sessions } = await supabase
    .from('sessions')
    .select('*, clients(full_name, phone), users(full_name, phone), gyms(name)')
    .eq('status', 'scheduled')
    .eq('reminder_24h_sent', false)
    .gte('scheduled_at', windowStart.toISOString())
    .lte('scheduled_at', windowEnd.toISOString())

  if (!sessions || sessions.length === 0) {
    return NextResponse.json({ sent: 0, message: 'No reminders to send' })
  }

  const twilioClient = require('twilio')(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  )

  let sentCount = 0
  const logs = []

  for (const session of sessions) {
    const { clientMessage, trainerMessage } = formatWhatsAppReminder({
      clientName: session.clients?.full_name || 'Client',
      trainerName: session.users?.full_name || 'Trainer',
      scheduledAt: session.scheduled_at,
      location: session.location,
      gymName: session.gyms?.name || 'the gym',
    })

    // Send to client
    if (session.clients?.phone && clientEnabled) {
      try {
        const clientPhone = session.clients.phone.replace(/\s/g, '')
        const msg = await twilioClient.messages.create({
          from: process.env.TWILIO_WHATSAPP_FROM,
          to: `whatsapp:${clientPhone}`,
          body: clientMessage,
        })
        logs.push({ session_id: session.id, recipient_type: 'client', recipient_phone: clientPhone, message: clientMessage, status: 'sent', twilio_sid: msg.sid })
        sentCount++
      } catch (err: any) {
        logs.push({ session_id: session.id, recipient_type: 'client', recipient_phone: session.clients.phone, message: clientMessage, status: 'failed' })
      }
    }

    // Send to trainer
    if (session.users?.phone && trainerEnabled) {
      try {
        const trainerPhone = session.users.phone.replace(/\s/g, '')
        const msg = await twilioClient.messages.create({
          from: process.env.TWILIO_WHATSAPP_FROM,
          to: `whatsapp:${trainerPhone}`,
          body: trainerMessage,
        })
        logs.push({ session_id: session.id, recipient_type: 'trainer', recipient_phone: trainerPhone, message: trainerMessage, status: 'sent', twilio_sid: msg.sid })
        sentCount++
      } catch (err: any) {
        logs.push({ session_id: session.id, recipient_type: 'trainer', recipient_phone: session.users.phone, message: trainerMessage, status: 'failed' })
      }
    }

    // Mark session as reminded
    await supabase.from('sessions').update({
      reminder_24h_sent: true,
      reminder_24h_sent_at: new Date().toISOString(),
    }).eq('id', session.id)
  }

  // Save logs
  if (logs.length > 0) {
    await supabase.from('whatsapp_logs').insert(logs)
  }

  return NextResponse.json({ sent: sentCount, sessions: sessions.length })
}
