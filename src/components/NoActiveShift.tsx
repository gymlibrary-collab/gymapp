'use client'

// ============================================================
// src/components/NoActiveShift.tsx
//
// PURPOSE:
//   Shared placeholder shown to part-time staff when they
//   access a gym-scoped page outside their rostered shift hours.
//   Used by: Members, Gym Schedule, and Dashboard (wrapper).
// ============================================================

import { CalendarDays } from 'lucide-react'

interface Props {
  pageName?: string
}

export function NoActiveShift({ pageName }: Props) {
  return (
    <div className="max-w-lg">
      <div className="card p-8 text-center space-y-4">
        <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
          <CalendarDays className="w-7 h-7 text-gray-400" />
        </div>
        <div>
          <p className="font-semibold text-gray-900">No Active Shift</p>
          <p className="text-sm text-gray-500 mt-1">
            {pageName
              ? `${pageName} is only available during your scheduled shift hours.`
              : "This page is only available during your scheduled shift hours."}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            Please refresh the page when your shift begins.
          </p>
        </div>
        <p className="text-xs text-gray-400">
          Check <strong>My Roster</strong> in the sidebar to see your upcoming shifts.
        </p>
      </div>
    </div>
  )
}
