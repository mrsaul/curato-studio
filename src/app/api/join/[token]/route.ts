import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const service = createServiceSupabaseClient()

  const { data: invite, error: inviteError } = await service
    .from('brand_invites').select('context_id').eq('token', token).single()

  if (inviteError && inviteError.code !== 'PGRST116') {
    return NextResponse.json({ valid: false })
  }
  if (!invite) return NextResponse.json({ valid: false })

  const { data: ctx } = await service
    .from('contexts').select('name').eq('id', invite.context_id).single()

  return NextResponse.json({
    valid: true,
    brandName: ctx?.name ?? 'Unknown Brand',
    contextId: invite.context_id,
  })
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceSupabaseClient()

  const { data: invite, error: inviteError } = await service
    .from('brand_invites').select('context_id').eq('token', token).single()

  if (inviteError && inviteError.code !== 'PGRST116') {
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
  if (!invite) {
    return NextResponse.json({ error: 'Invalid or expired invite link' }, { status: 404 })
  }

  const { data: ctx } = await service
    .from('contexts').select('name').eq('id', invite.context_id).single()

  const { error } = await service
    .from('brand_members')
    .insert({
      context_id: invite.context_id,
      user_id: user.id,
      email: user.email ?? '',
    })

  // 23505 = unique_violation: already a member — idempotent, treat as success
  if (error && error.code !== '23505') {
    return NextResponse.json({ error: 'Failed to join brand' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, brandName: ctx?.name ?? 'Brand' })
}
