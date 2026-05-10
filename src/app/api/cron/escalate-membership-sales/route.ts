import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

// ============================================================
// /api/cron/escalate-membership-sales
//
// PURPOSE:
//   Escalates pending membership sales that have not been
//   confirmed or rejected by the manager within the configured
//   threshold (default: 48 hours). Sets escalated_to_biz_ops = true
//   so biz-ops can follow up with the manager.
//
//   Previously ran on ManagerDashboard and StaffDashboard load.
//   Moved here so dashboards are pure read operations.
//
// SCHEDULE:
//   Runs daily at 0103 SGT (1703 UTC previous day).
//   Registered in vercel.json:
//     { "path": "/api/cron/escalate-membership-sales", "schedule": "3 17 * * *" }
//
// SECURITY:
//   Requires CRON_SECRET header.
//   Uses admin client (bypasses RLS) for bulk update.
//
// SCOPE:
//   All pending membership sales across all gyms and staff.
//   Threshold read from app_settings.escalation_membership_sales_hours.
//
// RELATED CRONS:
//   /api/cron/expire-memberships              — marks memberships expired when end_date passes
//   /api/cron/escalate-expiring-memberships   — escalates expiring unactioned memberships
//   /api/cron/escalate-leave                  — escalates stale leave applications
//   /api/cron/escalate-pt-packages            — escalates unconfirmed PT package sales
//   /api/cron/escalate-pt-session-notes       — escalates unconfirmed PT session notes
// ============================================================

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date()

  // ── Load threshold ────────────────────────────────────────
  const { data: settings } = await supabase
    .from('app_settings')
    .select('escalation_membership_sales_hours')
    .eq('id', 'global')
    .single()
  const thresholdHours: number = settings?.escalation_membership_sales_hours ?? 48
  const cutoff = new Date(now.getTime() - thresholdHours * 60 * 60 * 1000).toISOString()

  // ── Bulk escalate stale pending membership sales ──────────
  // Conditions:
  //   - sale_status = pending (not yet confirmed/rejected by manager)
  //   - escalated_to_biz_ops = false (not already escalated)
  //   - created_at < cutoff (older than threshold)
  const { data: escalated, error } = await supabase
    .from('gym_memberships')
    .update({
      escalated_to_biz_ops: true,
      escalated_at: now.toISOString(),
    })
    .eq('sale_status', 'pending')
    .eq('escalated_to_biz_ops', false)
    .lt('created_at', cutoff)
    .select('id, gym_id, sold_by_user_id')

  if (error) {
    console.error('[cron/escalate-membership-sales] Error:', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const count = escalated?.length || 0
  console.log(`[cron/escalate-membership-sales] Escalated ${count} membership sales (threshold: ${thresholdHours}h)`)

  return NextResponse.json({
    ok: true,
    date: now.toISOString().split('T')[0],
    threshold_hours: thresholdHours,
    cutoff,
    sales_escalated: count,
  })
}