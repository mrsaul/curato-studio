import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'

export async function GET() {
  const authed = await createServerSupabaseClient()
  const { data: { user } } = await authed.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceSupabaseClient()

  const { data: contexts } = await service
    .from('contexts')
    .select('id, user_id')
    .limit(10)

  const { data: requests } = await service
    .from('creative_requests')
    .select('id, status, contributor_id, reviewer_id, created_at')
    .order('created_at', { ascending: false })
    .limit(10)

  return NextResponse.json({
    me: { id: user.id, email: user.email },
    contexts,
    requests,
  })
}
