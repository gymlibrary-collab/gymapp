import { NextRequest } from 'next/server'
import { runCron } from '@/lib/cron'

export async function GET(request: NextRequest) {
  return runCron(request, 'expire-memberships', 'daily', async (supabase) => {
    const today = new Date().toISOString().split('T')[0]

    // 1. Cancel mid-term cancellations
    const { data: cancelled, error: cancelErr } = await supabase
      .from('gym_memberships').update({ status: 'cancelled' })
      .eq('status', 'active').eq('sale_status', 'confirmed')
      .not('cancellation_end_date', 'is', null).lt('cancellation_end_date', today)
      .select('id, member_id')
    if (cancelErr) throw new Error(cancelErr.message)

    // 2. Expire memberships past end_date
    const { data: expired, error: expireErr } = await supabase
      .from('gym_memberships').update({ status: 'expired' })
      .eq('status', 'active').eq('sale_status', 'confirmed')
      .lt('end_date', today).select('id, member_id')
    if (expireErr) throw new Error(expireErr.message)

    // 3. Deactivate members with no active membership or active packages
    const affectedMemberIds = [
      ...(cancelled || []).map((m: any) => m.member_id),
      ...(expired || []).map((m: any) => m.member_id),
    ]
    const uniqueIds = affectedMemberIds.filter((id, idx, arr) => arr.indexOf(id) === idx)

    let deactivatedCount = 0
    for (const memberId of uniqueIds) {
      const { count: activeMemCount } = await supabase.from('gym_memberships')
        .select('id', { count: 'exact', head: true })
        .eq('member_id', memberId).eq('status', 'active').eq('sale_status', 'confirmed')
      const { count: activePkgCount } = await supabase.from('packages')
        .select('id', { count: 'exact', head: true })
        .eq('member_id', memberId).eq('status', 'active').eq('manager_confirmed', true)
      if ((activeMemCount || 0) === 0 && (activePkgCount || 0) === 0) {
        await supabase.from('members').update({ is_active: false }).eq('id', memberId)
        deactivatedCount++
      }
    }

    return { date: today, cancelled: cancelled?.length || 0, expired: expired?.length || 0, members_deactivated: deactivatedCount }
  })
}
