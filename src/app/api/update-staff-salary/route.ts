import { createAdminClient, createSupabaseServerClient } from '@/lib/supabase-server'
import { rateLimit } from '@/lib/rate-limit'
import { validateAndLoadCurrentUser } from '@/lib/api-auth'
import { NextResponse, NextRequest } from 'next/server'
import { nowSGT, todaySGT } from '@/lib/utils'

// ── POST /api/update-staff-salary ────────────────────────────
// Atomically updates staff_payroll + salary_history.
// Called from hr/[id]/payroll/page.tsx for:
//   action = 'set'       → initial salary setup (staff_payroll upsert + history insert)
//   action = 'increment' → salary change (staff_payroll update + history insert)
//   action = 'bonus'     → record bonus in staff_bonuses (no salary change)
//
// Security:
//   - business_ops only (manager cannot change salaries)
//   - adminClient writes (bypasses RLS for sensitive tables)

export async function POST(request: NextRequest) {
  try {
  // Rate limiting — salary update
  const { limited } = rateLimit(request, { limit: 20, windowMs: 3600000, keyPrefix: 'update-salary' })
  if (limited) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const serverClient = await createSupabaseServerClient()
    const { data: { user: authUser } } = await serverClient.auth.getUser()
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: currentUser } = await serverClient
      .from('users').select('role').eq('id', authUser.id).maybeSingle()
    if (!currentUser || currentUser.role !== 'business_ops') {
      return NextResponse.json({ error: 'Forbidden — business_ops only' }, { status: 403 })
    }

    const body = await request.json()
    const { action, userId } = body
    if (!userId || !action) {
      return NextResponse.json({ error: 'userId and action are required' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    // Verify target user exists
    const { data: targetUser } = await adminClient
      .from('users').select('id, full_name, date_of_joining, is_archived')
      .eq('id', userId).maybeSingle()
    if (!targetUser) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })
    if (targetUser.is_archived) return NextResponse.json({ error: 'Cannot update salary for archived staff' }, { status: 400 })

    if (action === 'set') {
      // Initial salary setup
      const { current_salary, is_cpf_liable } = body
      if (current_salary === undefined || is_cpf_liable === undefined) {
        return NextResponse.json({ error: 'current_salary and is_cpf_liable required' }, { status: 400 })
      }
      const salary = parseFloat(current_salary)
      const isCpf = is_cpf_liable === true || is_cpf_liable === 'true'

      // Upsert staff_payroll profile
      const { error: upsertErr } = await adminClient.from('staff_payroll').upsert(
        { user_id: userId, current_salary: salary, is_cpf_liable: isCpf, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
      if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

      // Insert initial salary history record
      const { data: existingHistory } = await adminClient.from('salary_history')
        .select('id').eq('user_id', userId).limit(1).maybeSingle()
      if (!existingHistory && salary > 0) {
        await adminClient.from('salary_history').insert({
          user_id: userId, salary_amount: salary,
          effective_from: targetUser.date_of_joining || todaySGT(),
          change_type: 'initial', change_amount: salary,
          notes: 'Initial salary set', created_by: authUser.id,
        })
      }
      return NextResponse.json({ success: true, newSalary: salary })
    }

    if (action === 'increment') {
      const { change_amount, effective_from, change_type, notes } = body
      if (!change_amount || !effective_from || !change_type) {
        return NextResponse.json({ error: 'change_amount, effective_from, change_type required' }, { status: 400 })
      }
      const changeAmt = parseFloat(change_amount)

      // Get current salary
      const { data: payroll } = await adminClient.from('staff_payroll')
        .select('current_salary').eq('user_id', userId).maybeSingle()
      const newSalary = (payroll?.current_salary || 0) + changeAmt

      // Insert salary history first
      const { error: histErr } = await adminClient.from('salary_history').insert({
        user_id: userId, salary_amount: newSalary, effective_from,
        change_type, change_amount: changeAmt,
        notes: notes || null, created_by: authUser.id,
      })
      if (histErr) return NextResponse.json({ error: histErr.message }, { status: 500 })

      // Update staff_payroll
      const { error: updateErr } = await adminClient.from('staff_payroll')
        .update({ current_salary: newSalary, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
      if (updateErr) {
        // Cleanup history insert on failure
        await adminClient.from('salary_history')
          .delete().eq('user_id', userId).eq('created_by', authUser.id)
          .eq('effective_from', effective_from)
        return NextResponse.json({ error: updateErr.message }, { status: 500 })
      }
      return NextResponse.json({ success: true, newSalary })
    }

    if (action === 'bonus') {
      const { bonus_type, amount, month, year, notes } = body
      if (!bonus_type || !amount || !month || !year) {
        return NextResponse.json({ error: 'bonus_type, amount, month, year required' }, { status: 400 })
      }
      const { error: bonusErr } = await adminClient.from('staff_bonuses').insert({
        user_id: userId, bonus_type, amount: parseFloat(amount),
        month: parseInt(month), year: parseInt(year),
        notes: notes || null, created_by: authUser.id,
      })
      if (bonusErr) return NextResponse.json({ error: bonusErr.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err: any) {
    console.error('update-staff-salary error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
