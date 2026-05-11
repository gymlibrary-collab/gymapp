import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

// ============================================================
// /api/cron/expire-memberships
//
// PURPOSE:
//   Automatically transitions active gym memberships to their
//   correct terminal status:
//
//   1. CANCELLED — cancellation_end_date < today AND status='active'
//      Mid-term cancellations approved by manager. Marked 'cancelled'
//      to distinguish from normal expiry in reports.
//
//   2. EXPIRED — end_date < today AND status='active'
//      Normal membership expiry at the end of the term.
//
//   After either transition, checks if the member has any
//   remaining active memberships. If not, deactivates the member.
//
// SCHEDULE:
//   Runs daily via /api/cron/daily orchestrator (0001 SGT).
//   Can also be triggered independently via CRON_SECRET.
//
// SECURITY:
//   Requires CRON_SECRET header.
//   Uses admin client (bypasses RLS).
// ============================================================

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  try {
    // ── 1. Cancel mid-term cancellations ─────────────────────
    // Memberships where cancellation_end_date has passed.
    // Marked 'cancelled' (not 'expired') for reporting distinction.
    const { data: cancelled, error: cancelErr } = await supabase
      .from('gym_memberships')
      .update({ status: 'cancelled' })
      .eq('status', 'active')
      .eq('sale_status', 'confirmed')
      .not('cancellation_end_date', 'is', null)
      .lt('cancellation_end_date', today)
      .select('id, member_id')

    if (cancelErr) {
      console.error('[cron/expire-memberships] Cancel error:', cancelErr)
      return NextResponse.json({ error: cancelErr.message }, { status: 500 })
    }

    const cancelledCount = cancelled?.length || 0
    console.log(`[cron/expire-memberships] Cancelled ${cancelledCount} memberships (mid-term) as of ${today}`)

    // ── 2. Expire normal end-of-term memberships ──────────────
    // Only touches memberships with no cancellation_end_date set.
    const { data: expired, error: expireErr } = await supabase
      .from('gym_memberships')
      .update({ status: 'expired' })
      .eq('status', 'active')
      .eq('sale_status', 'confirmed')
      .is('cancellation_end_date', null)
      .lt('end_date', today)
      .select('id, member_id')

    if (expireErr) {
      console.error('[cron/expire-memberships] Expire error:', expireErr)
      return NextResponse.json({ error: expireErr.message }, { status: 500 })
    }

    const expiredCount = expired?.length || 0
    console.log(`[cron/expire-memberships] Expired ${expiredCount} memberships (normal) as of ${today}`)

    // ── 3. Deactivate members with no active memberships ──────
    const allAffectedMemberIds = Array.from(new Set([
      ...(cancelled || []).map((m: any) => m.member_id),
      ...(expired || []).map((m: any) => m.member_id),
    ].filter(Boolean)))

    let deactivatedCount = 0
    for (const memberId of allAffectedMemberIds) {
      const { count: activeCount } = await supabase
        .from('gym_memberships')
        .select('id', { count: 'exact', head: true })
        .eq('member_id', memberId)
        .eq('status', 'active')
        .eq('sale_status', 'confirmed')

      if ((activeCount || 0) === 0) {
        await supabase.from('members').update({ is_active: false }).eq('id', memberId)
        deactivatedCount++
      }
    }
    console.log(`[cron/expire-memberships] Deactivated ${deactivatedCount} members with no remaining active memberships`)

    return NextResponse.json({
      ok: true,
      date: today,
      memberships_cancelled: cancelledCount,
      memberships_expired: expiredCount,
      members_deactivated: deactivatedCount,
    })

  } catch (err: any) {
    console.error('[cron/expire-memberships] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
