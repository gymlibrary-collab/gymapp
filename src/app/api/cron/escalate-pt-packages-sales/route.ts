import { NextRequest } from 'next/server'
import { runCron } from '@/lib/cron'


export async function GET(request: NextRequest) {
  return runCron(request, 'escalate-pt-packages-sales', 'daily', async (supabase) => {

    const now = new Date()
    const { data: settings } = await supabase.from('app_settings')
      .select('escalation_pt_package_hours').eq('id', 'global').maybeSingle()
    const thresholdHours: number = settings?.escalation_pt_package_hours ?? 48
    const cutoff = new Date(now.getTime() - thresholdHours * 60 * 60 * 1000).toISOString()
    const { data: escalated, error } = await supabase.from('packages')
      .update({ escalated_to_biz_ops: true, escalated_at: now.toISOString() })
      .eq('manager_confirmed', false).eq('escalated_to_biz_ops', false)
      .neq('status', 'cancelled').lt('created_at', cutoff).select('id')
    if (error) throw new Error(error.message)
    return { threshold_hours: thresholdHours, escalated: escalated?.length || 0 }
  })
}
