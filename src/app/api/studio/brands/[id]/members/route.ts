import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'

async function getOwnedContext(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  id: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from('contexts').select('id').eq('id', id).eq('user_id', userId).single()
  if (error && error.code !== 'PGRST116') throw error
  return data
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    if (!await getOwnedContext(supabase, id, user.id)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  } catch {
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  const service = createServiceSupabaseClient()
  const { data: members, error: membersError } = await service
    .from('brand_members')
    .select('user_id, email, joined_at')
    .eq('context_id', id)
    .order('joined_at', { ascending: true })

  if (membersError) return NextResponse.json({ error: 'Failed to load members' }, { status: 500 })

  const memberIds = (members ?? []).map(m => m.user_id)
  const counts: Record<string, number> = {}

  if (memberIds.length > 0) {
    const { data: reqs, error: reqsError } = await service
      .from('creative_requests')
      .select('contributor_id')
      .eq('context_id', id)
      .in('contributor_id', memberIds)
    if (reqsError) return NextResponse.json({ error: 'Failed to load request counts' }, { status: 500 })
    for (const row of reqs ?? []) {
      counts[row.contributor_id] = (counts[row.contributor_id] ?? 0) + 1
    }
  }

  return NextResponse.json({
    members: (members ?? []).map(m => ({
      userId: m.user_id,
      email: m.email,
      joinedAt: m.joined_at,
      requestCount: counts[m.user_id] ?? 0,
    }))
  })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    if (!await getOwnedContext(supabase, id, user.id)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  } catch {
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  let body: { userId?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }
  if (!body.userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  const service = createServiceSupabaseClient()
  const { error } = await service
    .from('brand_members')
    .delete()
    .eq('context_id', id)
    .eq('user_id', body.userId)

  if (error) return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
