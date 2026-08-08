import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const authed = await createServerSupabaseClient()
  const { data: { user } } = await authed.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const requestId = req.nextUrl.searchParams.get('request_id')
  if (!requestId) return NextResponse.json({ error: 'request_id required' }, { status: 400 })

  const { data: request } = await authed
    .from('creative_requests')
    .select('id, contributor_id')
    .eq('id', requestId)
    .eq('contributor_id', user.id)
    .maybeSingle()

  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: draft } = await authed
    .from('request_drafts')
    .select('id, recommended_caption, hashtags, cta')
    .eq('request_id', requestId)
    .order('created_at', { ascending: false })
    .maybeSingle()

  // Prefer the Director's approved/edited caption over the original AI pick
  let approvedCaption = draft?.recommended_caption ?? null
  let directorNotes: string | null = null
  if (draft?.id) {
    const { data: decision } = await authed
      .from('review_decisions')
      .select('edited_caption, notes')
      .eq('draft_id', draft.id)
      .in('decision', ['approved', 'delivered'])
      .order('created_at', { ascending: false })
      .maybeSingle()

    if (decision?.edited_caption) approvedCaption = decision.edited_caption
    directorNotes = decision?.notes ?? null
  }

  return NextResponse.json({
    caption: approvedCaption,
    hashtags: (draft?.hashtags ?? []) as string[],
    cta: draft?.cta ?? null,
    notes: directorNotes,
  })
}
