// ── COMPATIBILITY SHIM ────────────────────────────────────────
// New code should import from '@/lib/db-browser' instead.
// This file re-exports so existing imports continue to work
// during the transition period.
export { createClient } from '@/lib/db-browser'
