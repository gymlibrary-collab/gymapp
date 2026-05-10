import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

// ============================================================
// /api/cron/escalate-pt-session-notes
//
// PURPOSE:
//   Escalates PT session notes that have been submitted by the
//   trainer but not yet confirmed by the manager within the
//   configured threshold (default: 48h).
//   Sets escalated_to_biz_ops = true so biz-ops can follow up.
//
//   Previously ran on TrainerDashboard load (via runEscalationCheck).
//   Was missing from TrainerDashboard after extraction — this cron
//   restores correct behaviour system-wide.
//
// SCHEDULE:
//   Runs daily at 0105 SGT (1705 UTC previous day).
//   Registered in vercel.json:
//     { "path": "/api/cron/escalate-pt-session-notes", "schedule": "5 17 * * *" }
//
// SECURITY:
//   Requires CRON_SECRET header.
//   Uses admin client (bypasses RLS) for bulk update.
//
// SCOPE:
//   All sessions with notes submitted but unconfirmed by manager.
//   Threshold read from app_settings.escalation_pt_session_hours.
//   Only sessions where is_notes_complete = true (notes fully submitted).
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
    .select('escalation_pt_session_hours')
    .eq('id', 'global')
    .single()
  const thresholdHours: number = settings?.escalation_pt_session_hours ?? 48
  const cutoff = new Date(now.getTime() - thresholdHours * 60 * 60 * 1000).toISOString()

  // ── Bulk escalate stale unconfirmed session notes ─────────
  // Conditions:
  //   - manager_confirmed = false (not yet confirmed by manager)
  //   - is_notes_complete = true (trainer has fully submitted notes)
  //   - escalated_to_biz_ops = false (not already escalated)
  //   - notes_submitted_at < cutoff (submitted longer ago than threshold)
  const { data: escalated, error } = await supabase
    .from('sessions')
    .update({
      escalated_to_biz_ops: true,
      escalated_at: now.toISOString(),
    })
    .eq('manager_confirmed', false)
    .eq('is_notes_complete', true)
    .eq('escalated_to_biz_ops', false)
    .lt('notes_submitted_at', cutoff)
    .select('id, gym_id, trainer_id')

  if (error) {
    console.error('[cron/escalate-pt-session-notes] Error:', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const count = escalated?.length || 0
  console.log(`[cron/escalate-pt-session-notes] Escalated ${count} session notes (threshold: ${thresholdHours}h)`)

  return NextResponse.json({
    ok: true,
    date: now.toISOString().split('T')[0],
    threshold_hours: thresholdHours,
    cutoff,
    sessions_escalated: count,
  })
}