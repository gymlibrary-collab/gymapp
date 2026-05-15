import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { housekeepCronLogs } from '@/lib/cron'

// ============================================================
// /api/cron/daily
//
// PURPOSE:
//   Daily orchestrator — runs all nightly cron jobs in sequence.
//   Logs start, end, duration and outcome of each job to
//   cron_logs table for admin visibility and troubleshooting.
//
//   On failure of any individual job, the orchestrator continues
//   to the next job. All failures are captured in the log.
//
// SCHEDULE:
//   Runs daily at 0001 SGT (1701 UTC previous day).
//   This is the ONLY nightly cron registered in vercel.json.
//   Individual cron routes remain callable independently via
//   Vercel dashboard or curl with CRON_SECRET for debugging.
//
// HOUSEKEEPING:
//   Deletes cron_logs entries older than 7 days at the start
//   of each run to keep the table light.
//
// JOB ORDER (matters — expire before escalate):
//   1. expire-memberships
//   2. expire-pt-packages
//   3. escalate-leave
//   4. escalate-expiring-memberships
//   5. escalate-membership-sales
//   6. escalate-pt-package-sales
//   7. escalate-pt-session-notes
//   8. check-staff-birthdays
//   9. check-member-birthdays
//  10. lock-roster-shifts (now job 3 — runs after expiry, before escalation)
//
// NOT INCLUDED:
//   /api/cron/reminders — runs at 0800 SGT, separate schedule
//
// SECURITY:
//   Requires CRON_SECRET header.
//   Uses admin client for all DB writes.
// ============================================================

const JOBS = [
  'expire-memberships',           // mark expired gym memberships as expired
  'expire-pt-packages',           // mark expired PT packages as expired
  'lock-roster-shifts',           // auto-lock past part-timer shifts for payroll finality
  'purge-activity-logs',          // delete activity logs older than 14 days
  'escalate-leave',               // escalate pending leave applications to Biz Ops
  'escalate-expiring-memberships',// notify managers of memberships expiring soon
  'escalate-membership-sales',    // escalate pending membership sales confirmations
  'escalate-pt-package-sales',    // escalate pending PT package sales confirmations
  'escalate-pt-session-notes',    // escalate PT sessions with missing notes
  'check-staff-birthdays',        // send birthday notifications for staff
  'check-member-birthdays',       // send birthday notifications for members
]

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // ── Step 0: Housekeep cron logs (7-day rolling window) ──
  await housekeepCronLogs(supabase)
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? request.nextUrl.origin
    : `https://${request.headers.get('host')}`
  const cronSecret = process.env.CRON_SECRET!
  const dailyStart = new Date()

  console.log(`[cron/daily] Starting daily run at ${dailyStart.toISOString()}`)

  // ── Housekeeping: delete logs older than 7 days ──────────
  const cutoff = new Date(dailyStart.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { error: cleanupErr, count: deletedCount } = await supabase
    .from('cron_logs')
    .delete({ count: 'exact' })
    .lt('started_at', cutoff)

  if (cleanupErr) {
    console.error('[cron/daily] Housekeeping error:', cleanupErr.message)
  } else {
    console.log(`[cron/daily] Housekeeping: deleted ${deletedCount ?? 0} log entries older than 7 days`)
  }

  // ── Run each job sequentially ─────────────────────────────
  const results: Record<string, any> = {}

  for (const jobName of JOBS) {
    const jobStart = new Date()

    // Insert 'running' log entry
    const { data: logRow, error: insertErr } = await supabase
      .from('cron_logs')
      .insert({
        cron_name: jobName,
        run_by: 'daily',
        started_at: jobStart.toISOString(),
        status: 'running',
      })
      .select('id')
      .maybeSingle()

    if (insertErr || !logRow) {
      console.error(`[cron/daily] Failed to insert log for ${jobName}:`, insertErr?.message)
    }

    const logId = logRow?.id

    try {
      console.log(`[cron/daily] Starting job: ${jobName}`)

      const response = await fetch(`${baseUrl}/api/cron/${jobName}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${cronSecret}`,
          'Content-Type': 'application/json',
        },
      })

      const jobEnd = new Date()
      const durationMs = jobEnd.getTime() - jobStart.getTime()
      const responseText = await response.text()
      let result: any = null

      try {
        result = JSON.parse(responseText)
      } catch {
        result = { raw: responseText }
      }

      const success = response.ok && result?.ok !== false
      const status = success ? 'success' : 'error'
      const errorMsg = !success
        ? (result?.error || `HTTP ${response.status}`)
        : null

      // Update log entry with outcome
      if (logId) {
        await supabase.from('cron_logs').update({
          ended_at: jobEnd.toISOString(),
          duration_ms: durationMs,
          status,
          result,
          error: errorMsg,
        }).eq('id', logId)
      }

      results[jobName] = { status, duration_ms: durationMs, result, error: errorMsg }
      console.log(`[cron/daily] ${jobName}: ${status} (${durationMs}ms)`)

    } catch (err: any) {
      const jobEnd = new Date()
      const durationMs = jobEnd.getTime() - jobStart.getTime()
      const errorMsg = err?.message || String(err)

      // Update log entry with error
      if (logId) {
        await supabase.from('cron_logs').update({
          ended_at: jobEnd.toISOString(),
          duration_ms: durationMs,
          status: 'error',
          error: errorMsg,
        }).eq('id', logId)
      }

      results[jobName] = { status: 'error', duration_ms: durationMs, error: errorMsg }
      console.error(`[cron/daily] ${jobName}: error — ${errorMsg}`)
      // Continue to next job regardless of failure
    }
  }

  const dailyEnd = new Date()
  const totalDurationMs = dailyEnd.getTime() - dailyStart.getTime()
  const successCount = Object.values(results).filter((r: any) => r.status === 'success').length
  const errorCount = Object.values(results).filter((r: any) => r.status === 'error').length

  console.log(`[cron/daily] Completed: ${successCount} success, ${errorCount} error(s), total ${totalDurationMs}ms`)

  return NextResponse.json({
    ok: errorCount === 0,
    started_at: dailyStart.toISOString(),
    ended_at: dailyEnd.toISOString(),
    total_duration_ms: totalDurationMs,
    jobs_run: JOBS.length,
    success_count: successCount,
    error_count: errorCount,
    results,
  })
}