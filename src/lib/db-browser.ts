// ============================================================
// src/lib/db-browser.ts
// Browser-side database client.
//
// PROVIDER ABSTRACTION:
// This file is the single point of change if we move away from
// Supabase. All app code imports from here — never directly from
// @supabase/ssr or @supabase/supabase-js.
//
// To migrate: replace the implementation below while keeping the
// exported function signatures identical. App code changes zero.
// ============================================================

import { createBrowserClient } from '@supabase/ssr'

/**
 * Returns a browser-side database client.
 * Uses the Supabase anon key — respects Row Level Security.
 * Call once per component, not once per request.
 */
export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
