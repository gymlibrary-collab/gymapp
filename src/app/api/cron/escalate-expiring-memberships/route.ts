import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

// ============================================================
// /api/cron/escalate-expiring-memberships
//
// PURPOSE:
//   Escalates gym memberships that are expiring within the
//   configured threshold window (default: 7 days) and have not
//   been actioned (renewed or recorded as non-renewal).
//   Sets escalated_to_biz_ops = true so biz-ops can follow up.
//
//   Previously ran on manager + biz-ops dashboard load — moved
//   here so dashboards are pure read operations.
//
// SCHEDULE:
//   Runs daily at 0102 SGT (1702 UTC previous day).
//   Registered in vercel.json:
//     { "path": "/api/cron/escalate-expiring-memberships", "schedule": "2 17 * * *" }
//
// SECURITY:
//   Requires CRON_SECRET header — same pattern as other cron routes.
//   Uses admin client (bypasses RLS) for bulk update.
//
// THRESHOLD:
//   Reads escalation_membership_expiry_days from app_settings.
//   Defaults to 7 days if not configured.
//
// RELATED CRONS:
//   /api/cron/expire-memberships   — marks memberships as expired when end_date passes
//   /api/cron/escalate-leave       — escalates pending leave applications to biz-ops
//   /api/cron/reminders            — sends WhatsApp session reminders
// ============================================================

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date()
  const today = now.toISOString().split('T')[0]

  // ── Load threshold from app_settings ─────────────────────
  const { data: settings } = await supabase
    .from('app_settings')
    .select('escalation_membership_expiry_days')
    .eq('id', 'global')
    .single()
  const thresholdDays: number = settings?.escalation_membership_expiry_days ?? 7
  const expiryWindow = new Date(now.getTime() + thresholdDays * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0]

  // ── Bulk escalate expiring unactioned memberships ─────────
  // Conditions:
  //   - status = active (not yet expired)
  //   - sale_status = confirmed (not pending/rejected)
  //   - membership_actioned = false (manager hasn't recorded renewal or non-renewal)
  //   - escalated_to_biz_ops = false (not already escalated)
  //   - end_date within threshold window
  const { data: escalated, error } = await supabase
    .from('gym_memberships')
    .update({
      escalated_to_biz_ops: true,
      escalated_at: now.toISOString(),
    })
    .eq('status', 'active')
    .eq('sale_status', 'confirmed')
    .eq('membership_actioned', false)
    .eq('escalated_to_biz_ops', false)
    .lte('end_date', expiryWindow)
    .gte('end_date', today)
    .select('id, gym_id')

  if (error) {
    console.error('[cron/escalate-memberships] Error:', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const count = escalated?.length || 0
  console.log(`[cron/escalate-memberships] Escalated ${count} memberships (threshold: ${thresholdDays} days)`)

  return NextResponse.json({
    ok: true,
    date: today,
    threshold_days: thresholdDays,
    expiry_window: expiryWindow,
    memberships_escalated: count,
  })
}