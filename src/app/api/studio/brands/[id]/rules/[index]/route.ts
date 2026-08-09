import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { Rule } from '@/types/brand'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; index: string }> }) {
  const { id, index } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: ctx } = await supabase.from('contexts').select('reviewer_id').eq('id', id).single()
  if (!ctx || ctx.reviewer_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: capsule, error: capsuleError } = await supabase
    .from('capsules').select('id, rules').eq('context_id', id)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (capsuleError) return NextResponse.json({ error: 'Internal error' }, { status: 500 })

  const rules = ((capsule?.rules ?? []) as Rule[])
  const idx = parseInt(index, 10)
  if (isNaN(idx) || idx < 0 || idx >= rules.length) {
    return NextResponse.json({ error: 'Invalid index' }, { status: 400 })
  }

  rules.splice(idx, 1)

  if (capsule?.id) {
    const { error } = await supabase.from('capsules').update({ rules }).eq('id', capsule.id)
    if (error) return NextResponse.json({ error: 'Failed to delete rule' }, { status: 500 })
  }

  return NextResponse.json({ rules })
}
