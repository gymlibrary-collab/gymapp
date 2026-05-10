import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

// ============================================================
// /api/cron/escalate-leave
//
// PURPOSE:
//   Escalates pending leave applications that have not been
//   actioned by the manager within the configured threshold
//   (default: 48 hours). Sets escalated_to_biz_ops = true so
//   biz-ops can see and act on them.
//
//   Previously escalation only ran when the staff member visited
//   their My Leave page. If they never visited, the leave would
//   sit pending indefinitely with no escalation.
//
// SCHEDULE:
//   Runs daily at 0100 SGT (1700 UTC previous day).
//   Registered in vercel.json:
//     { "path": "/api/cron/escalate-leave", "schedule": "0 17 * * *" }
//
// SECURITY:
//   Requires CRON_SECRET header — same pattern as other cron routes.
//   Uses admin client (bypasses RLS) for bulk update.
//
// SCOPE:
//   Only escalates leave from trainers and staff (role = trainer | staff).
//   Manager leave goes directly to biz-ops and is not escalated.
//   Biz-ops leave goes directly to admin and is not escalated.
// ============================================================

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date()

  // ── Load escalation threshold from app_settings ───────────
  const { data: settings } = await supabase
    .from('app_settings')
    .select('escalation_leave_hours')
    .eq('id', 'global')
    .single()
  const thresholdHours: number = settings?.escalation_leave_hours ?? 48
  const cutoff = new Date(now.getTime() - thresholdHours * 60 * 60 * 1000).toISOString()

  // ── Find eligible staff (trainer + staff roles only) ──────
  // Manager leave goes directly to biz-ops — no escalation needed
  // Biz-ops leave goes to admin — handled outside system
  const { data: eligibleStaff } = await supabase
    .from('users')
    .select('id')
    .in('role', ['trainer', 'staff'])
    .eq('is_archived', false)

  if (!eligibleStaff || eligibleStaff.length === 0) {
    return NextResponse.json({ ok: true, escalated: 0, message: 'No eligible staff found' })
  }

  const staffIds = eligibleStaff.map((u: any) => u.id)

  // ── Bulk escalate stale leave applications ─────────────────
  // Conditions:
  //   - status = pending (not yet approved/rejected)
  //   - escalated_to_biz_ops = false (not already escalated)
  //   - created_at < cutoff (older than threshold)
  //   - user is trainer or staff (not manager/biz-ops)
  const { data: escalated, error } = await supabase
    .from('leave_applications')
    .update({
      escalated_to_biz_ops: true,
      escalated_at: now.toISOString(),
    })
    .eq('status', 'pending')
    .eq('escalated_to_biz_ops', false)
    .lt('created_at', cutoff)
    .in('user_id', staffIds)
    .select('id, user_id')

  if (error) {
    console.error('[cron/escalate-leave] Error:', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const count = escalated?.length || 0
  console.log(`[cron/escalate-leave] Escalated ${count} leave applications (threshold: ${thresholdHours}h)`)

  return NextResponse.json({
    ok: true,
    date: now.toISOString().split('T')[0],
    threshold_hours: thresholdHours,
    cutoff,
    escalated: count,
  })
}