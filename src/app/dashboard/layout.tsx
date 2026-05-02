'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import { User } from '@/types'
import {
  Dumbbell, LayoutDashboard, Users, Package, Calendar,
  BarChart3, DollarSign, Settings, LogOut, Menu, ChevronRight,
  FileText, Banknote, X, Building2, UserCheck, Clock
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems: Record<string, { href: string; label: string; icon: any }[]> = {
  admin: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/dashboard/trainers', label: 'Staff Management', icon: Users },
    { href: '/dashboard/packages', label: 'Package Templates', icon: Package },
    { href: '/dashboard/settings', label: 'Settings', icon: Settings },
  ],
  manager: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/dashboard/manager-trainers', label: 'My Trainers', icon: UserCheck },
    { href: '/dashboard/clients', label: 'Clients', icon: Users },
    { href: '/dashboard/sessions', label: 'Sessions', icon: Calendar },
    { href: '/dashboard/payouts', label: 'Payouts', icon: DollarSign },
    { href: '/dashboard/reports', label: 'Monthly Reports', icon: BarChart3 },
    { href: '/dashboard/reports/activity', label: 'Activity Report', icon: FileText },
  ],
  business_ops: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/dashboard/clients', label: 'All Clients', icon: Users },
    { href: '/dashboard/sessions', label: 'All Sessions', icon: Calendar },
    { href: '/dashboard/payouts', label: 'Payouts', icon: DollarSign },
    { href: '/dashboard/reports', label: 'Monthly Reports', icon: BarChart3 },
    { href: '/dashboard/reports/activity', label: 'Activity Report', icon: FileText },
    { href: '/dashboard/payroll', label: 'Payroll', icon: Banknote },
  ],
  trainer: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/dashboard/clients', label: 'My Clients', icon: Users },
    { href: '/dashboard/sessions', label: 'My Sessions', icon: Calendar },
    { href: '/dashboard/reports', label: 'My Reports', icon: BarChart3 },
    { href: '/dashboard/reports/activity', label: 'Activity Report', icon: FileText },
  ],
}

const roleLabels: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  business_ops: 'Business Ops',
  trainer: 'Trainer',
}

const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click']

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [sidebarLogo, setSidebarLogo] = useState<string | null>(null)
  const [gymName, setGymName] = useState<string>('GymApp')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showWarning, setShowWarning] = useState(false)
  const [countdown, setCountdown] = useState(60)
  const [autoLogoutMinutes, setAutoLogoutMinutes] = useState(10)
  const [initError, setInitError] = useState<string | null>(null)

  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  const inactivityTimer = useRef<NodeJS.Timeout | null>(null)
  const warningTimer = useRef<NodeJS.Timeout | null>(null)
  const countdownInterval = useRef<NodeJS.Timeout | null>(null)
  const logoutMinutesRef = useRef(10)

  const doLogout = useCallback(async () => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current)
    if (warningTimer.current) clearTimeout(warningTimer.current)
    if (countdownInterval.current) clearInterval(countdownInterval.current)
    await supabase.auth.signOut()
    router.push('/?reason=timeout')
  }, [])

  const clearAllTimers = () => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current)
    if (warningTimer.current) clearTimeout(warningTimer.current)
    if (countdownInterval.current) clearInterval(countdownInterval.current)
  }

  const startWarningCountdown = useCallback(() => {
    setShowWarning(true)
    setCountdown(60)
    countdownInterval.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownInterval.current!)
          doLogout()
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [doLogout])

  const resetTimer = useCallback(() => {
    clearAllTimers()
    setShowWarning(false)
    const mins = logoutMinutesRef.current
    const warningAt = Math.max((mins * 60 - 60) * 1000, 0)
    inactivityTimer.current = setTimeout(startWarningCountdown, warningAt)
  }, [startWarningCountdown])

  useEffect(() => {
    const getUser = async () => {
      try {
        // Get the current session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()

        if (sessionError || !session) {
          router.push('/')
          return
        }

        // Look up the user in our users table
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single()

        if (userError || !userData) {
          // User authenticated but not in staff table
          await supabase.auth.signOut()
          router.push('/?error=not_authorised')
          return
        }

        if (userData.is_archived || !userData.is_active) {
          await supabase.auth.signOut()
          router.push('/?error=account_disabled')
          return
        }

        setUser(userData)

        // Load sidebar logo based on role
        if (userData.role === 'admin') {
          const { data: settings } = await supabase
            .from('app_settings')
            .select('admin_sidebar_logo_url, auto_logout_minutes')
            .eq('id', 'global')
            .single()
          setSidebarLogo(settings?.admin_sidebar_logo_url
            ? settings.admin_sidebar_logo_url + '?t=' + Date.now()
            : null)
          setGymName('Gym Library')
          const mins = settings?.auto_logout_minutes || 10
          setAutoLogoutMinutes(mins)
          logoutMinutesRef.current = mins
        } else {
          const { data: settings } = await supabase
            .from('app_settings').select('auto_logout_minutes').eq('id', 'global').single()
          const mins = settings?.auto_logout_minutes || 10
          setAutoLogoutMinutes(mins)
          logoutMinutesRef.current = mins

          if (userData.role === 'manager' && userData.manager_gym_id) {
            const { data: gym } = await supabase
              .from('gyms').select('name, logo_url').eq('id', userData.manager_gym_id).single()
            if (gym) {
              setSidebarLogo(gym.logo_url ? gym.logo_url + '?t=' + Date.now() : null)
              setGymName(gym.name)
            }
          } else if (userData.role === 'trainer') {
            const { data: tg } = await supabase
              .from('trainer_gyms')
              .select('gym_id, gyms(name, logo_url)')
              .eq('trainer_id', session.user.id)
              .eq('is_primary', true)
              .single()
            if (tg && (tg as any).gyms) {
              const logo = (tg as any).gyms.logo_url
              setSidebarLogo(logo ? logo + '?t=' + Date.now() : null)
              setGymName((tg as any).gyms.name)
            }
          } else {
            const { data: gyms } = await supabase
              .from('gyms').select('name, logo_url').eq('is_active', true).limit(1)
            if (gyms?.[0]) {
              const logo = gyms[0].logo_url
              setSidebarLogo(logo ? logo + '?t=' + Date.now() : null)
              setGymName(gyms[0].name)
            }
          }
        }
      } catch (err: any) {
        console.error('Dashboard init error:', err)
        setInitError(err.message)
      }
    }

    getUser()
  }, [])

  // Set up activity listeners
  useEffect(() => {
    if (!user) return
    resetTimer()
    const handleActivity = () => resetTimer()
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, handleActivity, { passive: true }))
    return () => {
      clearAllTimers()
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, handleActivity))
    }
  }, [user, resetTimer])

  const handleLogout = async () => {
    clearAllTimers()
    await supabase.auth.signOut()
    router.push('/')
  }

  if (initError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="card p-6 max-w-sm w-full text-center space-y-3">
          <p className="text-red-600 font-medium">Something went wrong</p>
          <p className="text-xs text-gray-500">{initError}</p>
          <button onClick={() => router.push('/')} className="btn-primary w-full">Back to Login</button>
        </div>
      </div>
    )
  }

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
    </div>
  )

  const nav = navItems[user.role] || []
  const isAdmin = user.role === 'admin'

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      <div className="flex items-center gap-2 p-4 border-b border-gray-200 flex-shrink-0">
        {sidebarLogo
          ? <img src={sidebarLogo} alt={gymName} className="h-8 w-auto max-w-[32px] object-contain rounded-lg flex-shrink-0"
              onError={() => setSidebarLogo(null)} />
          : <div className="bg-green-600 p-2 rounded-lg flex-shrink-0"><Dumbbell className="w-4 h-4 text-white" /></div>
        }
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-sm truncate">{gymName}</p>
          <p className="text-xs text-gray-500">{roleLabels[user.role] || user.role} Portal</p>
        </div>
        <button onClick={() => setSidebarOpen(false)} className="md:hidden p-1 text-gray-400 flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          return (
            <Link key={href} href={href} onClick={() => setSidebarOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                active ? 'bg-green-50 text-green-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}>
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 truncate">{label}</span>
              {active && <ChevronRight className="w-3 h-3 text-green-600 flex-shrink-0" />}
            </Link>
          )
        })}
      </nav>

      <div className="flex-shrink-0 border-t border-gray-200">
        <div className="p-3">
          <div className="flex items-center gap-2 p-2 rounded-lg">
            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-green-700 font-semibold text-xs">{user.full_name.charAt(0)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user.full_name}</p>
              <p className="text-xs text-gray-500">{roleLabels[user.role] || user.role}</p>
            </div>
            <button onClick={handleLogout}
              className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors flex-shrink-0"
              title="Logout">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="px-4 pb-2 flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-gray-300 flex-shrink-0" />
          <p className="text-xs text-gray-300">Auto logout: {autoLogoutMinutes}m</p>
        </div>
        {isAdmin && (
          <div className="px-4 pb-4 flex items-center gap-1.5">
            <Building2 className="w-3 h-3 text-gray-300 flex-shrink-0" />
            <p className="text-xs text-gray-300 font-medium tracking-wide">Gym Library</p>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <>
      <div className="hidden md:block fixed top-0 left-0 bottom-0 w-56 z-30">
        <SidebarContent />
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="absolute top-0 left-0 bottom-0 w-64 z-50">
            <SidebarContent />
          </div>
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

      <div className="md:pl-56 flex flex-col min-h-screen bg-gray-50">
        <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 sticky top-0 z-20">
          <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg hover:bg-gray-100">
            <Menu className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex items-center gap-2">
            {sidebarLogo
              ? <img src={sidebarLogo} alt={gymName} className="h-6 w-auto object-contain" />
              : <Dumbbell className="w-5 h-5 text-green-600" />
            }
            <span className="font-bold text-gray-900 text-sm">{gymName}</span>
          </div>
          <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
            <span className="text-green-700 font-semibold text-xs">{user.full_name.charAt(0)}</span>
          </div>
        </div>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </>
  )
}
