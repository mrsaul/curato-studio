import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; tid: string }> }) {
  const { id, tid } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: ctx, error: ctxError } = await supabase.from('contexts').select('reviewer_id').eq('id', id).single()
  if (ctxError && ctxError.code !== 'PGRST116') return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  if (!ctx || ctx.reviewer_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: { name?: string; description?: string; active?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (body.name?.trim()) updates.name = body.name.trim()
  if (body.description !== undefined) updates.description = body.description
  if (body.active !== undefined) updates.active = body.active

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('templates')
    .update(updates)
    .eq('id', tid)
    .eq('context_id', id)
    .select('id, context_id, name, type, description, active, created_at')
    .single()

  if (error) return NextResponse.json({ error: 'Failed to update template' }, { status: 500 })
  return NextResponse.json({ template: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; tid: string }> }) {
  const { id, tid } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: ctx, error: ctxError } = await supabase.from('contexts').select('reviewer_id').eq('id', id).single()
  if (ctxError && ctxError.code !== 'PGRST116') return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  if (!ctx || ctx.reviewer_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await supabase.from('templates').delete().eq('id', tid).eq('context_id', id)
  if (error) return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
