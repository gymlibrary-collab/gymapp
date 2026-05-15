import { nowSGT } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { runCron } from '@/lib/cron'


export async function GET(request: NextRequest) {
  return runCron(request, 'expire-pt-packages', 'daily', async (supabase) => {

    const today = nowSGT().toISOString().split('T')[0] // SGT
    const { data: expired } = await supabase.from('packages')
      .update({ status: 'expired' }).eq('status', 'active').eq('manager_confirmed', true)
      .lt('end_date', today).select('id, member_id, gym_id')
    const expiredCount = expired?.length || 0
    const { data: completed } = await supabase.from('packages')
      .update({ status: 'completed' }).eq('status', 'active').eq('manager_confirmed', true)
      .filter('sessions_used', 'gte', 'total_sessions').select('id, member_id, gym_id')
    const completedCount = completed?.length || 0
    return { expired: expiredCount, completed: completedCount, date: today }
  })
}
