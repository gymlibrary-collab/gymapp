'use client'

// ============================================================
// src/lib/part-timer-context.tsx
//
// PURPOSE:
//   React Context that provides the part-timer's active shift
//   gym ID to all dashboard pages. Populated once at layout
//   load from a DB-verified duty_roster query — cannot be
//   spoofed by URL params or browser storage.
//
// USAGE:
//   Provider: wrapped in layout.tsx around all dashboard pages
//   Consumer: usePartTimerContext() in any page component
//
// VALUE:
//   partTimerActiveGymId — string (gym UUID) if on active shift,
//                          null if off-shift or not a part-timer
// ============================================================

import { createContext, useContext } from 'react'

interface PartTimerContextValue {
  partTimerActiveGymId: string | null
}

export const PartTimerContext = createContext<PartTimerContextValue>({
  partTimerActiveGymId: null,
})

export function usePartTimerContext() {
  return useContext(PartTimerContext)
}
