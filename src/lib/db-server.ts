// ============================================================
// src/lib/db-server.ts
// Server-side database clients (API routes, server components).
//
// PROVIDER ABSTRACTION:
// This file is the single point of change if we move away from
// Supabase. All server-side app code imports from here — never
// directly from @supabase/ssr or @supabase/supabase-js.
//
// To migrate: replace the implementations below while keeping
// the exported function signatures identical.
// ============================================================

import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

/**
 * Server-side client that respects the user's session cookies.
 * Use in API routes and server components where you need RLS.
 */
export const createSupabaseServerClient = async () => {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as any)
            )
          } catch {}
        },
      },
    }
  )
}

/**
 * Admin client using the service role key.
 * Bypasses Row Level Security — use only in trusted server contexts
 * (cron jobs, admin API routes). Never expose to the browser.
 */
export const createAdminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
