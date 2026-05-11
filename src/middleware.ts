import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// ============================================================
// src/middleware.ts
//
// PURPOSE:
//   Server-side auth guard for all /dashboard/* routes.
//   Redirects unauthenticated users to the login page before
//   the page component even loads — faster and more secure
//   than client-side guards alone.
//
//   Works alongside the client-side useCurrentUser hook which
//   handles role-based access within authenticated routes.
//
// ROUTES PROTECTED: /dashboard/*
// ROUTES EXCLUDED:  /, /auth/*, /api/* (handled separately)
// ============================================================

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Only protect dashboard routes
  if (!pathname.startsWith('/dashboard')) {
    return NextResponse.next()
  }

  // Create a response to potentially modify cookies
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  // Create Supabase server client that reads/writes cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({
            request: { headers: request.headers },
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Check session — getUser() is more secure than getSession()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    // Redirect to login, preserve intended destination
    const loginUrl = new URL('/', request.url)
    loginUrl.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: [
    // Match all dashboard routes, exclude static files and API routes
    '/dashboard/:path*',
  ],
}
