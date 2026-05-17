'use client'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { useEffect } from 'react'
import { BookOpen, Users, DollarSign, Calendar, Bell, FileText, ChevronRight } from 'lucide-react'
import { PageSpinner } from '@/components/PageSpinner'

export default function GuidePage() {
  const { user, loading } = useCurrentUser({ allowedRoles: ['manager'] })
  const { logActivity } = useActivityLog()

  useEffect(() => { if (!user) return; logActivity('page_view', 'User Guide', 'Viewed Manager user guide') }, [user])

  if (loading || !user) return (<PageSpinner />)

  const sections = [
    {
      icon: Users, heading: 'Members & Membership Sales',
      items: [
        'View all members at your gym under Members',
        'Click any member to see their profile: particulars, active membership, PT packages and session history',
        'Staff membership sales appear as pending — confirm or reject under Membership Sales',
        'To approve a cancellation request: open the member profile and act on the red banner',
        'You can cancel a membership directly from the member profile without a staff request',
      ]
    },
    {
      icon: DollarSign, heading: 'PT Package Sales & Sessions',
      items: [
        'Confirm or reject pending PT package sales from trainers under PT Package Sales',
        'To reassign a package to a different trainer: click Reassign, select the new trainer and confirm',
        'Confirm completed session notes under PT Schedule — this unlocks the trainer\'s commission',
        'Sessions with submitted notes appear as pending confirmation on your dashboard',
      ]
    },
    {
      icon: FileText, heading: 'Duty Roster (Part-Timers)',
      items: [
        'Add, edit and manage part-timer shifts under HR > Duty Roster',
        'Add shifts for one or multiple part-timers at once using the bulk add form',
        'Part-timers can dispute a shift — disputed shifts show as orange and are excluded from payroll until resolved',
        'Lock a shift early to prevent changes (shifts auto-lock after 3 calendar days)',
        'Use month view to see the full payroll period at a glance',
      ]
    },
    {
      icon: Calendar, heading: 'Leave Management',
      items: [
        'Approve or reject trainer and staff leave under Leave Management — you can only approve leave for staff assigned to your gym',
        'Your own leave goes to Business Operations for approval — it does not appear in your own pending count',
        'Dashboard shows: at-risk members (no sessions in 30 days), expiring memberships and expiring packages',
      ]
    },
    {
      icon: Users, heading: 'My Gym & My Staff',
      items: [
        'View your gym\'s details and upload a gym logo under My Gym',
        'See all trainers\' session capacity and targets under Trainer Capacity',
        'View staff profiles including residency status under My Staff (read-only)',
        'Add or edit Trainer and Operations Staff accounts under My Staff',
        'Part-time staff show their assigned gyms and hourly rate on their profile card',
      ]
    },
    {
      icon: Bell, heading: 'Dashboard Notifications',
      items: [
        'Red banner: pending membership cancellation requests awaiting your approval',
        'Amber banner: pending membership sales or PT package sales awaiting your confirmation',
        'Staff birthday panel: staff with birthdays in the next 7 days',
        'Member birthday tile: members with birthdays today',
        'Dispute resolution banners: green (resolved) or red (rejected) after Biz Ops acts on a dispute',
      ]
    },
  ]

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-red-50 rounded-xl"><BookOpen className="w-5 h-5 text-red-600" /></div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">Manager Portal Guide</h1>
          <p className="text-xs text-gray-500">Quick reference for your role</p>
        </div>
      </div>
      <div className="card p-4 bg-blue-50 border-blue-100">
        <p className="text-sm text-blue-800">As Manager, you oversee your gym\'s daily operations — confirming sales, approving leave, managing PT sessions, scheduling part-timer shifts and keeping your team on track.</p>
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
        <p className="text-xs text-gray-500 text-center">Questions? Contact your Business Operations team or system administrator.</p>
      </div>
    </div>
  )
}
