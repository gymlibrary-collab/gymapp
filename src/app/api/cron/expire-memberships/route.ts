import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

// ============================================================
// /api/cron/expire-memberships
//
// PURPOSE:
//   Automatically marks gym memberships as 'expired' when their
//   end_date has passed and they are still 'active'.
//
//   Previously this ran on every manager dashboard load — a write
//   operation that blocked the read flow. Moved here so the
//   dashboard is pure read.
//
// SCHEDULE:
//   Runs daily at 0001 SGT (1701 UTC previous day).
//   Configured in /vercel.json.
//
// SECURITY:
//   Protected by CRON_SECRET environment variable.
//   Vercel passes this automatically via the Authorization header.
//   Set CRON_SECRET in Vercel environment variables.
//
// MIGRATION NOTE:
//   If moving off Vercel, this route works on any Next.js host.
//   Just point your new cron scheduler at:
//     GET /api/cron/expire-memberships
//   with header: Authorization: Bearer <CRON_SECRET>
// ============================================================

export async function GET(request: NextRequest) {
  // ── Auth check ────────────────────────────────────────────
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  try {
    // ── Expire overdue memberships ────────────────────────────
    // Marks active memberships as expired when end_date < today.
    // Only touches memberships with sale_status = 'confirmed' to
    // avoid expiring pending/rejected sales.
    const { data: expired, error } = await supabase
      .from('gym_memberships')
      .update({ status: 'expired' })
      .eq('status', 'active')
      .eq('sale_status', 'confirmed')
      .lt('end_date', today)
      .select('id, member_id, gym_id, end_date')

    if (error) {
      console.error('[cron/expire-memberships] Supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const count = expired?.length || 0
    console.log(`[cron/expire-memberships] Expired ${count} memberships as of ${today}`)

    // ── Update member is_active flag ──────────────────────────
    // For each member whose membership just expired, check if they
    // have any remaining active memberships. If not, mark them inactive.
    if (count > 0) {
      const memberIds = [...new Set((expired || []).map((m: any) => m.member_id).filter(Boolean))]

      let deactivatedCount = 0
      for (const memberId of memberIds) {
        const { count: activeCount } = await supabase
          .from('gym_memberships')
          .select('id', { count: 'exact', head: true })
          .eq('member_id', memberId)
          .eq('status', 'active')
          .eq('sale_status', 'confirmed')

        if ((activeCount || 0) === 0) {
          await supabase
            .from('members')
            .update({ is_active: false })
            .eq('id', memberId)
          deactivatedCount++
        }
      }
      console.log(`[cron/expire-memberships] Deactivated ${deactivatedCount} members with no remaining active memberships`)
    }

    return NextResponse.json({
      ok: true,
      date: today,
      memberships_expired: count,
    })

  } catch (err: any) {
    console.error('[cron/expire-memberships] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
