'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Dumbbell, Building2, Clock, AlertCircle } from 'lucide-react'

export default function LoginPage() {
  const [loginLogo, setLoginLogo] = useState<string | null>(null)
  const [appName, setAppName] = useState('GymApp')
  const [timedOut, setTimedOut] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  // CRITICAL: Use the shared browser client — a separate instance breaks session cookies
  const supabase = createClient()

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('reason') === 'timeout') setTimedOut(true)
      const err = params.get('error')
      if (err === 'not_authorised') {
        setAuthError('Your Google account is not authorised. Contact your admin to be added as staff.')
      } else if (err === 'account_disabled') {
        setAuthError('Your account has been disabled. Contact your admin.')
      } else if (err === 'auth_failed') {
        setAuthError('Login failed. Please try again.')
      } else if (err === 'no_code') {
        setAuthError('Login could not be completed. Please try signing in again.')
      }
    }

    const loadSettings = async () => {
      try {
        // Fetch logo via direct REST — doesn't require an auth session
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/app_settings?id=eq.global&select=login_logo_url,app_name`,
          {
            headers: {
              apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
              Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
            },
          }
        )
        if (res.ok) {
          const data = await res.json()
          if (data?.[0]) {
            if (data[0].app_name) setAppName(data[0].app_name)
            if (data[0].login_logo_url) {
              const baseUrl = data[0].login_logo_url.split('?')[0]
              setLoginLogo(baseUrl + '?t=' + Date.now())
            }
          }
        }
      } catch (e) {
        // Fall back to defaults silently
      } finally {
        setLoaded(true)
      }
    }

    loadSettings()
  }, [])

  const handleGoogleLogin = async () => {
    setAuthError(null)
    // Use the shared browser client — this is critical for session cookies
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  if (!loaded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 w-full max-w-sm text-center">

        {/* Logo */}
        <div className="flex justify-center mb-4">
          {loginLogo ? (
            <img
              src={loginLogo}
              alt={appName}
              className="h-20 w-auto object-contain"
              onError={() => setLoginLogo(null)}
            />
          ) : (
            <div className="bg-green-600 p-3 rounded-2xl">
              <Dumbbell className="w-8 h-8 text-white" />
            </div>
          )}
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">{appName}</h1>
        <p className="text-gray-500 text-sm mb-6">Gym Operations Suite</p>

        {/* Timeout notice */}
        {timedOut && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-left">
            <Clock className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <p className="text-xs text-amber-700">
              You were logged out due to inactivity. Please sign in again.
            </p>
          </div>
        )}

        {/* Auth error notice */}
        {authError && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-left">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">{authError}</p>
          </div>
        )}

        {/* Google login */}
        <button
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center gap-3 border border-gray-200 rounded-lg px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>

        <p className="text-xs text-gray-400 mt-6">
          Access is limited to authorised staff only.<br />
          Contact your admin if you need an account.
        </p>

        <div className="mt-8 pt-6 border-t border-gray-100 flex items-center justify-center gap-1.5">
          <Building2 className="w-3.5 h-3.5 text-gray-300" />
          <p className="text-xs text-gray-300 font-medium tracking-wide">Gym Library</p>
        </div>
      </div>
    </div>
  )
}
