// ── COMPATIBILITY SHIM ────────────────────────────────────────
// New code should import from '@/lib/db-server' instead.
// This file re-exports so existing imports continue to work
// during the transition period.
export { createSupabaseServerClient, createAdminClient } from '@/lib/db-server'
