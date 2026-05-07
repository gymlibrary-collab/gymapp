// ============================================================
// src/lib/escalation.ts — Central escalation utility
// ============================================================
// All escalation checks must go through this module.
// Thresholds are loaded from app_settings — never hardcoded.
//
// Usage:
//   import { runEscalationCheck } from '@/lib/escalation'
//   await runEscalationCheck(supabase, 'pt_package', thresholdHours, userId)
//
// See ARCHITECTURE.md for full escalation reference.
// ============================================================

import { SupabaseClient } from '@supabase/supabase-js'

export type EscalationType =
  | 'leave'
  | 'pt_package'
  | 'pt_session'
  | 'membership_sales'
  | 'membership_expiry'

export interface EscalationThresholds {
  leave: number           // hours
  pt_package: number      // hours
  pt_session: number      // hours
  membership_sales: number // hours
  membership_expiry: number // days
}

// Load escalation thresholds from app_settings
export async function loadEscalationThresholds(
  supabase: SupabaseClient
): Promise<EscalationThresholds> {
  const { data } = await supabase.from('app_settings')
    .select(`
      escalation_leave_hours,
      escalation_pt_package_hours,
      escalation_pt_session_hours,
      escalation_membership_sales_hours,
      escalation_membership_expiry_days
    `)
    .eq('id', 'global')
    .single()

  return {
    leave: data?.escalation_leave_hours ?? 48,
    pt_package: data?.escalation_pt_package_hours ?? 48,
    pt_session: data?.escalation_pt_session_hours ?? 48,
    membership_sales: data?.escalation_membership_sales_hours ?? 48,
    membership_expiry: data?.escalation_membership_expiry_days ?? 7,
  }
}

// Run escalation check for a given type
// Returns the number of items escalated
export async function runEscalationCheck(
  supabase: SupabaseClient,
  type: EscalationType,
  threshold: number,
  userId: string,
  gymId?: string
): Promise<number> {
  const now = new Date()
  const escalatedAt = now.toISOString()
  let escalatedCount = 0

  try {
    if (type === 'leave') {
      // Pending leave applications older than threshold hours
      const cutoff = new Date(now.getTime() - threshold * 60 * 60 * 1000).toISOString()
      const { data: stale } = await supabase.from('leave_applications')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .eq('escalated_to_biz_ops', false)
        .lt('created_at', cutoff)
      if (stale && stale.length > 0) {
        await supabase.from('leave_applications')
          .update({ escalated_to_biz_ops: true, escalated_at: escalatedAt })
          .in('id', stale.map(r => r.id))
        escalatedCount = stale.length
      }
    }

    else if (type === 'pt_package') {
      // Unconfirmed PT packages older than threshold hours
      const cutoff = new Date(now.getTime() - threshold * 60 * 60 * 1000).toISOString()
      const { data: stale } = await supabase.from('packages')
        .select('id')
        .eq('trainer_id', userId)
        .eq('manager_confirmed', false)
        .eq('escalated_to_biz_ops', false)
        .neq('status', 'cancelled')
        .lt('created_at', cutoff)
      if (stale && stale.length > 0) {
        await supabase.from('packages')
          .update({ escalated_to_biz_ops: true, escalated_at: escalatedAt })
          .in('id', stale.map(r => r.id))
        escalatedCount = stale.length
      }
    }

    else if (type === 'pt_session') {
      // Unconfirmed session notes older than threshold hours
      const cutoff = new Date(now.getTime() - threshold * 60 * 60 * 1000).toISOString()
      const { data: stale } = await supabase.from('sessions')
        .select('id')
        .eq('trainer_id', userId)
        .eq('manager_confirmed', false)
        .eq('is_notes_complete', true)
        .eq('escalated_to_biz_ops', false)
        .lt('notes_submitted_at', cutoff)
      if (stale && stale.length > 0) {
        await supabase.from('sessions')
          .update({ escalated_to_biz_ops: true, escalated_at: escalatedAt })
          .in('id', stale.map(r => r.id))
        escalatedCount = stale.length
      }
    }

    else if (type === 'membership_sales') {
      // Pending membership sales older than threshold hours, sold by this user
      const cutoff = new Date(now.getTime() - threshold * 60 * 60 * 1000).toISOString()
      const { data: stale } = await supabase.from('gym_memberships')
        .select('id')
        .eq('sold_by_user_id', userId)
        .eq('sale_status', 'pending')
        .eq('escalated_to_biz_ops', false)
        .lt('created_at', cutoff)
      if (stale && stale.length > 0) {
        await supabase.from('gym_memberships')
          .update({ escalated_to_biz_ops: true, escalated_at: escalatedAt })
          .in('id', stale.map(r => r.id))
        escalatedCount = stale.length
      }
    }

    else if (type === 'membership_expiry') {
      // Memberships expiring within threshold days with no action taken
      if (!gymId) return 0
      const expiryWindow = new Date(now.getTime() + threshold * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0]
      const today = now.toISOString().split('T')[0]
      const { data: stale } = await supabase.from('gym_memberships')
        .select('id')
        .eq('gym_id', gymId)
        .eq('status', 'active')
        .eq('sale_status', 'confirmed')
        .eq('escalated_to_biz_ops', false)
        .lte('end_date', expiryWindow)
        .gte('end_date', today)
      if (stale && stale.length > 0) {
        await supabase.from('gym_memberships')
          .update({ escalated_to_biz_ops: true, escalated_at: escalatedAt })
          .in('id', stale.map(r => r.id))
        escalatedCount = stale.length
      }
    }
  } catch (err) {
    // Never throw — escalation must not break the app
    console.error(`Escalation check failed [${type}]:`, err)
  }

  return escalatedCount
}

// Log escalation event to activity_logs via API route
export async function logEscalation(
  userName: string,
  role: string,
  userId: string,
  type: EscalationType,
  count: number
): Promise<void> {
  if (count === 0) return
  const descriptions: Record<EscalationType, string> = {
    leave: `Escalated ${count} pending leave application(s) to Biz Ops`,
    pt_package: `Escalated ${count} PT package sale(s) to Biz Ops`,
    pt_session: `Escalated ${count} PT session note(s) to Biz Ops`,
    membership_sales: `Escalated ${count} membership sale(s) to Biz Ops`,
    membership_expiry: `Escalated ${count} expiring membership(s) to Biz Ops`,
  }
  try {
    fetch('/api/activity-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        user_name: userName,
        role,
        action_type: 'other',
        page: 'System',
        description: descriptions[type],
      }),
    }).catch(() => {})
  } catch {
    // Never throw
  }
}
