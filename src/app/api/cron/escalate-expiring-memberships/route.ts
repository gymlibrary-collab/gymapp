import { NextRequest } from 'next/server'
import { runCron } from '@/lib/cron'


export async function GET(request: NextRequest) {
  return runCron(request, 'escalate-expiring-memberships', 'daily', async (supabase) => {

    const now = new Date(Date.now() + 8 * 60 * 60 * 1000) // SGT
    const { data: settings } = await supabase.from('app_settings')
      .select('escalation_expiring_membership_days').eq('id', 'global').maybeSingle()
    const thresholdDays: number = settings?.escalation_expiring_membership_days ?? 30
    const cutoffSGT = new Date(now.getTime() + thresholdDays * 24 * 60 * 60 * 1000)
    const cutoffDate = `${cutoffSGT.getUTCFullYear()}-${String(cutoffSGT.getUTCMonth()+1).padStart(2,'0')}-${String(cutoffSGT.getUTCDate()).padStart(2,'0')}`
    const { data: expiring, error } = await supabase.from('gym_memberships')
      .update({ escalated_to_manager: true, escalated_at: now.toISOString() })
      .eq('status', 'active').eq('sale_status', 'confirmed').eq('escalated_to_manager', false)
      .lte('end_date', cutoffDate).gte('end_date', `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,'0')}-${String(now.getUTCDate()).padStart(2,'0')}`).select('id')
    if (error) throw new Error(error.message)
    return { threshold_days: thresholdDays, cutoff_date: cutoffDate, escalated: expiring?.length || 0 }
  })
}
