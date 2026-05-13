'use client'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { useEffect } from 'react'
import { BookOpen, Users, Calendar, DollarSign, FileText, Bell, ChevronRight } from 'lucide-react'
import { PageSpinner } from '@/components/PageSpinner'

export default function GuidePage() {
  const { user, loading } = useCurrentUser({ allowedRoles: ['trainer'] })
  const { logActivity } = useActivityLog()

  useEffect(() => { if (!user) return; logActivity('page_view', 'User Guide', 'Viewed Trainer user guide') }, [user])

  if (loading || !user) return (
    <PageSpinner />
  )

  const sections = [
    {
      icon: Users, heading: 'Members & PT Onboarding',
      items: [
        'View all gym members under Members',
        'Onboard a new PT client or renew a package under PT Onboarding',
        'New tab: onboard any active gym member as a new PT client',
        'Renew tab: renew packages for your existing clients',
        'New package sales are pending until the manager confirms them',
      ]
    },
    {
      icon: Calendar, heading: 'PT Sessions',
      items: [
        'Schedule sessions against active packages under My Sessions',
        'For shared packages: select which member (primary or secondary) is attending',
        'After completing a session, submit your session notes — required before commission is calculated',
        'Manager confirms your session notes — once confirmed, commission is included in the next payslip',
        'Members receive an automated WhatsApp reminder the morning before their session',
      ]
    },
    {
      icon: DollarSign, heading: 'Commission',
      items: [
        'Your dashboard shows: session commission, signup commission and total earned this month',
        'Session commission: unlocked when session completed + notes submitted + manager confirmed',
        'Signup commission: credited when a new package is created (not gated on confirmation)',
        'View payslips under My Account > My Payslips',
      ]
    },
    {
      icon: FileText, heading: 'My Account',
      items: [
        'Update your phone number, address and nickname under My Particulars',
        'Nickname is used in your dashboard greeting and in WhatsApp reminders sent to your members',
        'Apply for leave under My Leave',
        'Leave cannot cross the year boundary — apply up to 31 Dec and note your intended return date in the Reason field',
        'New year leave is unavailable until Business Operations runs the year-end reset in January',
      ]
    },
    {
      icon: Bell, heading: 'Notifications',
      items: [
        'Red banner: PT package rejected by manager — dismiss once acknowledged',
        'Red banner: membership sale rejected — dismiss once acknowledged',
        'Green banner: leave approved or leave decision notified — dismiss once acknowledged',
        'Member birthday tile: shows members with birthdays today — click to see the full panel',
      ]
    },
  ]

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-red-50 rounded-xl"><BookOpen className="w-5 h-5 text-red-600" /></div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">Trainer Guide</h1>
          <p className="text-xs text-gray-500">Quick reference for your role</p>
        </div>
      </div>

      <div className="card p-4 bg-blue-50 border-blue-100">
        <p className="text-sm text-blue-800">As a Trainer, you manage your PT clients, schedule and conduct sessions, submit session notes and track your commission.</p>
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
