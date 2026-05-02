import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (!code) {
    // No code — redirect to login with error
    return NextResponse.redirect(`${origin}/?error=no_code`)
  }

  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
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

  // Check if user exists in the users table
  const { data: userRecord } = await supabase
    .from('users')
    .select('id, is_archived, is_active')
    .eq('id', user.id)
    .single()

  // User not found in users table — they logged in with Google
  // but haven't been added as staff yet
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
