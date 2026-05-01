'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import { User } from '@/types'
import {
  Dumbbell, LayoutDashboard, Users, Package, Calendar,
  BarChart3, DollarSign, Settings, LogOut, Menu, ChevronRight, FileText, Banknote, X
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

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [gymLogo, setGymLogo] = useState<string | null>(null)
  const [gymName, setGymName] = useState<string>('GymApp')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  useEffect(() => {
    const getUser = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) { router.push('/'); return }

      const { data: userData } = await supabase
        .from('users').select('*').eq('id', authUser.id).single()
      if (!userData) { router.push('/'); return }
      setUser(userData)

      if (userData.role === 'manager' && userData.manager_gym_id) {
        const { data: gym } = await supabase
          .from('gyms').select('name, logo_url')
          .eq('id', userData.manager_gym_id).single()
        if (gym) { setGymLogo(gym.logo_url); setGymName(gym.name) }
      } else if (userData.role === 'trainer') {
        const { data: tg } = await supabase
          .from('trainer_gyms')
          .select('gym_id, gyms(name, logo_url)')
          .eq('trainer_id', authUser.id)
          .eq('is_primary', true)
          .single()
        if (tg && (tg as any).gyms) {
          setGymLogo((tg as any).gyms.logo_url)
          setGymName((tg as any).gyms.name)
        }
      } else {
        const { data: gyms } = await supabase
          .from('gyms').select('name, logo_url')
          .eq('is_active', true).limit(1)
        if (gyms?.[0]) { setGymLogo(gyms[0].logo_url); setGymName(gyms[0].name) }
      }
    }
    getUser()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
    </div>
  )

  const nav = navItems[user.role] || []

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* Logo */}
      <div className="flex items-center gap-2 p-4 border-b border-gray-200">
        {gymLogo
          ? <img src={gymLogo} alt={gymName} className="w-8 h-8 object-contain rounded-lg" />
          : <div className="bg-green-600 p-2 rounded-lg"><Dumbbell className="w-4 h-4 text-white" /></div>
        }
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-sm truncate">{gymName}</p>
          <p className="text-xs text-gray-500">{roleLabels[user.role] || user.role}</p>
        </div>
        {/* Close button — mobile only */}
        <button
          onClick={() => setSidebarOpen(false)}
          className="md:hidden p-1 text-gray-400 hover:text-gray-600"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Nav links */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                active
                  ? 'bg-green-50 text-green-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{label}</span>
              {active && <ChevronRight className="w-3 h-3 text-green-600" />}
            </Link>
          )
        })}
      </nav>

      {/* User footer */}
      <div className="p-3 border-t border-gray-200">
        <div className="flex items-center gap-3 p-2 rounded-lg">
          <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-green-700 font-semibold text-xs">
              {user.full_name.charAt(0)}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{user.full_name}</p>
            <p className="text-xs text-gray-500">{roleLabels[user.role] || user.role}</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f9fafb' }}>

      {/* Desktop sidebar — always visible on md+ */}
      <div style={{ width: '224px', flexShrink: 0, position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 30 }}
        className="hidden md:block">
        <SidebarContent />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="fixed top-0 left-0 bottom-0 w-64 z-50 bg-white">
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Main content area */}
      <div style={{ flex: 1, marginLeft: 0 }} className="md:ml-56 flex flex-col min-h-screen">

        {/* Mobile top bar */}
        <div className="md:hidden flex items-center justify-between p-4 bg-white border-b border-gray-200 sticky top-0 z-20">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            <Menu className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex items-center gap-2">
            {gymLogo
              ? <img src={gymLogo} alt={gymName} className="w-6 h-6 object-contain" />
              : <Dumbbell className="w-5 h-5 text-green-600" />
            }
            <span className="font-bold text-gray-900 text-sm">{gymName}</span>
          </div>
          <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
            <span className="text-green-700 font-semibold text-xs">
              {user.full_name.charAt(0)}
            </span>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
