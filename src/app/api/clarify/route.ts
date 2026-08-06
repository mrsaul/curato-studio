import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getRequest, updateRequest } from '@/lib/requests'

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { request_id?: string; reply?: string }
  if (!body.request_id || !body.reply) {
    return NextResponse.json({ error: 'request_id and reply are required' }, { status: 400 })
  }

  const request = await getRequest(supabase, body.request_id)
  if (!request || request.contributor_id !== user.id) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }
  if (request.status !== 'needs_info') {
    return NextResponse.json({ error: 'Request is not awaiting clarification' }, { status: 400 })
  }

  await updateRequest(supabase, request.id, {
    contributor_reply: body.reply,
    status: 'draft_ready',
  })

  return NextResponse.json({ ok: true, next: 'call /api/interpret to rerun interpretation' })
}
