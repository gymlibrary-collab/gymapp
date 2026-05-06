import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Service role client — bypasses RLS for writing logs
const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Parse browser, OS and device from user-agent string
function parseUserAgent(ua: string): { browser: string; os: string; device: string } {
  let browser = 'Unknown'
  let os = 'Unknown'
  let device = 'Desktop'

  // Browser
  if (ua.includes('Edg/')) browser = 'Edge'
  else if (ua.includes('OPR/') || ua.includes('Opera')) browser = 'Opera'
  else if (ua.includes('Chrome/') && !ua.includes('Chromium')) browser = 'Chrome'
  else if (ua.includes('Firefox/')) browser = 'Firefox'
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari'
  else if (ua.includes('MSIE') || ua.includes('Trident/')) browser = 'Internet Explorer'

  // OS
  if (ua.includes('Windows NT 10.0')) os = 'Windows 11/10'
  else if (ua.includes('Windows NT 6.3')) os = 'Windows 8.1'
  else if (ua.includes('Windows NT 6.1')) os = 'Windows 7'
  else if (ua.includes('Windows')) os = 'Windows'
  else if (ua.includes('Mac OS X')) {
    const match = ua.match(/Mac OS X (\d+[._]\d+)/)
    os = match ? `macOS ${match[1].replace('_', '.')}` : 'macOS'
  }
  else if (ua.includes('Android')) {
    const match = ua.match(/Android (\d+\.?\d*)/)
    os = match ? `Android ${match[1]}` : 'Android'
  }
  else if (ua.includes('iPhone OS') || ua.includes('iPad')) {
    const match = ua.match(/OS (\d+_\d+)/)
    os = match ? `iOS ${match[1].replace('_', '.')}` : 'iOS'
  }
  else if (ua.includes('Linux')) os = 'Linux'

  // Device
  if (ua.includes('Mobile') || ua.includes('iPhone') || ua.includes('Android') && !ua.includes('Tablet')) device = 'Mobile'
  else if (ua.includes('iPad') || ua.includes('Tablet')) device = 'Tablet'
  else device = 'Desktop'

  return { browser, os, device }
}

// Get real client IP — handles Vercel proxy headers
function getClientIp(req: NextRequest): string {
  const xRealIp = req.headers.get('x-real-ip')
  if (xRealIp) return xRealIp

  const xForwardedFor = req.headers.get('x-forwarded-for')
  if (xForwardedFor) return xForwardedFor.split(',')[0].trim()

  return 'Unknown'
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { user_id, user_name, role, action_type, page, description } = body

    if (!user_name || !action_type || !page || !description) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const ua = req.headers.get('user-agent') || ''
    const { browser, os, device } = parseUserAgent(ua)
    const ip_address = getClientIp(req)
    const now = new Date()

    // Write the log entry
    const { error: insertErr } = await adminClient.from('activity_logs').insert({
      user_id: user_id || null,
      user_name,
      role,
      action_type,
      page,
      description,
      ip_address,
      browser,
      os,
      device,
      created_at: now.toISOString(),
    })

    if (insertErr) {
      console.error('Activity log insert error:', insertErr)
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    // Rolling 14-day window — delete entries older than 14 days for this user
    if (user_id) {
      const cutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString()
      await adminClient.from('activity_logs')
        .delete()
        .eq('user_id', user_id)
        .lt('created_at', cutoff)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Activity log error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
