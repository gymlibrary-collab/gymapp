import { NextRequest } from 'next/server'
import { runCron } from '@/lib/cron'


export async function GET(request: NextRequest) {
  return runCron(request, 'escalate-leave', 'daily', async (supabase) => {

    const now = new Date()
    const { data: settings } = await supabase.from('app_settings')
      .select('escalation_leave_hours').eq('id', 'global').maybeSingle()
    const thresholdHours: number = settings?.escalation_leave_hours ?? 48
    const cutoff = new Date(now.getTime() - thresholdHours * 60 * 60 * 1000).toISOString()
    const { data: eligibleStaff } = await supabase.from('users')
      .select('id').in('role', ['trainer', 'staff']).eq('is_archived', false)
    if (!eligibleStaff || eligibleStaff.length === 0)
      return { ok: true, escalated: 0, message: 'No eligible staff found' }
    const staffIds = eligibleStaff.map((u: any) => u.id)
    const { data: escalated, error } = await supabase.from('leave_applications')
      .update({ escalated_to_biz_ops: true, escalated_at: now.toISOString() })
      .eq('status', 'pending').eq('escalated_to_biz_ops', false)
      .lt('created_at', cutoff).in('user_id', staffIds).select('id, user_id')
    if (error) throw new Error(error.message)
    return { date: now.toISOString().split('T')[0], threshold_hours: thresholdHours, cutoff, escalated: escalated?.length || 0 }
  })
}
