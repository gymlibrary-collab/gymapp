import { createAdminClient, createSupabaseServerClient } from '@/lib/supabase-server'
import { validateAndLoadCurrentUser } from '@/lib/api-auth'
import { NextResponse, NextRequest } from 'next/server'

// ── POST /api/confirm-membership-sale ────────────────────────
// Confirms a membership sale and creates a commission_items row atomically.
// Called by managers/biz-ops from membership/sales/page.tsx.
//
// period_month/year = month of manager confirmation in SGT.
// (Membership commission is earned at point of confirmed sale,
//  unlike PT signup which is attributed to trainer submission month.)
//
// No reversal for membership sale confirmation (business decision).

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
    const { gymMembershipId } = body

    if (!gymMembershipId) {
      return NextResponse.json({ error: 'gymMembershipId is required' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    // ── Fetch gym membership ──────────────────────────────────
    const { data: sale, error: fetchErr } = await adminClient
      .from('gym_memberships')
      .select('id, sold_by_user_id, gym_id, commission_sgd, sale_status')
      .eq('id', gymMembershipId)
      .maybeSingle()

    if (fetchErr || !sale) {
      return NextResponse.json({ error: 'Membership sale not found' }, { status: 404 })
    }

    // ── Gym ownership check (managers only) ───────────────────
    if (currentUser.role === 'manager' && sale.gym_id !== currentUser.manager_gym_id) {
      return NextResponse.json({ error: 'Forbidden: sale not in your gym' }, { status: 403 })
    }

    if (sale.sale_status === 'confirmed') {
      return NextResponse.json({ error: 'Membership sale already confirmed' }, { status: 409 })
    }

    // period = month of confirmation in SGT
    const now = new Date()
    const sgtOffset = 8 * 60 * 60 * 1000
    const sgtDate = new Date(now.getTime() + sgtOffset)
    const periodMonth = sgtDate.getUTCMonth() + 1
    const periodYear = sgtDate.getUTCFullYear()
    const confirmedAt = now.toISOString()

    // ── Step 1: Insert commission item (only if commission > 0) ──
    if ((sale.commission_sgd || 0) > 0 && sale.sold_by_user_id) {
      const { error: insertErr } = await adminClient
        .from('commission_items')
        .insert({
          user_id: sale.sold_by_user_id,
          gym_id: sale.gym_id,
          source_type: 'membership',
          source_id: gymMembershipId,
          amount: sale.commission_sgd,
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
    }

    // ── Step 2: Confirm membership sale ───────────────────────
    const { error: updateErr } = await adminClient
      .from('gym_memberships')
      .update({
        sale_status: 'confirmed',
        status: 'active',
        confirmed_by: authUser.id,
        confirmed_at: confirmedAt,
      })
      .eq('id', gymMembershipId)

    if (updateErr) {
      // Cleanup: remove commission item
      await adminClient
        .from('commission_items')
        .delete()
        .eq('source_type', 'membership')
        .eq('source_id', gymMembershipId)
        .is('payslip_id', null)

      return NextResponse.json(
        { error: 'Failed to confirm membership sale: ' + updateErr.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, periodMonth, periodYear })

  } catch (err: any) {
    console.error('confirm-membership-sale error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
