import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

async function verifyOwnership(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, contextId: string, userId: string) {
  const { data, error } = await supabase.from('contexts').select('reviewer_id').eq('id', contextId).single()
  if (error && error.code !== 'PGRST116') throw new Error(`DB error: ${error.message}`)
  return data?.reviewer_id === userId
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

  const { data: all, error } = await supabase
    .from('judgments')
    .select('id, verb, statement, status, created_at')
    .eq('context_id', id)
    .in('status', ['proposed', 'confirmed'])
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Failed to fetch judgments' }, { status: 500 })

  const pending = (all ?? []).filter(j => j.status === 'proposed')
  const confirmed = (all ?? []).filter(j => j.status === 'confirmed')

  return NextResponse.json({ pending, confirmed })
}
