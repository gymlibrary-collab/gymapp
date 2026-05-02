'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import { ViewModeContext, ViewMode } from '@/lib/view-mode-context'
import {
  Dumbbell, LayoutDashboard, Users, Package, Calendar,
  BarChart3, DollarSign, Settings, LogOut, Menu, ChevronRight,
  FileText, Banknote, X, Building2, UserCheck, Clock,
  Calculator, Briefcase
} from 'lucide-react'
import { cn } from '@/lib/utils'

const adminNav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/admin-gyms', label: 'Gym Clubs', icon: Building2 },
  { href: '/dashboard/packages', label: 'PT Packages', icon: Package },
  { href: '/dashboard/admin-staff', label: 'Business Ops Staff', icon: Briefcase },
  { href: '/dashboard/settings', label: 'App Settings', icon: Settings },
]

// Manager view: management functions ONLY
const managerNav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/manager-trainers', label: 'My Trainers', icon: UserCheck },
  { href: '/dashboard/clients', label: 'Members', icon: Users },
  { href: '/dashboard/sessions', label: 'Sessions', icon: Calendar },
  { href: '/dashboard/payouts', label: 'Payouts', icon: DollarSign },
  { href: '/dashboard/reports', label: 'Monthly Reports', icon: BarChart3 },
  { href: '/dashboard/reports/activity', label: 'Activity Report', icon: FileText },
]

// Trainer view: trainer functions ONLY
const trainerNav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/clients', label: 'My Members', icon: Users },
  { href: '/dashboard/sessions', label: 'My Sessions', icon: Calendar },
  { href: '/dashboard/reports', label: 'My Reports', icon: BarChart3 },
  { href: '/dashboard/reports/activity', label: 'Activity Report', icon: FileText },
]

const bizOpsNav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/trainers', label: 'Staff Management', icon: Users },
  { href: '/dashboard/business-ops/gyms', label: 'Gym Clubs', icon: Building2 },
  { href: '/dashboard/packages', label: 'Package Templates', icon: Package },
  { href: '/dashboard/clients', label: 'All Members', icon: Users },
  { href: '/dashboard/sessions', label: 'All Sessions', icon: Calendar },
  { href: '/dashboard/payouts', label: 'Payouts', icon: DollarSign },
  { href: '/dashboard/reports', label: 'Monthly Reports', icon: BarChart3 },
  { href: '/dashboard/reports/activity', label: 'Activity Report', icon: FileText },
  { href: '/dashboard/payroll', label: 'Payroll', icon: Banknote },
  { href: '/dashboard/cpf-config', label: 'CPF Configuration', icon: Calculator },
]

const roleLabels: Record<string, string> = {
  admin: 'Admin', manager: 'Manager', business_ops: 'Business Ops', trainer: 'Trainer',
}

const VIEW_KEY = 'gymapp_view_mode'
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click']

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
  const inactivityTimer = useRef<NodeJS.Timeout | null>(null)
  const countdownInterval = useRef<NodeJS.Timeout | null>(null)
  const logoutMinutesRef = useRef(10)

  const doLogout = useCallback(async () => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current)
    if (countdownInterval.current) clearInterval(countdownInterval.current)
    sessionStorage.removeItem(VIEW_KEY)
    await supabase.auth.signOut(); router.push('/?reason=timeout')
  }, [])

  const clearAllTimers = () => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current)
    if (countdownInterval.current) clearInterval(countdownInterval.current)
  }

  const startWarning = useCallback(() => {
    setShowWarning(true); setCountdown(60)
    countdownInterval.current = setInterval(() => {
      setCountdown(p => { if (p <= 1) { clearInterval(countdownInterval.current!); doLogout(); return 0 } return p - 1 })
    }, 1000)
  }, [doLogout])

  const resetTimer = useCallback(() => {
    clearAllTimers(); setShowWarning(false)
    const ms = Math.max((logoutMinutesRef.current * 60 - 60) * 1000, 0)
    inactivityTimer.current = setTimeout(startWarning, ms)
  }, [startWarning])

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (error || !session) { router.push('/'); return }
        const { data: u } = await supabase.from('users').select('*').eq('id', session.user.id).single()
        if (!u) { await supabase.auth.signOut(); router.push('/?error=not_authorised'); return }
        if (u.is_archived || !u.is_active) { await supabase.auth.signOut(); router.push('/?error=account_disabled'); return }
        setUser(u)

        // Read saved view mode for manager-trainers
        if (u.role === 'manager' && u.is_also_trainer) {
          const saved = sessionStorage.getItem(VIEW_KEY) as ViewMode | null
          setViewMode(saved || 'manager')
        }

        const { data: settings } = await supabase.from('app_settings')
          .select('admin_sidebar_logo_url, auto_logout_minutes').eq('id', 'global').single()
        const mins = settings?.auto_logout_minutes || 10
        setAutoLogoutMinutes(mins); logoutMinutesRef.current = mins

        if (u.role === 'admin') {
          setSidebarLogo(settings?.admin_sidebar_logo_url ? settings.admin_sidebar_logo_url + '?t=' + Date.now() : null)
          setGymName('Gym Library')
        } else if (u.role === 'manager' && u.manager_gym_id) {
          const { data: gym } = await supabase.from('gyms').select('name, logo_url').eq('id', u.manager_gym_id).single()
          if (gym) { setSidebarLogo(gym.logo_url ? gym.logo_url + '?t=' + Date.now() : null); setGymName(gym.name) }
        } else if (u.role === 'trainer') {
          const { data: tg } = await supabase.from('trainer_gyms').select('gyms(name, logo_url)').eq('trainer_id', session.user.id).eq('is_primary', true).single()
          if (tg && (tg as any).gyms) {
            setSidebarLogo((tg as any).gyms.logo_url ? (tg as any).gyms.logo_url + '?t=' + Date.now() : null)
            setGymName((tg as any).gyms.name)
          }
        } else {
          const { data: gyms } = await supabase.from('gyms').select('name, logo_url').eq('is_active', true).limit(1)
          if (gyms?.[0]) { setSidebarLogo(gyms[0].logo_url ? gyms[0].logo_url + '?t=' + Date.now() : null); setGymName(gyms[0].name) }
        }
      } catch (e: any) { setInitError(e.message) }
    }
    init()
  }, [])

  useEffect(() => {
    if (!user) return
    resetTimer()
    const h = () => resetTimer()
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, h, { passive: true }))
    return () => { clearAllTimers(); ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, h)) }
  }, [user, resetTimer])

  const handleLogout = async () => {
    clearAllTimers(); sessionStorage.removeItem(VIEW_KEY)
    await supabase.auth.signOut(); router.push('/')
  }

  // KEY FIX: switchView only updates state — NO router.push()
  // router.push() was causing the layout to re-mount, re-read sessionStorage,
  // and re-initialize viewMode before the context could propagate to child pages.
  const switchView = (mode: ViewMode) => {
    sessionStorage.setItem(VIEW_KEY, mode)  // persist for page refreshes
    setViewMode(mode)                        // update React state → context updates → pages re-render
    setSidebarOpen(false)
    // Do NOT navigate — stay on current page so context propagates in the same render tree
  }

  if (initError) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="card p-6 max-w-sm w-full text-center space-y-3">
        <p className="text-red-600 font-medium">Something went wrong</p>
        <p className="text-xs text-gray-500">{initError}</p>
        <button onClick={() => router.push('/')} className="btn-primary w-full">Back to Login</button>
      </div>
    </div>
  )

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" />
    </div>
  )

  const isManagerTrainer = user.role === 'manager' && !!user.is_also_trainer

  // isActingAsTrainer = true ONLY when pure trainer OR manager-trainer in trainer view
  const isActingAsTrainer: boolean = user.role === 'trainer'
    ? true
    : isManagerTrainer && viewMode === 'trainer'

  // Pick nav — strictly one set, zero mixing
  let nav: typeof managerNav
  let portalLabel: string
  if (user.role === 'admin') {
    nav = adminNav; portalLabel = 'Admin Portal'
  } else if (user.role === 'business_ops') {
    nav = bizOpsNav; portalLabel = 'Business Ops Portal'
  } else if (user.role === 'trainer') {
    nav = trainerNav; portalLabel = 'Trainer Portal'
  } else if (isManagerTrainer && viewMode === 'trainer') {
    nav = trainerNav; portalLabel = 'Trainer View'
  } else {
    // manager (pure) OR manager-trainer in manager view
    nav = managerNav; portalLabel = isManagerTrainer ? 'Manager View' : 'Manager Portal'
  }

  const SidebarInner = () => (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* Header */}
      <div className="flex items-center gap-2 p-4 border-b border-gray-200 flex-shrink-0">
        {sidebarLogo
          ? <img src={sidebarLogo} alt={gymName} className="h-8 w-auto max-w-[32px] object-contain rounded-lg flex-shrink-0" onError={() => setSidebarLogo(null)} />
          : <div className="bg-red-600 p-2 rounded-lg flex-shrink-0"><Dumbbell className="w-4 h-4 text-white" /></div>
        }
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-sm truncate">{gymName}</p>
          <p className="text-xs text-gray-500">{portalLabel}</p>
        </div>
        <button onClick={() => setSidebarOpen(false)} className="md:hidden p-1 text-gray-400 flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* View switcher — ONLY for manager-trainers */}
      {isManagerTrainer && (
        <div className="px-3 pt-3 pb-1">
          <p className="text-xs text-gray-400 mb-2 font-medium px-1">Switch view</p>
          <div className="flex gap-1.5">
            <button
              onClick={() => switchView('manager')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-medium transition-colors border',
                viewMode === 'manager'
                  ? 'bg-yellow-50 border-yellow-300 text-yellow-800'
                  : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
              )}>
              <UserCheck className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Manager</span>
              {viewMode === 'manager' && <span className="font-bold">✓</span>}
            </button>
            <button
              onClick={() => switchView('trainer')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-medium transition-colors border',
                viewMode === 'trainer'
                  ? 'bg-red-50 border-red-300 text-red-800'
                  : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
              )}>
              <Dumbbell className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Trainer</span>
              {viewMode === 'trainer' && <span className="font-bold">✓</span>}
            </button>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          return (
            <Link key={href + label} href={href} onClick={() => setSidebarOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                active ? 'bg-red-50 text-red-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}>
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 truncate">{label}</span>
              {active && <ChevronRight className="w-3 h-3 text-red-600 flex-shrink-0" />}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="flex-shrink-0 border-t border-gray-200">
        <div className="p-3">
          <div className="flex items-center gap-2 p-2 rounded-lg">
            <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-red-700 font-semibold text-xs">{user.full_name.charAt(0)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user.full_name}</p>
              <p className="text-xs text-gray-500">
                {isManagerTrainer ? 'Manager / Trainer' : roleLabels[user.role] || user.role}
              </p>
            </div>
            <button onClick={handleLogout}
              className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors flex-shrink-0">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
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
      {/* Desktop sidebar */}
      <div className="hidden md:block fixed top-0 left-0 bottom-0 w-56 z-30">
        <SidebarInner />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="absolute top-0 left-0 bottom-0 w-64 z-50"><SidebarInner /></div>
        </div>
      )}

      {/* Auto logout warning */}
      {showWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full text-center space-y-4">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
              <Clock className="w-8 h-8 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Still there?</h2>
              <p className="text-sm text-gray-500 mt-1">You'll be logged out due to inactivity.</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-4">
              <p className="text-3xl font-bold text-amber-600">{countdown}</p>
              <p className="text-xs text-amber-500 mt-1">seconds remaining</p>
            </div>
            <div className="flex gap-3">
              <button onClick={resetTimer} className="btn-primary flex-1">Stay Logged In</button>
              <button onClick={doLogout} className="btn-secondary flex-1">Log Out Now</button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="md:pl-56 flex flex-col min-h-screen bg-gray-50">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 sticky top-0 z-20">
          <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg hover:bg-gray-100">
            <Menu className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex items-center gap-2">
            {sidebarLogo
              ? <img src={sidebarLogo} alt={gymName} className="h-6 w-auto object-contain" />
              : <Dumbbell className="w-5 h-5 text-red-600" />
            }
            <span className="font-bold text-gray-900 text-sm">{gymName}</span>
            {isManagerTrainer && (
              <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium',
                viewMode === 'manager' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700')}>
                {viewMode === 'manager' ? 'Mgr' : 'Trainer'}
              </span>
            )}
          </div>
          <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
            <span className="text-red-700 font-semibold text-xs">{user.full_name.charAt(0)}</span>
          </div>
        </div>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </ViewModeContext.Provider>
  )
}
