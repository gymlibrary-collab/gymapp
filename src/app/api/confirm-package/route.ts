import { createAdminClient, createSupabaseServerClient } from '@/lib/supabase-server'
import { NextResponse, NextRequest } from 'next/server'

// ── POST /api/confirm-package ─────────────────────────────────
// Confirms a PT package sale and creates a commission_items row atomically.
// Called by managers/biz-ops from pt/package-sales/page.tsx.
//
// period_month/year = month of package creation (trainer submission time) in SGT.
// If manager confirms in the following month, the commission item is still
// attributed to the month the trainer submitted — it will be swept up in
// the next commission generation run (unpaid items are included regardless
// of age: WHERE payslip_id IS NULL AND period_month <= selected_month).
//
// No reversal for package confirmation (business decision).

export async function POST(request: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────
    const serverClient = await createSupabaseServerClient()
    const { data: { user: authUser } } = await serverClient.auth.getUser()
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: currentUser } = await serverClient
      .from('users')
      .select('role, manager_gym_id')
      .eq('id', authUser.id)
      .maybeSingle()

    if (!currentUser || !['manager', 'business_ops'].includes(currentUser.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { packageId } = body

    if (!packageId) {
      return NextResponse.json({ error: 'packageId is required' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    // ── Fetch package ─────────────────────────────────────────
    const { data: pkg, error: fetchErr } = await adminClient
      .from('packages')
      .select('id, trainer_id, gym_id, signup_commission_sgd, created_at, manager_confirmed')
      .eq('id', packageId)
      .maybeSingle()

    if (fetchErr || !pkg) {
      return NextResponse.json({ error: 'Package not found' }, { status: 404 })
    }

    // ── Gym ownership check (managers only) ───────────────────
    if (currentUser.role === 'manager' && pkg.gym_id !== currentUser.manager_gym_id) {
      return NextResponse.json({ error: 'Forbidden: package not in your gym' }, { status: 403 })
    }

    if (pkg.manager_confirmed) {
      return NextResponse.json({ error: 'Package already confirmed' }, { status: 409 })
    }

    // period = month of trainer submission (created_at) in SGT
    const createdAt = new Date(pkg.created_at)
    const sgtOffset = 8 * 60 * 60 * 1000
    const sgtDate = new Date(createdAt.getTime() + sgtOffset)
    const periodMonth = sgtDate.getUTCMonth() + 1
    const periodYear = sgtDate.getUTCFullYear()

    // ── Step 1: Insert commission item ────────────────────────
    const { error: insertErr } = await adminClient
      .from('commission_items')
      .insert({
        user_id: pkg.trainer_id,
        gym_id: pkg.gym_id,
        source_type: 'pt_signup',
        source_id: packageId,
        amount: pkg.signup_commission_sgd || 0,
        period_month: periodMonth,
        period_year: periodYear,
      })

    if (insertErr) {
      if (!insertErr.code?.includes('23505')) {
        return NextResponse.json(
          { error: 'Failed to create commission item: ' + insertErr.message },
          { status: 500 }
        )
      }
    }

    // ── Step 2: Confirm package ───────────────────────────────
    const { error: updateErr } = await adminClient
      .from('packages')
      .update({
        manager_confirmed: true,
        confirmed_by: authUser.id,
        confirmed_at: new Date().toISOString(),
        status: 'active',
      })
      .eq('id', packageId)

    if (updateErr) {
      // Cleanup: remove commission item
      await adminClient
        .from('commission_items')
        .delete()
        .eq('source_type', 'pt_signup')
        .eq('source_id', packageId)
        .is('payslip_id', null)

      return NextResponse.json(
        { error: 'Failed to confirm package: ' + updateErr.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, periodMonth, periodYear })

  } catch (err: any) {
    console.error('confirm-package error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
