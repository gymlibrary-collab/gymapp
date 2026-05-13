import { createClient } from '@/lib/supabase-browser'

// ── WhatsApp notification build status ───────────────────────
// The following touchpoints have their toggle on the config page
// but the sending logic has NOT yet been built in application code.
// Enabling the toggle will have no effect until a developer
// implements the trigger at the relevant event point.
//
// NOT YET BUILT:
//   - leave_submitted          (staff submits leave → manager)
//   - membership_sale_submitted (sale logged → manager)
//   - pt_package_submitted     (package sale → manager)
//   - birthday_member          (daily birthday greeting → member)
//   - escalation_leave         (leave escalated → Biz Ops)
//   - escalation_membership    (membership escalated → Biz Ops)
//   - escalation_pt_package    (PT package escalated → Biz Ops)
//   - escalation_pt_session    (PT session escalated → Biz Ops)
//
// BUILT AND GATED (isWhatsAppEnabled check in place):
//   - pt_reminder_trainer_24h  (api/reminders/route.ts)
//   - pt_reminder_client_24h   (api/reminders/route.ts)
//   - manager_note_alert       (pt/sessions/[id]/notes/page.tsx)
//   - session_note_member_confirm (pt/sessions/[id]/notes/page.tsx)
//   - leave_approved           (hr/leave/page.tsx)
//   - leave_rejected           (hr/leave/page.tsx)
// ─────────────────────────────────────────────────────────────

/**
 * Fetch a WhatsApp template by notification_type and render it
 * with the provided placeholder values.
 * Falls back to the fallbackMessage if the template is not found or inactive.
 */
export async function renderWhatsAppTemplate(
  notificationType: string,
  placeholders: Record<string, string>,
  fallbackMessage: string
): Promise<string> {
  try {
    const supabase = createClient()
    const { data } = await supabase
      .from('whatsapp_templates')
      .select('template, is_active')
      .eq('notification_type', notificationType)
      .eq('is_active', true)
      .maybeSingle()

    if (!data?.template) return fallbackMessage

    let message = data.template
    Object.entries(placeholders).forEach(([key, value]) => {
      message = message.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || '')
    })
    return message
  } catch {
    return fallbackMessage
  }
}

/**
 * Check whether a WhatsApp notification type is enabled in
 * whatsapp_notifications_config. Returns false if not found
 * or if the table doesn't exist yet.
 * Always call this before inserting into whatsapp_queue.
 */
export async function isWhatsAppEnabled(
  supabase: any,
  notificationType: string
): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('whatsapp_notifications_config')
      .select('is_enabled')
      .eq('id', notificationType)
      .maybeSingle()
    return data?.is_enabled === true
  } catch {
    return false
  }
}

/**
 * Central WhatsApp queue helper.
 * Checks isWhatsAppEnabled, renders the template, and inserts into
 * whatsapp_queue in one call. Returns true if queued, false if skipped.
 *
 * Usage:
 *   await queueWhatsApp(supabase, {
 *     notificationType: 'leave_approved',
 *     phone: applicant.phone,
 *     name: applicant.full_name,
 *     placeholders: { staff_name: '...', leave_dates: '...' },
 *     fallbackMessage: 'Your leave has been approved.',
 *     relatedId: leave.id,
 *   })
 */
export async function queueWhatsApp(
  supabase: any,
  opts: {
    notificationType: string
    phone: string | null | undefined
    name?: string | null
    placeholders: Record<string, string>
    fallbackMessage: string
    relatedId?: string | null
    scheduledFor?: string
  }
): Promise<boolean> {
  const { notificationType, phone, name, placeholders, fallbackMessage, relatedId, scheduledFor } = opts
  if (!phone) return false
  try {
    const enabled = await isWhatsAppEnabled(supabase, notificationType)
    if (!enabled) return false
    const message = await renderWhatsAppTemplate(notificationType, placeholders, fallbackMessage)
    await supabase.from('whatsapp_queue').insert({
      notification_type: notificationType,
      recipient_phone: phone,
      recipient_name: name || null,
      message,
      related_id: relatedId || null,
      scheduled_for: scheduledFor || new Date().toISOString(),
      status: 'pending',
    })
    return true
  } catch {
    return false
  }
}
