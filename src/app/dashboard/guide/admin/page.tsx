'use client'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { useEffect } from 'react'
import { BookOpen, Users, FileText, Settings, Calendar, Shield, ChevronRight } from 'lucide-react'
import { PageSpinner } from '@/components/PageSpinner'

export default function GuidePage() {
  const { user, loading } = useCurrentUser({ allowedRoles: ['admin'] })
  const { logActivity } = useActivityLog()

  useEffect(() => { if (!user) return; logActivity('page_view', 'User Guide', 'Viewed Admin user guide') }, [user])

  if (loading || !user) return (<PageSpinner />)

  const sections = [
    {
      icon: Users, heading: 'Business Ops Staff',
      items: [
        'Create and manage Business Operations accounts under Business Ops Staff',
        'Fill in Full Name, Nickname, NRIC, Address, Phone, Email, Nationality and DOB during onboarding',
        'Nickname is mandatory — used in the dashboard greeting and birthday notifications',
        'Each Biz Ops account has full access to all gyms and HR functions',
        'Biz Ops accounts can be archived — this disables login without deleting data',
      ]
    },
    {
      icon: Settings, heading: 'App Settings',
      items: [
        'Set the app name and sidebar logo under App Settings',
        'Configure the auto-logout timeout (in minutes) for all users',
        'Upload a company logo used on payslip PDF headers',
        'Set the fiscal year start month for annual payroll reports',
      ]
    },
    {
      icon: FileText, heading: 'Activity Logs',
      items: [
        'View all staff actions across the system — rolling 14-day window',
        'Filter by date range (Today, Yesterday, Last 3/7/14 days), staff member or action type',
        'Logs include: logins, page views, creates, updates, deletes, approvals, rejections and exports',
        'No sensitive data is logged — only what action was taken and on which page',
        'Export as CSV with full audit trail',
        'Auto-refreshes every 30 seconds',
        'Logs older than 14 days are automatically purged nightly',
      ]
    },
    {
      icon: Calendar, heading: 'Cron Logs',
      items: [
        'Monitor all automated cron job runs under Cron Logs',
        'Use the All / Daily / Reminders filter tabs',
        'Each run shows: started at, duration, status (success/error) and result summary',
        'Daily cron runs at midnight SGT — handles expiry, payroll locks, birthday checks and escalations',
        'Reminder cron runs at 6am and 8am SGT for WhatsApp session reminders',
      ]
    },
    {
      icon: Settings, heading: 'Gym Management',
      items: [
        'Create and manage all gyms under Gym Management',
        'Each gym has a name, address, phone, logo and active status',
        'Deactivating a gym hides it from dropdowns but preserves all historical data',
        'Gym logos appear on payslip PDF headers for that gym',
      ]
    },
    {
      icon: Shield, heading: 'Security',
      items: [
        'All staff authenticate via Google OAuth — no passwords stored',
        'Role-based access control: admin > business_ops > manager > trainer/staff',
        'Users table RLS enabled — staff cannot access other staff salary or NRIC from DevTools',
        'Sensitive field updates (role, salary, commission) blocked by database trigger for browser sessions',
        'Auto-logout applies to all roles after the configured idle period',
      ]
    },
  ]

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-red-50 rounded-xl"><BookOpen className="w-5 h-5 text-red-600" /></div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">Admin Guide</h1>
          <p className="text-xs text-gray-500">Quick reference for your role</p>
        </div>
      </div>
      <div className="card p-4 bg-blue-50 border-blue-100">
        <p className="text-sm text-blue-800">As Admin, you manage the system configuration, Business Ops accounts, gym setup and have full visibility of all activity logs and cron jobs.</p>
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
        <p className="text-xs text-gray-500 text-center">Questions? Contact your system administrator.</p>
      </div>
    </div>
  )
}
