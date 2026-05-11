// ============================================================
// src/lib/rate-limit.ts
//
// PURPOSE:
//   Simple in-memory rate limiter for Next.js API routes.
//   Uses a sliding window per IP address.
//
// LIMITATIONS:
//   In-memory — does not persist across serverless function
//   instances. Suitable for Vercel where each function instance
//   handles a subset of requests. For stricter rate limiting,
//   use Redis (Upstash) or Vercel KV.
//
// USAGE:
//   const { limited, remaining } = rateLimit(request, {
//     limit: 60,       // max requests per window
//     windowMs: 60000, // window in ms (1 minute)
//   })
//   if (limited) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
// ============================================================

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt < now) store.delete(key)
  }
}, 5 * 60 * 1000)

function getClientIp(request: Request): string {
  const forwarded = (request.headers as any).get?.('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  const realIp = (request.headers as any).get?.('x-real-ip')
  if (realIp) return realIp
  return 'unknown'
}

export function rateLimit(
  request: Request,
  options: { limit: number; windowMs: number; keyPrefix?: string }
): { limited: boolean; remaining: number; resetAt: number } {
  const ip = getClientIp(request)
  const key = `${options.keyPrefix || 'rl'}:${ip}`
  const now = Date.now()

  const entry = store.get(key)

  if (!entry || entry.resetAt < now) {
    // New window
    const resetAt = now + options.windowMs
    store.set(key, { count: 1, resetAt })
    return { limited: false, remaining: options.limit - 1, resetAt }
  }

  entry.count++

  if (entry.count > options.limit) {
    return { limited: true, remaining: 0, resetAt: entry.resetAt }
  }

  return { limited: false, remaining: options.limit - entry.count, resetAt: entry.resetAt }
}
