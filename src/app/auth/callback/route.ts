import { createAdminClient } from '@/lib/supabase-server'
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (!code) {
    return NextResponse.redirect(`${origin}/?error=no_code`)
  }

  const cookieStore = await cookies()

  // Build the redirect response first — cookies must be set on the response
  // object in Next.js 15, not on the cookieStore, when returning a redirect
  const successRedirect = NextResponse.redirect(`${origin}${next}`)

  // NOTE: createServerClient is used directly here (not via db-server.ts) because
  // this callback must set cookies on BOTH cookieStore AND the response object
  // simultaneously. createSupabaseServerClient in db-server.ts only handles
  // cookieStore. This is a Next.js 15 auth callback requirement — if migrating
  // providers, this file needs to be updated alongside db-server.ts.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          // Set on BOTH the cookieStore and the response object
          // to ensure cookies are persisted in Next.js 15
          cookiesToSet.forEach(({ name, value, options }) => {
            try { cookieStore.set(name, value, options as any) } catch {}
            successRedirect.cookies.set(name, value, options as any)
          })
        },
      },
    }
  )

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.session) {
    console.error('Auth callback error:', error)
    return NextResponse.redirect(`${origin}/?error=auth_failed`)
  }

  const user = data.session.user

  // Use admin client for users lookup — bypasses RLS entirely
  const adminClient = createAdminClient()

  const { data: userRecord } = await adminClient
    .from('users')
    .select('id, is_archived, is_active')
    .eq('id', user.id)
    .single()

  if (!userRecord) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/?error=not_authorised`)
  }

  if (userRecord.is_archived || !userRecord.is_active) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/?error=account_disabled`)
  }

  // Return the pre-built redirect response which has the session cookies attached
  return successRedirect
}