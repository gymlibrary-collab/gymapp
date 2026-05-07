// ============================================================
// src/hooks/useCurrentUser.ts
// Central authentication and route guard hook.
//
// PROVIDER ABSTRACTION:
// This hook is the single point of change if we move away from
// Supabase Auth. All pages use this hook — never call
// supabase.auth.getUser() or query the users table directly
// in page components.
//
// To migrate to a different auth provider (Clerk, Auth0, etc):
// 1. Replace the implementation of this hook
// 2. Keep the returned shape identical
// 3. Zero page code changes required
//
// USAGE:
//   // Guard a page to business_ops only:
//   const { user, loading } = useCurrentUser({ allowedRoles: ['business_ops'] })
//   if (loading) return <Spinner />
//   // user is guaranteed non-null here — wrong roles are redirected away
//
//   // Get current user without role restriction:
//   const { user, loading } = useCurrentUser()
// ============================================================

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/db-browser'

export interface CurrentUser {
  id: string
  role: string
  full_name: string
  email: string
  manager_gym_id: string | null
  is_also_trainer: boolean
  phone: string | null
  date_of_birth: string | null
  nric: string | null
  employment_type: string | null
}

interface UseCurrentUserOptions {
  /** If provided, redirects to /dashboard if the user's role is not in this list */
  allowedRoles?: string[]
  /** Redirect destination when not authenticated or wrong role. Defaults to '/dashboard' */
  redirectTo?: string
}

interface UseCurrentUserResult {
  user: CurrentUser | null
  loading: boolean
  error: string | null
}

export function useCurrentUser(options: UseCurrentUserOptions = {}): UseCurrentUserResult {
  const { allowedRoles, redirectTo = '/dashboard' } = options
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      try {
        // Step 1: Verify authentication
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
        if (authError || !authUser) {
          router.replace(redirectTo)
          return
        }

        // Step 2: Load user profile and role from DB
        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('id, role, full_name, email, manager_gym_id, is_also_trainer, phone, date_of_birth, nric, employment_type')
          .eq('id', authUser.id)
          .single()

        if (profileError || !profile) {
          router.replace(redirectTo)
          return
        }

        // Step 3: Enforce role restriction if specified
        if (allowedRoles && allowedRoles.length > 0) {
          if (!allowedRoles.includes(profile.role)) {
            router.replace(redirectTo)
            return
          }
        }

        setUser(profile as CurrentUser)
      } catch (err: any) {
        setError(err?.message || 'Failed to load user')
        router.replace(redirectTo)
      } finally {
        setLoading(false)
      }
    }

    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { user, loading, error }
}
