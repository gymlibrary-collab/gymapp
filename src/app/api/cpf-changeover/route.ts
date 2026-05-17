import { createAdminClient } from '@/lib/supabase-server'
import { rateLimit } from '@/lib/rate-limit'
import { validateAndLoadCurrentUser } from '@/lib/api-auth'
import { NextResponse, NextRequest } from 'next/server'
import { loadCpfBrackets, getCpfPeriods } from '@/lib/cpf'

// ── POST /api/cpf-changeover ──────────────────────────────────
// Executes a CPF bracket period changeover:
//   1. Deletes all rows for the oldest effective_from period (if 3+ periods exist)
//   2. The pending period automatically becomes current (no action needed)
//
// Security:
//   - business_ops only
//   - adminClient for all writes (bypasses RLS)
//   - Validates that oldest_period actually IS the oldest before deleting

export async function POST(request: NextRequest) {
  try {
    const { limited } = rateLimit(request, { limit: 10, windowMs: 60 * 60_000, keyPrefix: 'cpf-changeover' })
    if (limited) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const { user, error: authErr } = await validateAndLoadCurrentUser()
    if (authErr || !user) return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 })
    if (user.role !== 'business_ops') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const adminClient = createAdminClient()
    const body = await request.json()
    const { oldest_period } = body

    if (!oldest_period) {
      return NextResponse.json({ error: 'oldest_period required' }, { status: 400 })
    }

    // Load all brackets and verify oldest_period is genuinely the oldest
    const brackets = await loadCpfBrackets(adminClient)
    const periods = getCpfPeriods(brackets)

    if (periods.length < 3) {
      return NextResponse.json({
        error: 'Changeover not applicable — fewer than 3 periods exist. No deletion needed.'
      }, { status: 400 })
    }

    const actualOldest = periods[periods.length - 1]
    if (oldest_period !== actualOldest) {
      return NextResponse.json({
        error: `Mismatch: supplied oldest_period (${oldest_period}) does not match actual oldest (${actualOldest}). Aborting for safety.`
      }, { status: 400 })
    }

    // Delete all bracket rows for the oldest period
    const { error: deleteErr, count } = await adminClient
      .from('cpf_age_brackets')
      .delete({ count: 'exact' })
      .eq('effective_from', oldest_period)

    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      deleted_period: oldest_period,
      deleted_rows: count ?? 0,
      message: `Removed ${count ?? 0} bracket rows for period ${oldest_period}`,
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 })
  }
}
