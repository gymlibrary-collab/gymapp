'use client'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { useEffect } from 'react'
import { BookOpen, Users, DollarSign, Calendar, Settings, Bell, ChevronRight } from 'lucide-react'

export default function GuidePage() {
  const { user, loading } = useCurrentUser({ allowedRoles: ['business_ops'] })
  const { logActivity } = useActivityLog()

  useEffect(() => { if (!user) return; logActivity('page_view', 'User Guide', 'Viewed Business Operations user guide') }, [user])

  if (loading || !user) return (
    <PageSpinner />
  )

  const sections = [
    {
      icon: Users, heading: 'Staff Management',
      items: [
        'Onboard new staff under HR > Staff Management',
        'Fill in Full Name, Nickname, NRIC, Address, Phone, Email, Nationality, DOB, Joining Date, Probation End Date and Annual Leave Entitlement',
        'Nickname is mandatory — appears in the greeting and birthday notifications',
        'Annual Leave Entitlement is set during onboarding by Biz Ops only',
        'Leave Carry-Forward Days is only in the edit form — new staff always start at 0',
        'To archive a trainer: all active/pending PT packages must be reassigned first via PT > Package Sales',
      ]
    },
    {
      icon: DollarSign, heading: 'Payroll & Commission',
      items: [
        'Generate monthly payslips under Payroll — one per staff member per gym',
        'Commission Payouts is listed above Annual Statements in the sidebar',
        'CPF is calculated automatically from age brackets — ensure staff Date of Birth is set',
        'Approved (unpaid) payslips can be deleted with a mandatory reason — paid payslips are permanent',
        'Correct errors via next-month adjustment — no reversals',
      ]
    },
    {
      icon: Calendar, heading: 'Leave Management',
      items: [
        'Approve or reject manager leave applications under HR > Leave Management',
        'Year-End Leave Reset is at the bottom of Leave Management — available in January only',
        'Before running: resolve all pending December leave first (system blocks if unresolved)',
        'Closing year is auto-detected as current year minus 1',
        'After reset: all staff can apply for new year leave',
        'A reminder banner appears on your dashboard from 28 Dec — session-only dismiss until 1 Jan, then permanent',
      ]
    },
    {
      icon: Settings, heading: 'Configuration',
      items: [
        'Leave Policy: set the global maximum carry-forward days cap',
        'WhatsApp Templates: configure the session reminder message using {{member_name}}, {{trainer_nickname}}, {{session_date}}, {{session_time}}, {{gym_name}}',
        'WhatsApp Notifications: toggle which notifications are active',
        'Commission Rates: set default signup and session commission percentages per gym',
        'Public Holidays: add holidays to exclude from leave calculations',
      ]
    },
    {
      icon: Bell, heading: 'Dashboard Notifications',
      items: [
        'Red banner: membership cancellation approved — dismiss when acknowledged',
        'Blue banner: manager leave pending your approval — goes away when resolved',
        'Amber banner (28 Dec to 1 Jan): reminder to run year-end leave reset in January',
        'All notifications are cross-device — dismissing on one device dismisses on all',
      ]
    },
  ]

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-red-50 rounded-xl"><BookOpen className="w-5 h-5 text-red-600" /></div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">Business Operations Guide</h1>
          <p className="text-xs text-gray-500">Quick reference for your role</p>
        </div>
      </div>

      <div className="card p-4 bg-blue-50 border-blue-100">
        <p className="text-sm text-blue-800">As Business Operations, you oversee all gyms — managing HR, payroll, commissions, leave, configuration and year-end processes.</p>
      </div>

      {sections.map((s, si) => {
        const Icon = s.icon
        return (
          <div key={si} className="card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Icon className="w-4 h-4 text-red-600" />
              <h2 className="font-semibold text-gray-900 text-sm">{s.heading}</h2>
            </div>
            <ul className="space-y-2">
              {s.items.map((item, ii) => (
                <li key={ii} className="flex items-start gap-2 text-sm text-gray-700">
                  <ChevronRight className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )
      })}

      <div className="card p-4 bg-gray-50 border-gray-100">
        <p className="text-xs text-gray-500 text-center">
          Questions? Contact your Business Operations team or system administrator.
        </p>
      </div>
    </div>
  )
}
