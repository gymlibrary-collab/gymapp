'use client'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { useEffect } from 'react'
import { BookOpen, Users, FileText, Settings, Calendar, ChevronRight } from 'lucide-react'

export default function GuidePage() {
  const { user, loading } = useCurrentUser({ allowedRoles: ['admin'] })
  const { logActivity } = useActivityLog()

  useEffect(() => { if (!user) return; logActivity('page_view', 'User Guide', 'Viewed Admin user guide') }, [user])

  if (loading || !user) return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600" />
    </div>
  )

  const sections = [
    {
      icon: Users, heading: 'Business Ops Staff',
      items: [
        'Create and manage Business Operations accounts from Business Ops Staff in the sidebar',
        'Fill in Full Name, Nickname, NRIC, Address, Phone, Email, Nationality and DOB during onboarding',
        'Nickname is mandatory — used in the dashboard greeting and birthday notifications',
        'Each Biz Ops account has full access to all gyms and HR functions',
      ]
    },
    {
      icon: Settings, heading: 'App Settings',
      items: [
        'Set the app name and sidebar logo under App Settings',
        'Configure the auto-logout timeout (in minutes) for all users',
        'Upload a company logo used on payslip PDF headers',
      ]
    },
    {
      icon: FileText, heading: 'Activity Logs',
      items: [
        'View all staff actions across the system — rolling 14-day window',
        'Logs include: logins, page views, creates, updates, deletes, confirmations, rejections and exports',
        'No sensitive data is logged — only what action was taken and on which page',
        'Export as CSV with a custom date range',
        'Auto-refreshes every 30 seconds',
      ]
    },
    {
      icon: Calendar, heading: 'Cron Logs',
      items: [
        'Monitor all automated cron job runs under Cron Logs',
        'Use the All / Daily / Reminders filter tabs',
        'Daily cron runs 9 jobs at 0001 SGT — expire memberships, packages, escalations, birthday refreshes',
        'Reminder cron: 0600 SGT prepares WhatsApp queue, 0800 SGT sends reminders',
        'Each run shows: start time, duration, status (success/error) and result summary',
      ]
    },
    {
      icon: FileText, heading: 'Leave Approvals',
      items: [
        'You can view and approve leave applications from the Leave Approvals page',
        'Covers all roles — useful if Business Ops is unavailable',
      ]
    },
  ]

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-red-50 rounded-xl"><BookOpen className="w-5 h-5 text-red-600" /></div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">Admin Portal Guide</h1>
          <p className="text-xs text-gray-500">Quick reference for your role</p>
        </div>
      </div>

      <div className="card p-4 bg-blue-50 border-blue-100">
        <p className="text-sm text-blue-800">As Admin, you manage system-wide configuration, Business Ops accounts, and have full visibility of all activity and cron job health across the system.</p>
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
