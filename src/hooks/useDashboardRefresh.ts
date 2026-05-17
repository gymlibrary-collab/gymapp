import { useEffect, useRef } from 'react'

// ============================================================
// src/hooks/useDashboardRefresh.ts
//
// PURPOSE:
//   Silently re-runs a dashboard's load() function on a fixed
//   interval so that notifications, pending counts, and tile
//   stats stay fresh without a page reload.
//
// BEHAVIOUR:
//   - Initial load is handled by the caller (not this hook)
//   - Subsequent refreshes call load(true) — silent mode
//   - Silent mode suppresses the loading spinner so the screen
//     never blanks during a background refresh
//   - Pauses automatically when the browser tab is hidden
//     (visibilitychange API) — no queries fire in a background tab
//   - Cleans up the interval on component unmount — no queries
//     fire when the user navigates away from the dashboard
//
// INTERVAL:
//   DASHBOARD_REFRESH_INTERVAL_MS controls how often the silent
//   refresh fires. Currently 5 minutes (300,000ms).
//   To change: update this constant and redeploy.
//   Do NOT store this in app_settings — that would add a meta-query
//   on every refresh cycle to read the interval value.
//
// USAGE:
//   const load = async (silent = false) => {
//     if (!silent) setLoading(true)
//     // ... all queries ...
//     setLoading(false)
//   }
//   useDashboardRefresh(load)
//
// DOCUMENTED IN: ARCHITECTURE.md — Dashboard Refresh Pattern
// ============================================================

// ── Interval constant ─────────────────────────────────────────
// 5 minutes. Change here and redeploy to adjust.
export const DASHBOARD_REFRESH_INTERVAL_MS = 5 * 60 * 1000

export function useDashboardRefresh(load: (silent: boolean) => Promise<void>) {
  // Use a ref so the interval callback always calls the latest load()
  // without needing to re-register the interval when load changes
  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null

    const start = () => {
      if (intervalId) return
      intervalId = setInterval(() => {
        loadRef.current(true)
      }, DASHBOARD_REFRESH_INTERVAL_MS)
    }

    const stop = () => {
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
    }

    // Start immediately
    start()

    // Pause when tab goes to background, resume on focus
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stop()
      } else {
        // Fire one silent refresh immediately on tab focus (catches up on
        // anything that happened while the tab was in the background),
        // then restart the interval
        loadRef.current(true)
        start()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      stop()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, []) // empty deps — interval registered once on mount, cleaned up on unmount
}
