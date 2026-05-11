/** @type {import('next').NextConfig} */

const securityHeaders = [
  // Prevents the page from being embedded in an iframe (clickjacking protection)
  { key: 'X-Frame-Options', value: 'DENY' },
  // Prevents MIME type sniffing
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Controls how much referrer info is included with requests
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Disable unused browser features
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  // Forces HTTPS for 1 year (only effective in production)
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
  // Content Security Policy
  // - default-src: only allow from same origin
  // - script-src: allow self + Vercel analytics
  // - style-src: allow self + inline styles (needed for Tailwind)
  // - img-src: allow self + data URIs (for avatars/logos)
  // - connect-src: allow self + Supabase API + WhatsApp API
  // - frame-ancestors: nobody can frame this app
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co",
      "font-src 'self'",
      "connect-src 'self' https://*.supabase.co https://api.twilio.com wss://*.supabase.co",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
]

const nextConfig = {
  serverExternalPackages: ['twilio'],
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
}

module.exports = nextConfig
