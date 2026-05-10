import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

// ============================================================
// /api/cron/escalate-pt-package-sales
//
// PURPOSE:
//   Escalates PT package sales that have not been confirmed by
//   the manager within the configured threshold (default: 48h).
//   Sets escalated_to_biz_ops = true so biz-ops can follow up.
//
//   Previously ran on TrainerDashboard load (via runEscalationCheck).
//   Was missing from TrainerDashboard after extraction — this cron
//   restores correct behaviour system-wide.
//
// SCHEDULE:
//   Runs daily at 0104 SGT (1704 UTC previous day).
//   Registered in vercel.json:
//     { "path": "/api/cron/escalate-pt-package-sales", "schedule": "4 17 * * *" }
//
// SECURITY:
//   Requires CRON_SECRET header.
//   Uses admin client (bypasses RLS) for bulk update.
//
// SCOPE:
//   All unconfirmed PT packages across all trainers.
//   Threshold read from app_settings.escalation_pt_package_hours.
//   Excludes cancelled packages.
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
    .select('escalation_pt_package_hours')
    .eq('id', 'global')
    .single()
  const thresholdHours: number = settings?.escalation_pt_package_hours ?? 48
  const cutoff = new Date(now.getTime() - thresholdHours * 60 * 60 * 1000).toISOString()

  // ── Bulk escalate stale unconfirmed PT packages ───────────
  // Conditions:
  //   - manager_confirmed = false (not yet confirmed by manager)
  //   - escalated_to_biz_ops = false (not already escalated)
  //   - status != cancelled (ignore cancelled packages)
  //   - created_at < cutoff (older than threshold)
  const { data: escalated, error } = await supabase
    .from('packages')
    .update({
      escalated_to_biz_ops: true,
      escalated_at: now.toISOString(),
    })
    .eq('manager_confirmed', false)
    .eq('escalated_to_biz_ops', false)
    .neq('status', 'cancelled')
    .lt('created_at', cutoff)
    .select('id, gym_id, trainer_id')

  if (error) {
    console.error('[cron/escalate-pt-packages] Error:', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const count = escalated?.length || 0
  console.log(`[cron/escalate-pt-packages] Escalated ${count} PT packages (threshold: ${thresholdHours}h)`)

  return NextResponse.json({
    ok: true,
    date: now.toISOString().split('T')[0],
    threshold_hours: thresholdHours,
    cutoff,
    packages_escalated: count,
  })
}