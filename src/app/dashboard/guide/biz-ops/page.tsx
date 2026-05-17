'use client'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useActivityLog } from '@/hooks/useActivityLog'
import { useEffect } from 'react'
import { BookOpen, Users, DollarSign, Calendar, Settings, Bell, FileText, ChevronRight } from 'lucide-react'
import { PageSpinner } from '@/components/PageSpinner'

export default function GuidePage() {
  const { user, loading } = useCurrentUser({ allowedRoles: ['business_ops'] })
  const { logActivity } = useActivityLog()

  useEffect(() => { if (!user) return; logActivity('page_view', 'User Guide', 'Viewed Business Operations user guide') }, [user])

  if (loading || !user) return (<PageSpinner />)

  const sections = [
    {
      icon: Users, heading: 'Staff Management',
      items: [
        'Onboard new staff under HR > Staff Management',
        'Fill in Full Name, Nickname, NRIC, Address, Phone, Email, Nationality, Residency Status, DOB, Joining Date, Probation End Date and Annual Leave Entitlement',
        'Residency Status determines CPF liability — set correctly: Singapore Citizen, PR, Employment Pass, S Pass, Work Permit, etc.',
        'Nickname is mandatory — appears in the greeting and birthday notifications',
        'Set Employment Type (Full-Time or Part-Time) during onboarding',
        'Part-time staff are assigned to one or more gyms via Trainer Gyms',
        'Annual Leave Entitlement is set by Biz Ops only — leave carry-forward is set in the edit form',
        'When archiving staff, the offboarding checklist flags: unpaid payslips, unconfirmed roster shifts, active PT packages and any unprocessed commission items not yet included in a payslip — resolve these before confirming archival',
        'To archive a trainer: all active/pending PT packages must be reassigned first via PT > Package Sales',
      ]
    },
    {
      icon: DollarSign, heading: 'Payroll',
      items: [
        'Generate monthly payslips under Payroll — one per staff member per gym',
        'Part-timer payslips are based on duty roster hours × hourly rate — only confirmed completed shifts are included',
        'Full-timer payslips are based on basic salary + allowances + bonus',
        'CPF is calculated automatically from the age bracket set effective on the payroll period month — ensure staff Date of Birth and Residency Status are set correctly',
        'Add deductions before approving (e.g. overpayment recovery from approved disputes)',
        'Approve draft payslips → Mark Paid to complete the cycle',
        'Paid payslips are permanent — correct errors via next-month adjustment',
        'Annual Statements and CPF submission reports are available under Payroll',
      ]
    },
    {
      icon: DollarSign, heading: 'Commission Payslips',
      items: [
        'In separate payslip mode: generate commission payslips under Payroll > Commission Payouts — one per trainer per period',
        'Commission is calculated from manager-confirmed PT sessions and package signups',
        'Each commission run sweeps all unprocessed items up to the selected period — late-confirmed items from prior months are included automatically and flagged as an amber notice',
        'Approve → Mark Paid to release commission — this stamps all included commission items as paid',
        'In combined payslip mode: commission is automatically folded into the bulk salary payslip — the Commission Payouts page is hidden',
        'Staff can view a breakdown of their commission line items directly on the My Payslips page without downloading the PDF',
      ]
    },
    {
      icon: Settings, heading: 'Payroll Mode',
      items: [
        'Configure payslip generation mode under Config > Payroll Mode',
        'Separate mode (default): salary and commission payslips are generated independently',
        'Combined mode: bulk generation produces one payslip per staff with salary and commission merged — Commission Payouts page is hidden from nav',
        'Switching to combined mode is permanent and cannot be reversed — a confirmation dialog is shown before enabling',
        'Existing separate payslips are unaffected when combined mode is enabled',
      ]
    },
    {
      icon: FileText, heading: 'Duty Roster & Disputes',
      items: [
        'View and manage part-timer duty roster shifts under HR > Duty Roster',
        'Part-timers can dispute a shift status — disputes appear as amber banners on your dashboard',
        'Approve a dispute (marks shift as absent, creates pending deduction for next payslip)',
        'Reject a dispute (returns shift to completed, included in next payslip run)',
        'Shifts are auto-locked 3 calendar days after the shift date to prevent changes',
      ]
    },
    {
      icon: Calendar, heading: 'Leave Management',
      items: [
        'Approve or reject manager leave applications under HR > Leave Management',
        'Year-End Leave Reset is at the bottom of Leave Management — available in January only',
        'Before running: resolve all pending December leave first (system blocks if unresolved)',
        'Closing year is auto-detected as current year minus 1',
        'A reminder banner appears on your dashboard from 28 Dec until reset is run',
      ]
    },
    {
      icon: Settings, heading: 'Configuration',
      items: [
        'Payroll Mode: switch between separate and combined payslip generation (one-way switch)',
        'Leave Policy: set the global maximum carry-forward days cap',
        'WhatsApp Templates: configure reminder messages using {{member_name}}, {{trainer_nickname}}, {{session_date}}, {{session_time}}, {{gym_name}}',
        'WhatsApp Notifications: toggle which notification types are active',
        'Commission Rates: set default signup and session commission percentages per gym',
        'Public Holidays: add holidays to exclude from leave calculations',
        'CPF Brackets: configure CPF age bracket rates and OW/AW ceilings — each period set (identified by effective date) covers all age brackets and both ceilings. Edit an entire period in one form.',
        'CPF changeover: when running payroll for a month that has crossed a new bracket effective date, the system prompts to apply the changeover — removes the oldest period and promotes the pending set to current. You can skip and apply on the next payroll run.',
      ]
    },
    {
      icon: Bell, heading: 'Dashboard Notifications',
      items: [
        'Red banner: shift dispute pending your review — click to open the dispute panel',
        'Blue banner: manager leave pending your approval',
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
        <p className="text-sm text-blue-800">As Business Operations, you oversee all gyms — managing HR, payroll, commissions, duty roster disputes, leave, configuration and year-end processes.</p>
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
