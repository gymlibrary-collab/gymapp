import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createSupabaseServerClient } from '@/lib/supabase-server'
import { validateAndLoadCurrentUser } from '@/lib/api-auth'

// GET /api/gyms?ids=uuid1,uuid2
// Returns gym id+name for the given IDs using adminClient (bypasses gyms RLS)
// Used for gym name lookups where client-side RLS would restrict results
// Requires authenticated session

export async function GET(req: NextRequest) {
  // Verify authenticated session — no access for unauthenticated requests
  const serverClient = await createSupabaseServerClient()
  const { data: { user } } = await serverClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const adminClient = createAdminClient()

  // ?ids=uuid1,uuid2 — returns gym names for given IDs
  const ids = req.nextUrl.searchParams.get('ids')
  if (!ids) return NextResponse.json([])

  const gymIds = ids.split(',').filter(Boolean)
  if (gymIds.length === 0) return NextResponse.json([])

  const { data, error } = await adminClient
    .from('gyms')
    .select('id, name')
    .in('id', gymIds)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}
