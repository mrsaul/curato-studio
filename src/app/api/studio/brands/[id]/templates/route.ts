import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const TYPES = ['photo_post', 'quote_card', 'announcement', 'carousel'] as const

async function verifyOwnership(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, contextId: string, userId: string) {
  const { data, error } = await supabase.from('contexts').select('user_id').eq('id', contextId).single()
  if (error && error.code !== 'PGRST116') throw new Error(`DB error: ${error.message}`)
  return data?.user_id === userId
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const owned = await verifyOwnership(supabase, id, user.id)
    if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }

  const { data: templates, error } = await supabase
    .from('templates')
    .select('id, context_id, name, type, description, active, created_at')
    .eq('context_id', id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 })
  return NextResponse.json({ templates: templates ?? [] })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const owned = await verifyOwnership(supabase, id, user.id)
    if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }

  let body: { name?: string; type?: string; description?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.name?.trim() || !body.type) {
    return NextResponse.json({ error: 'name and type are required' }, { status: 400 })
  }
  if (!TYPES.includes(body.type as typeof TYPES[number])) {
    return NextResponse.json({ error: `type must be one of: ${TYPES.join(', ')}` }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('templates')
    .insert({
      reviewer_id: user.id,
      context_id: id,
      name: body.name.trim(),
      type: body.type,
      description: body.description?.trim() ?? '',
    })
    .select('id, context_id, name, type, description, active, created_at')
    .single()

  if (error) return NextResponse.json({ error: 'Failed to create template' }, { status: 500 })
  return NextResponse.json({ template: data })
}
