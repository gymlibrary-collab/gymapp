import { NextRequest } from 'next/server'
import { runCron } from '@/lib/cron'


export async function GET(request: NextRequest) {
  return runCron(request, 'escalate-expiring-memberships', 'daily', async (supabase) => {

    const now = new Date()
    const { data: settings } = await supabase.from('app_settings')
      .select('escalation_expiring_membership_days').eq('id', 'global').maybeSingle()
    const thresholdDays: number = settings?.escalation_expiring_membership_days ?? 30
    const cutoffDate = new Date(now.getTime() + thresholdDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const { data: expiring, error } = await supabase.from('gym_memberships')
      .update({ escalated_to_manager: true, escalated_at: now.toISOString() })
      .eq('status', 'active').eq('sale_status', 'confirmed').eq('escalated_to_manager', false)
      .lte('end_date', cutoffDate).gte('end_date', now.toISOString().split('T')[0]).select('id')
    if (error) throw new Error(error.message)
    return { threshold_days: thresholdDays, cutoff_date: cutoffDate, escalated: expiring?.length || 0 }
  })
}
