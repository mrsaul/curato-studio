import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'

async function getOwnedContext(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  id: string,
  userId: string,
) {
  const { data } = await supabase
    .from('contexts').select('id').eq('id', id).eq('user_id', userId).single()
  return data
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!await getOwnedContext(supabase, id, user.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const service = createServiceSupabaseClient()
  const { data: invite, error: readError } = await service
    .from('brand_invites').select('token').eq('context_id', id).single()
  if (readError && readError.code !== 'PGRST116') {
    return NextResponse.json({ error: 'Failed to read invite' }, { status: 500 })
  }

  if (!invite) {
    const { data: newInvite, error } = await service
      .from('brand_invites').insert({ context_id: id }).select('token').single()
    if (error || !newInvite) {
      return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
    }
    invite = newInvite
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://curato.app'
  return NextResponse.json({ token: invite.token, url: `${base}/join/${invite.token}` })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!await getOwnedContext(supabase, id, user.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let body: { action?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }
  if (body.action !== 'regenerate') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const service = createServiceSupabaseClient()
  const { error: deleteError } = await service.from('brand_invites').delete().eq('context_id', id)
  if (deleteError) return NextResponse.json({ error: 'Failed to delete invite' }, { status: 500 })

  const { data: invite, error } = await service
    .from('brand_invites').insert({ context_id: id }).select('token').single()
  if (error || !invite) {
    return NextResponse.json({ error: 'Failed to regenerate invite' }, { status: 500 })
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://curato.app'
  return NextResponse.json({ token: invite.token, url: `${base}/join/${invite.token}` })
}
