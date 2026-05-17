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
    const loginUrl = new URL('/', request.url)
    loginUrl.searchParams.set('redirectTo', pathname)

    // If this is a Next.js RSC (React Server Component) fetch, a standard redirect
    // causes "Failed to fetch RSC payload" in the browser console because the client
    // expects a RSC payload, not an HTML redirect. Instead, return a special header
    // that tells the Next.js client router to do a full page navigation to the login URL.
    const isRscRequest = request.headers.get('RSC') === '1' ||
      request.headers.get('Next-Router-Prefetch') === '1'
    if (isRscRequest) {
      return new NextResponse(null, {
        status: 200,
        headers: { 'x-middleware-rewrite': '/', Location: loginUrl.toString() },
      })
    }

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
