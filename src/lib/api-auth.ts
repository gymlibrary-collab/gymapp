import { createSupabaseServerClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export interface AuthedUser {
  id: string
  role: string
  manager_gym_id: string | null
}

export type AuthResult =
  | { user: AuthedUser; error: null }
  | { user: null; error: NextResponse }

/**
 * Validates the request session and loads the current user's role.
 * Use at the top of every API route handler.
 *
 * @example
 * const { user, error } = await validateAndLoadCurrentUser()
 * if (error) return error
 * if (user.role !== 'business_ops') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
 */
export async function validateAndLoadCurrentUser(): Promise<
  { user: AuthedUser; error: null } | { user: null; error: NextResponse }
> {
  try {
    const serverClient = await createSupabaseServerClient()
    const { data: { user: authUser } } = await serverClient.auth.getUser()

    if (!authUser) {
      return {
        user: null,
        error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      }
    }

    const { data: currentUser } = await serverClient
      .from('users')
      .select('role, manager_gym_id')
      .eq('id', authUser.id)
      .maybeSingle()

    if (!currentUser) {
      return {
        user: null,
        error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      }
    }

    return {
      user: { id: authUser.id, role: currentUser.role, manager_gym_id: currentUser.manager_gym_id },
      error: null,
    }
  } catch {
    return {
      user: null,
      error: NextResponse.json({ error: 'Internal server error' }, { status: 500 }),
    }
  }
}
