'use client'

// ============================================================
// src/app/dashboard/page.tsx — Dashboard router
//
// PURPOSE:
//   Thin router — fetches the authenticated user's role and
//   renders the appropriate role-specific dashboard component.
//   All data fetching and UI logic lives in each component.
//
// ROLE ROUTING:
//   admin        → AdminDashboard
//   business_ops → BizOpsDashboard
//   manager      → ManagerDashboard (unless isActingAsTrainer)
//   trainer      → TrainerDashboard
//   staff        → StaffDashboard
//   manager acting as trainer → TrainerDashboard (isActingAsTrainer=true)
//
// COMPONENTS:
//   src/app/dashboard/_components/
//     AdminDashboard.tsx       — system health, gym breakdown, biz-ops leave
//     BizOpsDashboard.tsx      — gym overview, alerts, commission, leave
//     ManagerDashboard.tsx     — gym ops, packages, members, commission
//     TrainerDashboard.tsx     — sessions, packages, commission
//     StaffDashboard.tsx       — sessions, stats, quick actions
//
// SHARED LIBS:
//   src/lib/dashboard.ts       — shared query functions
//   src/lib/pdf.ts             — PDF generation (payslip, commission, annual)
//   src/lib/escalation.ts      — escalation checks and logging
// ============================================================

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useViewMode } from '@/lib/view-mode-context'
import AdminDashboard from './_components/AdminDashboard'
import BizOpsDashboard from './_components/BizOpsDashboard'
import ManagerDashboard from './_components/ManagerDashboard'
import TrainerDashboard from './_components/TrainerDashboard'
import StaffDashboard from './_components/StaffDashboard'

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const { isActingAsTrainer } = useViewMode()

  useEffect(() => {
    const load = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return
      const { data: u } = await supabase.from('users').select('*').eq('id', authUser.id).single()
      if (!u) return
      setUser(u)
      setLoading(false)
    }
    load()
  }, [isActingAsTrainer])

  if (loading || !user) return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" />
    </div>
  )

  const isAdmin    = user.role === 'admin'
  const isBizOps  = user.role === 'business_ops'
  const isManager  = user.role === 'manager' && !isActingAsTrainer
  const isTrainer  = user.role === 'trainer' || isActingAsTrainer
  const isStaff    = user.role === 'staff'

  if (isAdmin)   return <AdminDashboard user={user} />
  if (isBizOps)  return <BizOpsDashboard user={user} />
  if (isManager) return <ManagerDashboard user={user} />
  if (isTrainer) return <TrainerDashboard user={user} isActingAsTrainer={isActingAsTrainer} />
  if (isStaff)   return <StaffDashboard user={user} />

  return null
}
