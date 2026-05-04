import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
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

  // Session client — anon key + cookies for exchanging the OAuth code
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options as any)
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

  // Use service role client for the users lookup — bypasses RLS entirely.
  // This is correct for a server-side auth check: we need to verify the user
  // exists regardless of their role or RLS policy state.
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: userRecord } = await adminClient
    .from('users')
    .select('id, is_archived, is_active')
    .eq('id', user.id)
    .single()

  // User not found in users table — logged in with Google
  // but hasn't been added as staff yet
  if (!userRecord) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/?error=not_authorised`)
  }

  // User is archived or inactive
  if (userRecord.is_archived || !userRecord.is_active) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/?error=account_disabled`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
