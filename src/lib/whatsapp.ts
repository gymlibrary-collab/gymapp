import { createClient } from '@/lib/supabase-browser'

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
      .single()

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
      .single()
    return data?.is_enabled === true
  } catch {
    return false
  }
}
