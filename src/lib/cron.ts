import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

// ============================================================
// lib/cron.ts — Centralised cron job runner
//
// PURPOSE:
//   Wraps every cron route with:
//   1. Auth header validation (CRON_SECRET)
//   2. Log start to cron_logs
//   3. Run the business logic function
//   4. Log end (success or error)
//   5. Housekeep cron_logs — delete entries older than 7 days
//
// USAGE:
//   import { runCron } from '@/lib/cron'
//
//   export async function GET(request: NextRequest) {
//     return runCron(request, 'my-job', 'daily', async (supabase) => {
//       // business logic only — no auth/logging boilerplate needed
//       const { data } = await supabase.from('sessions').select('id')
//       return { processed: data?.length || 0 }
//     })
//   }
//
// HOUSEKEEPING:
//   Runs after every successful job via the daily orchestrator.
//   Deletes cron_logs rows where started_at < now() - 7 days.
//   Both 'daily' and 'reminder' source logs follow the same retention.
// ============================================================

type CronSource = 'daily' | 'reminder'

type CronJobFn = (
  supabase: ReturnType<typeof createAdminClient>
) => Promise<Record<string, unknown>>

export async function runCron(
  request: NextRequest,
  cronName: string,
  source: CronSource,
  fn: CronJobFn
): Promise<NextResponse> {
  // ── 1. Auth check ─────────────────────────────────────────
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const startedAt = new Date()

  // ── 2. Log start ──────────────────────────────────────────
  const { data: logRow } = await supabase.from('cron_logs').insert({
    cron_name: cronName,
    source,
    run_by: 'scheduled',
    started_at: startedAt.toISOString(),
    status: 'running',
  }).select('id').maybeSingle()
  const logId = logRow?.id

  try {
    // ── 3. Run business logic ─────────────────────────────────
    const result = await fn(supabase)

    // ── 4. Log success ────────────────────────────────────────
    const endedAt = new Date()
    if (logId) {
      await supabase.from('cron_logs').update({
        ended_at: endedAt.toISOString(),
        duration_ms: endedAt.getTime() - startedAt.getTime(),
        status: 'success',
        result,
      }).eq('id', logId)
    }

    console.log(`[cron/${cronName}] ✅ ${endedAt.getTime() - startedAt.getTime()}ms`, result)
    return NextResponse.json({ ok: true, ...result })

  } catch (err: any) {
    // ── 4. Log error ──────────────────────────────────────────
    const endedAt = new Date()
    if (logId) {
      await supabase.from('cron_logs').update({
        ended_at: endedAt.toISOString(),
        duration_ms: endedAt.getTime() - startedAt.getTime(),
        status: 'error',
        error: err.message,
      }).eq('id', logId)
    }

    console.error(`[cron/${cronName}] ❌ ${err.message}`)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

// ── Housekeeping ─────────────────────────────────────────────
// Called by the daily orchestrator once per day.
// Deletes all cron_logs rows older than 7 days (both daily and reminder).
export async function housekeepCronLogs(
  supabase: ReturnType<typeof createAdminClient>
): Promise<{ deleted: number }> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { count } = await supabase
    .from('cron_logs')
    .delete({ count: 'exact' })
    .lt('started_at', cutoff)
  return { deleted: count || 0 }
}
