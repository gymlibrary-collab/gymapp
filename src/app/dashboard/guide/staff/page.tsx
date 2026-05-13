'use client'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { useEffect } from 'react'
import { BookOpen, Users, Calendar, FileText, Bell, ChevronRight } from 'lucide-react'

export default function GuidePage() {
  const { user, loading } = useCurrentUser({ allowedRoles: ['staff'] })
  const { logActivity } = useActivityLog()

  useEffect(() => { if (!user) return; logActivity('page_view', 'User Guide', 'Viewed Operations Staff user guide') }, [user])

  if (loading || !user) return (
    <PageSpinner />
  )

  const sections = [
    {
      icon: Users, heading: 'Member Registration',
      items: [
        'Register new members under Members > Register New Member',
        'If a member with the same phone number already exists, an amber warning appears — confirm "different person" to proceed, or go back and correct the phone number',
        'After registration you are taken directly to Step 2 to sell a membership',
        'Membership sales are pending until the manager confirms them',
      ]
    },
    {
      icon: Calendar, heading: 'Gym Schedule',
      items: [
        'View the full gym schedule for the next 7 days on your dashboard and under Gym Schedule',
        'The schedule shows all PT sessions colour-coded by trainer',
        'You can see the schedule but client details are visible to trainers and managers only',
      ]
    },
    {
      icon: FileText, heading: 'Membership Cancellations',
      items: [
        'To request a cancellation: open the member profile, click Cancel Membership, select a reason, set the end date and type "confirmed!" to submit',
        'The request goes to the manager for approval',
        'You will be notified on your dashboard if the manager rejects the request',
      ]
    },
    {
      icon: FileText, heading: 'My Account',
      items: [
        'Update your phone number, address and nickname under My Particulars',
        'Apply for leave under My Leave',
        'Leave cannot cross the year boundary — apply up to 31 Dec only',
        'New year leave is unavailable until Business Operations runs the year-end reset in January',
        'View payslips under My Payslips',
      ]
    },
    {
      icon: Bell, heading: 'Notifications',
      items: [
        'Amber banner: your membership sale is pending manager confirmation',
        'Red banner: membership sale rejected — dismiss once acknowledged',
        'Red banner: membership cancellation request rejected — dismiss once acknowledged',
        'Green banner: leave approved or leave decision notified — dismiss once acknowledged',
        'Member birthday tile: members with birthdays today — click to see the full panel',
      ]
    },
  ]

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-red-50 rounded-xl"><BookOpen className="w-5 h-5 text-red-600" /></div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">Operations Staff Guide</h1>
          <p className="text-xs text-gray-500">Quick reference for your role</p>
        </div>
      </div>

      <div className="card p-4 bg-blue-50 border-blue-100">
        <p className="text-sm text-blue-800">As Operations Staff, you handle member registration, membership sales, cancellation requests and day-to-day gym operations.</p>
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
