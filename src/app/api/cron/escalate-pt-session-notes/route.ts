import { NextRequest } from 'next/server'
import { runCron } from '@/lib/cron'


export async function GET(request: NextRequest) {
  return runCron(request, 'escalate-pt-session-notes', 'daily', async (supabase) => {

    const now = new Date(Date.now() + 8 * 60 * 60 * 1000) // SGT
    const { data: settings } = await supabase.from('app_settings')
      .select('escalation_session_notes_hours').eq('id', 'global').maybeSingle()
    const thresholdHours: number = settings?.escalation_session_notes_hours ?? 48
    const cutoff = new Date(now.getTime() - thresholdHours * 60 * 60 * 1000).toISOString()
    const { data: escalated, error } = await supabase.from('sessions')
      .update({ escalated_to_manager: true, escalated_at: now.toISOString() })
      .eq('status', 'completed').eq('is_notes_complete', false)
      .eq('escalated_to_manager', false).lt('marked_complete_at', cutoff).select('id')
    if (error) throw new Error(error.message)
    return { threshold_hours: thresholdHours, escalated: escalated?.length || 0 }
  })
}
