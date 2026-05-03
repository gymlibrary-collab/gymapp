'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import { ViewModeContext, ViewMode } from '@/lib/view-mode-context'
import {
  Dumbbell, LayoutDashboard, Users, Package, Calendar,
  BarChart3, DollarSign, Settings, LogOut, Menu, ChevronRight,
  FileText, Banknote, X, Building2, UserCheck, Clock,
  Calculator, Briefcase, CreditCard, CalendarDays, Receipt,
  TrendingUp, Layers, UserMinus, MessageSquare
} from 'lucide-react'
import { cn } from '@/lib/utils'

type NavItem = { href?: string; label: string; icon?: any; header?: boolean }

const adminNav: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/admin/staff', label: 'Business Ops Staff', icon: Briefcase },
  { href: '/dashboard/hr/leave', label: 'Leave Approvals', icon: CalendarDays },
  { href: '/dashboard/admin/settings', label: 'App Settings', icon: Settings },
]

const bizOpsNav: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Operations', header: true },
  { href: '/dashboard/membership/sales', label: 'Membership Sales', icon: CreditCard },
  { href: '/dashboard/membership/types', label: 'Membership Types', icon: Layers },
  { href: '/dashboard/pt/packages', label: 'PT Package Templates', icon: Package },
  { href: '/dashboard/payroll/commission', label: 'Commission Payouts', icon: TrendingUp },
  { href: '/dashboard/config/commission', label: 'Commission Rates', icon: DollarSign },
  { href: '/dashboard/payroll/cpf', label: 'CPF Configuration', icon: Calculator },
  { href: '/dashboard/config/public-holidays', label: 'Public Holidays', icon: CalendarDays },
  { href: '/dashboard/config/whatsapp-templates', label: 'WhatsApp Templates', icon: MessageSquare },
  { label: 'HR & Payroll', header: true },
  { href: '/dashboard/hr/staff', label: 'Staff Management', icon: Users },
  { href: '/dashboard/hr/leave', label: 'Leave Management', icon: CalendarDays },
  { href: '/dashboard/payroll', label: 'Monthly Payroll', icon: Banknote },
  { label: 'Reports', header: true },
  { href: '/dashboard/reports', label: 'Summary Reports', icon: BarChart3 },
  { label: 'My Account', header: true },
  { href: '/dashboard/my/payslips', label: 'My Payslips', icon: Receipt },
  { href: '/dashboard/my/leave', label: 'My Leave', icon: CalendarDays },
]

const managerNav: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Members', header: true },
  { href: '/dashboard/members', label: 'Members', icon: Users },
  { href: '/dashboard/membership/sales', label: 'Membership Sales', icon: CreditCard },
  { label: 'Personal Training', header: true },
  { href: '/dashboard/pt/sessions', label: 'PT Schedule', icon: Calendar },
  { label: 'Operations', header: true },
  { href: '/dashboard/hr/staff', label: 'My Trainers', icon: UserCheck },
  { href: '/dashboard/hr/roster', label: 'Duty Roster', icon: CalendarDays },
  { href: '/dashboard/hr/leave', label: 'Leave Management', icon: CalendarDays },
  { href: '/dashboard/pt/capacity', label: 'Trainer Capacity', icon: TrendingUp },
  { href: '/dashboard/reports', label: 'Reports', icon: BarChart3 },
  { href: '/dashboard/my/payslips', label: 'My Payslips', icon: Receipt },
  { href: '/dashboard/my/leave', label: 'My Leave', icon: CalendarDays },
]

const trainerViewNav: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/members', label: 'My Members', icon: Users },
  { href: '/dashboard/pt/sessions', label: 'My Sessions', icon: Calendar },
  { href: '/dashboard/my/payslips', label: 'My Payslips', icon: Receipt },
  // My Leave intentionally omitted — manager-trainers apply for leave from Manager View only
  // to avoid duplicate applications and confusion about which role the leave is for
]

const pureTrainerNav: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/members', label: 'My Members', icon: Users },
  { href: '/dashboard/pt/sessions', label: 'My Sessions', icon: Calendar },
  { href: '/dashboard/membership/sales', label: 'Log Membership Sale', icon: CreditCard },
  { href: '/dashboard/my/payslips', label: 'My Payslips', icon: Receipt },
  { href: '/dashboard/my/leave', label: 'My Leave', icon: CalendarDays },
]

const partTimerNav: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/my/roster', label: 'My Roster', icon: CalendarDays },
  { href: '/dashboard/membership/sales', label: 'Log Membership Sale', icon: CreditCard },
  { href: '/dashboard/my/payslips', label: 'My Payslips', icon: Receipt },
  // My Leave intentionally excluded — part-timers do not apply for leave in this system
]

const staffNav: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/membership/sales', label: 'Log Membership Sale', icon: CreditCard },
  { href: '/dashboard/members', label: 'Member Lookup', icon: Users },
  { href: '/dashboard/pt/sessions', label: 'Gym Schedule', icon: Calendar },
  { href: '/dashboard/my/payslips', label: 'My Payslips', icon: Receipt },
  { href: '/dashboard/my/leave', label: 'My Leave', icon: CalendarDays },
]

const VIEW_KEY = 'gymapp_view_mode'
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click', 'keydown'] as const

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null)
  const [sidebarLogo, setSidebarLogo] = useState<string | null>(null)
  const [gymName, setGymName] = useState('GymApp')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showWarning, setShowWarning] = useState(false)
  const [countdown, setCountdown] = useState(60)
  const [autoLogoutMinutes, setAutoLogoutMinutes] = useState(10)
  const [viewMode, setViewMode] = useState<ViewMode>('manager')
  const [initError, setInitError] = useState<string | null>(null)

  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const logoutMinutesRef = useRef(10)
  const countdownRef = useRef(60)
  const isLoggedInRef = useRef(false)

  const stopAllTimers = () => {
    if (inactivityTimerRef.current) { clearTimeout(inactivityTimerRef.current); inactivityTimerRef.current = null }
    if (countdownTimerRef.current) { clearInterval(countdownTimerRef.current); countdownTimerRef.current = null }
  }

  const performLogout = async (reason: 'timeout' | 'manual' = 'timeout') => {
    stopAllTimers(); isLoggedInRef.current = false; sessionStorage.removeItem(VIEW_KEY)
    await supabase.auth.signOut(); router.push(reason === 'timeout' ? '/?reason=timeout' : '/')
  }

  const startCountdown = () => {
    countdownRef.current = 60; setCountdown(60); setShowWarning(true)
    countdownTimerRef.current = setInterval(() => {
      countdownRef.current -= 1; setCountdown(countdownRef.current)
      if (countdownRef.current <= 0) { stopAllTimers(); performLogout('timeout') }
    }, 1000)
  }

  const startInactivityTimer = () => {
    stopAllTimers(); setShowWarning(false)
    inactivityTimerRef.current = setTimeout(startCountdown, Math.max(logoutMinutesRef.current * 60 * 1000 - 60_000, 0))
  }

  const handleActivity = () => { if (!isLoggedInRef.current || countdownTimerRef.current) return; startInactivityTimer() }

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (error || !session) { router.push('/'); return }
        const { data: u } = await supabase.from('users').select('*').eq('id', session.user.id).single()
        if (!u) { await supabase.auth.signOut(); router.push('/?error=not_authorised'); return }
        if (u.is_archived || !u.is_active) { await supabase.auth.signOut(); router.push('/?error=account_disabled'); return }
        setUser(u); isLoggedInRef.current = true
        if (u.role === 'manager' && u.is_also_trainer) {
          const saved = sessionStorage.getItem(VIEW_KEY) as ViewMode | null
          setViewMode(saved || 'manager')
        }
        const { data: settings } = await supabase.from('app_settings').select('admin_sidebar_logo_url, auto_logout_minutes').eq('id', 'global').single()
        const mins = settings?.auto_logout_minutes || 10; logoutMinutesRef.current = mins; setAutoLogoutMinutes(mins)
        if (u.role === 'admin') {
          setSidebarLogo(settings?.admin_sidebar_logo_url ? settings.admin_sidebar_logo_url + '?t=' + Date.now() : null); setGymName('Gym Library')
        } else if ((u.role === 'manager' || u.role === 'staff') && u.manager_gym_id) {
          const { data: gym } = await supabase.from('gyms').select('name, logo_url').eq('id', u.manager_gym_id).single()
          if (gym) { setSidebarLogo(gym.logo_url ? gym.logo_url + '?t=' + Date.now() : null); setGymName(gym.name) }
        } else if (u.role === 'trainer') {
          const { data: tg } = await supabase.from('trainer_gyms').select('gyms(name, logo_url)').eq('trainer_id', session.user.id).eq('is_primary', true).single()
          if (tg && (tg as any).gyms) { setSidebarLogo((tg as any).gyms.logo_url ? (tg as any).gyms.logo_url + '?t=' + Date.now() : null); setGymName((tg as any).gyms.name) }
        } else {
          const { data: gyms } = await supabase.from('gyms').select('name, logo_url').eq('is_active', true).limit(1)
          if (gyms?.[0]) { setSidebarLogo(gyms[0].logo_url ? gyms[0].logo_url + '?t=' + Date.now() : null); setGymName(gyms[0].name) }
        }
        startInactivityTimer()
        ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, handleActivity, { passive: true }))
      } catch (e: any) { setInitError(e.message) }
    }
    init()
    return () => { stopAllTimers(); ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, handleActivity)); isLoggedInRef.current = false }
  }, [])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT') { stopAllTimers(); router.push('/') } })
    return () => subscription.unsubscribe()
  }, [])

  const switchView = (mode: ViewMode) => { sessionStorage.setItem(VIEW_KEY, mode); setViewMode(mode); setSidebarOpen(false) }

  if (initError) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="card p-6 max-w-sm w-full text-center space-y-3">
        <p className="text-red-600 font-medium">Something went wrong</p>
        <p className="text-xs text-gray-500">{initError}</p>
        <button onClick={() => router.push('/')} className="btn-primary w-full">Back to Login</button>
      </div>
    </div>
  )

  if (!user) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" /></div>

  const isManagerTrainer = user.role === 'manager' && !!user.is_also_trainer
  const isPartTime = user.employment_type === 'part_time'
  const isActingAsTrainer = user.role === 'trainer' ? true : (isManagerTrainer && viewMode === 'trainer')

  let nav: NavItem[]
  let portalLabel: string
  if (user.role === 'admin') { nav = adminNav; portalLabel = 'Admin Portal' }
  else if (user.role === 'business_ops') { nav = bizOpsNav; portalLabel = 'Business Ops Portal' }
  else if (user.role === 'staff') { nav = staffNav; portalLabel = 'Operations Staff Portal' }
  else if (user.role === 'trainer' && isPartTime) { nav = partTimerNav; portalLabel = 'Part-time Staff Portal' }
  else if (user.role === 'trainer') { nav = pureTrainerNav; portalLabel = 'Trainer Portal' }
  else if (isManagerTrainer && viewMode === 'trainer') { nav = trainerViewNav; portalLabel = 'Trainer View' }
  else { nav = managerNav; portalLabel = isManagerTrainer ? 'Manager View' : 'Manager Portal' }

  const SidebarInner = () => (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      <div className="flex items-center gap-2 p-4 border-b border-gray-200 flex-shrink-0">
        {sidebarLogo ? <img src={sidebarLogo} alt={gymName} className="h-8 w-auto max-w-[32px] object-contain rounded-lg flex-shrink-0" onError={() => setSidebarLogo(null)} /> : <div className="bg-red-600 p-2 rounded-lg flex-shrink-0"><Dumbbell className="w-4 h-4 text-white" /></div>}
        <div className="flex-1 min-w-0"><p className="font-bold text-gray-900 text-sm truncate">{gymName}</p><p className="text-xs text-gray-500">{portalLabel}</p></div>
        <button onClick={() => setSidebarOpen(false)} className="md:hidden p-1 text-gray-400"><X className="w-4 h-4" /></button>
      </div>

      {isManagerTrainer && (
        <div className="px-3 pt-3 pb-1">
          <p className="text-xs text-gray-400 mb-2 font-medium px-1">Switch view</p>
          <div className="flex gap-1.5">
            <button onClick={() => switchView('manager')} className={cn('flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-medium border transition-colors', viewMode === 'manager' ? 'bg-yellow-50 border-yellow-300 text-yellow-800' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100')}>
              <UserCheck className="w-3.5 h-3.5 flex-shrink-0" /> Manager {viewMode === 'manager' && '✓'}
            </button>
            <button onClick={() => switchView('trainer')} className={cn('flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-medium border transition-colors', viewMode === 'trainer' ? 'bg-red-50 border-red-300 text-red-800' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100')}>
              <Dumbbell className="w-3.5 h-3.5 flex-shrink-0" /> Trainer {viewMode === 'trainer' && '✓'}
            </button>
          </div>
        </div>
      )}

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {nav.map((item, i) => {
          if (item.header) return <p key={i} className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 pt-3 pb-1">{item.label}</p>
          const Icon = item.icon!
          const active = pathname === item.href || (
            item.href !== '/dashboard' &&
            item.href !== '/dashboard/payroll' &&
            pathname.startsWith(item.href! + '/')
          )
          return (
            <Link key={item.href} href={item.href!} onClick={() => setSidebarOpen(false)}
              className={cn('flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors', active ? 'bg-red-50 text-red-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900')}>
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 truncate">{item.label}</span>
              {active && <ChevronRight className="w-3 h-3 text-red-600 flex-shrink-0" />}
            </Link>
          )
        })}
      </nav>

      <div className="flex-shrink-0 border-t border-gray-200">
        <div className="p-3 flex items-center gap-2">
          <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-red-700 font-semibold text-xs">{user.full_name.charAt(0)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{user.full_name}</p>
            <p className="text-xs text-gray-500">{
  isManagerTrainer ? 'Manager / Trainer' :
  user.role === 'staff' ? 'Operations Staff' :
  user.role === 'business_ops' ? 'Business Ops' :
  user.role.charAt(0).toUpperCase() + user.role.slice(1)
}{isPartTime && ' · Part-time'}</p>
          </div>
          <button onClick={() => performLogout('manual')} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors flex-shrink-0"><LogOut className="w-4 h-4" /></button>
        </div>
        <div className="px-4 pb-3 flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-gray-300 flex-shrink-0" />
          <p className="text-xs text-gray-300">Auto logout: {autoLogoutMinutes}m</p>
        </div>
      </div>
    </div>
  )

  return (
    <ViewModeContext.Provider value={{ viewMode, isActingAsTrainer }}>
      <div className="hidden md:block fixed top-0 left-0 bottom-0 w-60 z-30"><SidebarInner /></div>
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="absolute top-0 left-0 bottom-0 w-64 z-50"><SidebarInner /></div>
        </div>
      )}
      {showWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full text-center space-y-4">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto"><Clock className="w-8 h-8 text-amber-600" /></div>
            <div><h2 className="text-lg font-bold text-gray-900">Still there?</h2><p className="text-sm text-gray-500 mt-1">You'll be logged out due to inactivity.</p></div>
            <div className="bg-amber-50 rounded-xl p-4"><p className="text-4xl font-bold text-amber-600 tabular-nums">{countdown}</p><p className="text-xs text-amber-500 mt-1">seconds remaining</p></div>
            <div className="flex gap-3">
              <button onClick={() => { stopAllTimers(); setShowWarning(false); startInactivityTimer() }} className="btn-primary flex-1">Stay Logged In</button>
              <button onClick={() => performLogout('manual')} className="btn-secondary flex-1">Log Out</button>
            </div>
          </div>
        </div>
      )}
      <div className="md:pl-60 flex flex-col min-h-screen bg-gray-50">
        <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 sticky top-0 z-20">
          <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg hover:bg-gray-100"><Menu className="w-5 h-5 text-gray-600" /></button>
          <div className="flex items-center gap-2">
            {sidebarLogo ? <img src={sidebarLogo} alt={gymName} className="h-6 w-auto object-contain" /> : <Dumbbell className="w-5 h-5 text-red-600" />}
            <span className="font-bold text-gray-900 text-sm">{gymName}</span>
            {isManagerTrainer && <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium', viewMode === 'manager' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700')}>{viewMode === 'manager' ? 'Mgr' : 'Trainer'}</span>}
          </div>
          <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center"><span className="text-red-700 font-semibold text-xs">{user.full_name.charAt(0)}</span></div>
        </div>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </ViewModeContext.Provider>
  )
}
