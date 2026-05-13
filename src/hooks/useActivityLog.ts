'use client'

// ============================================================
// useActivityLog — MANDATORY for all pages and action handlers
// ============================================================
// Every new page MUST call logActivity('page_view', ...) in its
// useEffect load function.
// Every new mutating action (create, update, delete, confirm,
// reject, approve) MUST call logActivity() after success.
//
// Rules:
// - Never log content or sensitive data — describe WHAT happened
// - Page name must match the sidebar nav label
// - Description: past tense, concise, max ~60 chars
// - page_view: fire-and-forget (no await needed)
// - actions: call after successful DB operation
//
// See ARCHITECTURE.md for full reference and examples.
// ============================================================

import { useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase-browser'

export type ActionType =
  | 'login' | 'logout' | 'page_view' | 'create' | 'update'
  | 'delete' | 'confirm' | 'reject' | 'export' | 'approve' | 'other'

// Fire-and-forget activity logger
// - Page views: non-blocking (no await needed)
// - Actions: await in the calling code to ensure logging before navigation
export function useActivityLog() {
  const supabase = createClient()
  const userCacheRef = useRef<{ id: string; name: string; role: string } | null>(null)

  const getUser = useCallback(async () => {
    if (userCacheRef.current) return userCacheRef.current
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return null
    const { data } = await supabase.from('users')
      .select('id, full_name, role').eq('id', authUser.id).maybeSingle()
    if (!data) return null
    userCacheRef.current = { id: data.id, name: data.full_name, role: data.role }
    return userCacheRef.current
  }, [])

  const logActivity = useCallback(async (
    action_type: ActionType,
    page: string,
    description: string
  ) => {
    try {
      const user = await getUser()
      if (!user) return

      // Fire-and-forget — don't block UI
      fetch('/api/activity-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          user_name: user.name,
          role: user.role,
          action_type,
          page,
          description,
        }),
      }).catch(() => {}) // silently ignore network errors
    } catch {
      // Never throw — logging must not break the app
    }
  }, [getUser])

  return { logActivity }
}
