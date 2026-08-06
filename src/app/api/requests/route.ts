import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createRequest } from '@/lib/requests'

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    reviewer_id?: string
    context_id?: string | null
    source_type?: string
    raw_text?: string
    transcript?: string
    media_url?: string
  }

  if (!body.reviewer_id) {
    return NextResponse.json({ error: 'reviewer_id is required' }, { status: 400 })
  }
  if (!body.source_type || !['text', 'voice', 'photo'].includes(body.source_type)) {
    return NextResponse.json({ error: 'source_type must be text, voice, or photo' }, { status: 400 })
  }

  const request = await createRequest(supabase, {
    contributor_id: user.id,
    reviewer_id: body.reviewer_id,
    context_id: body.context_id ?? null,
    source_type: body.source_type as 'text' | 'voice' | 'photo',
    raw_text: body.raw_text,
    transcript: body.transcript,
    media_url: body.media_url,
  })

  return NextResponse.json({ request })
}
