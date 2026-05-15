import { NextRequest } from 'next/server'
import { runCron } from '@/lib/cron'

// ============================================================
// /api/cron/purge-activity-logs
//
// PURPOSE:
//   Deletes activity_logs older than 90 days to prevent
//   unbounded table growth. Runs nightly under the daily cron.
//
// RETENTION: 90 days — covers all business reporting needs
//   14 days matches the maximum view window in the activity logs UI
//
// STANDALONE:
//   curl -H "Authorization: Bearer $CRON_SECRET" /api/cron/purge-activity-logs
// ============================================================

const RETENTION_DAYS = 14

export async function GET(request: NextRequest) {
  return runCron(request, 'purge-activity-logs', 'daily', async (supabase) => {
    const cutoff = new Date(Date.now() + 8 * 60 * 60 * 1000) // SGT
    cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS)

    const { data: deleted, error } = await supabase
      .from('activity_logs')
      .delete()
      .lt('created_at', cutoff.toISOString())
      .select('id')

    if (error) throw new Error(error.message)

    const count = deleted?.length || 0
    return {
      deleted: count,
      cutoff: cutoff.toISOString(),
      retention_days: RETENTION_DAYS,
      message: count > 0
        ? `Purged ${count} activity log entries older than ${RETENTION_DAYS} days`
        : `No activity logs older than ${RETENTION_DAYS} days found`,
    }
  })
}
