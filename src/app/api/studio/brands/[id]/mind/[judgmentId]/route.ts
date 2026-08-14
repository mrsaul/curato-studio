import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; judgmentId: string }> }) {
  const { id, judgmentId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: ctx, error: ctxError } = await supabase.from('contexts').select('user_id').eq('id', id).single()
  if (ctxError && ctxError.code !== 'PGRST116') return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  if (!ctx || ctx.user_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: { status?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.status || !['confirmed', 'rejected'].includes(body.status)) {
    return NextResponse.json({ error: 'status must be confirmed or rejected' }, { status: 400 })
  }

  const { error } = await supabase
    .from('judgments')
    .update({ status: body.status })
    .eq('id', judgmentId)
    .eq('context_id', id)

  if (error) return NextResponse.json({ error: 'Failed to update judgment' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
