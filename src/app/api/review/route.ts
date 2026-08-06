import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getRequest, getRequestDraft, updateRequest } from '@/lib/requests'
import { ReviewDecisionType } from '@/types/request'

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    request_id?: string
    decision?: ReviewDecisionType
    edited_caption?: string
    notes?: string
  }

  if (!body.request_id || !body.decision) {
    return NextResponse.json({ error: 'request_id and decision are required' }, { status: 400 })
  }
  if (!['approved', 'changes_requested', 'declined'].includes(body.decision)) {
    return NextResponse.json({ error: 'Invalid decision value' }, { status: 400 })
  }

  const request = await getRequest(supabase, body.request_id)
  if (!request || request.reviewer_id !== user.id) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }
  if (request.status !== 'awaiting_review') {
    return NextResponse.json({ error: 'Request is not awaiting review' }, { status: 400 })
  }

  const draft = await getRequestDraft(supabase, request.id)
  if (!draft) {
    return NextResponse.json({ error: 'No draft found for this request' }, { status: 404 })
  }

  const { error: decisionError } = await supabase
    .from('review_decisions')
    .insert({
      draft_id: draft.id,
      reviewer_id: user.id,
      decision: body.decision,
      edited_caption: body.edited_caption ?? null,
      notes: body.notes ?? null,
    })

  if (decisionError) {
    return NextResponse.json({ error: 'Failed to save decision' }, { status: 500 })
  }

  const newStatus = body.decision === 'changes_requested' ? 'draft_ready' : body.decision
  await updateRequest(supabase, request.id, { status: newStatus as never })

  if (body.decision === 'approved' && body.edited_caption) {
    fetch(new URL('/api/memory', req.url).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: req.headers.get('cookie') ?? '' },
      body: JSON.stringify({ request_id: request.id, draft_id: draft.id }),
    }).catch(() => { /* background — ignore errors */ })
  }

  return NextResponse.json({ ok: true, status: newStatus })
}
