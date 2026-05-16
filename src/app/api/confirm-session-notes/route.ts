import { createAdminClient, createSupabaseServerClient } from '@/lib/supabase-server'
import { NextResponse, NextRequest } from 'next/server'
import { nowSGT } from '@/lib/utils'

// ── POST /api/confirm-session-notes ──────────────────────────
// Confirms session notes and creates a commission_items row atomically.
// Called by managers/biz-ops from pt/sessions/page.tsx.
//
// Atomic pattern (commission item first, then confirmation):
//   1. INSERT commission_items — if fails, return error (nothing changed)
//   2. UPDATE sessions manager_confirmed — if fails, DELETE commission item, return error
//
// Also handles reversal (action: 'reverse'):
//   1. DELETE commission_items WHERE source_id = sessionId
//   2. UPDATE sessions manager_confirmed = false
//   Only allowed if commission has not been paid (payslip_id IS NULL on commission_items)
//
// Security:
//   - Server-side session validation (serverClient.auth.getUser())
//   - Role check: manager or business_ops only
//   - Gym ownership check: managers can only confirm sessions in their gym
//   - adminClient used for writes (bypasses RLS)

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
    const { sessionId, action = 'confirm' } = body

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    // ── Fetch session ─────────────────────────────────────────
    const { data: session, error: fetchErr } = await adminClient
      .from('sessions')
      .select('id, trainer_id, gym_id, session_commission_sgd, marked_complete_at, manager_confirmed, status')
      .eq('id', sessionId)
      .maybeSingle()

    if (fetchErr || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // ── Gym ownership check (managers only) ───────────────────
    if (currentUser.role === 'manager' && session.gym_id !== currentUser.manager_gym_id) {
      return NextResponse.json({ error: 'Forbidden: session not in your gym' }, { status: 403 })
    }

    // ── Session must be completed to confirm notes ────────────
    if (session.status !== 'completed') {
      return NextResponse.json(
        { error: 'Only completed sessions can have notes confirmed' },
        { status: 400 }
      )
    }

    // ── REVERSAL ──────────────────────────────────────────────
    if (action === 'reverse') {
      if (!session.manager_confirmed) {
        return NextResponse.json({ error: 'Session notes are not confirmed' }, { status: 400 })
      }

      // Block reversal if commission has been paid
      const { data: paidItem } = await adminClient
        .from('commission_items')
        .select('id, payslip_id')
        .eq('source_type', 'pt_session')
        .eq('source_id', sessionId)
        .not('payslip_id', 'is', null)
        .maybeSingle()

      if (paidItem) {
        return NextResponse.json(
          { error: 'Cannot reverse: commission has already been paid' },
          { status: 400 }
        )
      }

      // Delete commission item
      await adminClient
        .from('commission_items')
        .delete()
        .eq('source_type', 'pt_session')
        .eq('source_id', sessionId)

      // Un-confirm session
      await adminClient
        .from('sessions')
        .update({
          manager_confirmed: false,
          confirmed_by: null,
          confirmed_at: null,
        })
        .eq('id', sessionId)

      return NextResponse.json({ success: true, action: 'reversed' })
    }

    // ── CONFIRM ───────────────────────────────────────────────
    if (session.manager_confirmed) {
      return NextResponse.json({ error: 'Session notes already confirmed' }, { status: 409 })
    }

    // Compute period from marked_complete_at in SGT
    const completedAt = session.marked_complete_at
      ? new Date(session.marked_complete_at)
      : nowSGT()
    // Convert to SGT for period assignment
    const sgtOffset = 8 * 60 * 60 * 1000
    const sgtDate = new Date(completedAt.getTime() + sgtOffset)
    const periodMonth = sgtDate.getUTCMonth() + 1
    const periodYear = sgtDate.getUTCFullYear()

    // ── Step 1: Insert commission item ────────────────────────
    const { error: insertErr } = await adminClient
      .from('commission_items')
      .insert({
        user_id: session.trainer_id,
        gym_id: session.gym_id,
        source_type: 'pt_session',
        source_id: sessionId,
        amount: session.session_commission_sgd || 0,
        period_month: periodMonth,
        period_year: periodYear,
        // payslip_id: null — unpaid until commission payslip is marked paid
      })

    if (insertErr) {
      // UNIQUE constraint violation means item already exists — idempotent, continue
      if (!insertErr.code?.includes('23505')) {
        return NextResponse.json(
          { error: 'Failed to create commission item: ' + insertErr.message },
          { status: 500 }
        )
      }
    }

    // ── Step 2: Update session confirmed ──────────────────────
    const { error: updateErr } = await adminClient
      .from('sessions')
      .update({
        manager_confirmed: true,
        confirmed_by: authUser.id,
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', sessionId)

    if (updateErr) {
      // Cleanup: remove the commission item we just inserted
      await adminClient
        .from('commission_items')
        .delete()
        .eq('source_type', 'pt_session')
        .eq('source_id', sessionId)
        .is('payslip_id', null) // only delete if not yet paid (safety)

      return NextResponse.json(
        { error: 'Failed to confirm session: ' + updateErr.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, action: 'confirmed', periodMonth, periodYear })

  } catch (err: any) {
    console.error('confirm-session-notes error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
