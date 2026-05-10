import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

// ============================================================
// /api/cron/expire-pt-packages
//
// PURPOSE:
//   Automatically transitions active PT packages to their correct
//   terminal status when either condition is met:
//
//   1. COMPLETED — sessions_used >= total_sessions
//      All purchased sessions have been used up.
//
//   2. EXPIRED — end_date_calculated < today AND sessions remain
//      The package time window has passed even if sessions unused.
//
//   Previously ran on members/[id]/page.tsx load (expireStalePackages).
//   Moved here so the member profile page is pure read.
//
// SCHEDULE:
//   Runs daily at 0106 SGT (1706 UTC previous day).
//   Registered in vercel.json:
//     { "path": "/api/cron/expire-pt-packages", "schedule": "6 17 * * *" }
//
// SECURITY:
//   Requires CRON_SECRET header.
//   Uses admin client (bypasses RLS) for bulk update.
//
// RELATED CRONS:
//   /api/cron/expire-memberships — marks gym memberships expired + member deactivation
// ============================================================

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  // ── Mark fully-used packages as completed ─────────────────
  // sessions_used >= total_sessions — all sessions consumed
  const { data: completed, error: completedErr } = await supabase
    .from('packages')
    .update({ status: 'completed' })
    .eq('status', 'active')
    .filter('sessions_used', 'gte', 'total_sessions')
    .select('id')

  if (completedErr) {
    console.error('[cron/expire-pt-packages] Completed update error:', completedErr)
    return NextResponse.json({ ok: false, error: completedErr.message }, { status: 500 })
  }

  // ── Mark time-expired packages as expired ─────────────────
  // end_date_calculated < today — time window has passed
  const { data: expired, error: expiredErr } = await supabase
    .from('packages')
    .update({ status: 'expired' })
    .eq('status', 'active')
    .lt('end_date_calculated', today)
    .select('id')

  if (expiredErr) {
    console.error('[cron/expire-pt-packages] Expired update error:', expiredErr)
    return NextResponse.json({ ok: false, error: expiredErr.message }, { status: 500 })
  }

  const completedCount = completed?.length || 0
  const expiredCount = expired?.length || 0
  console.log(`[cron/expire-pt-packages] Completed: ${completedCount}, Expired: ${expiredCount}`)

  return NextResponse.json({
    ok: true,
    date: today,
    packages_completed: completedCount,
    packages_expired: expiredCount,
  })
}