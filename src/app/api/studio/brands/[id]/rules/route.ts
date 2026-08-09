import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { Rule } from '@/types/brand'

const VERBS = ['always', 'never', 'prefer', 'avoid'] as const
const DOMAINS = ['voice', 'visual', 'content', 'format', 'timing'] as const

async function getLatestCapsule(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, contextId: string) {
  const { data, error } = await supabase
    .from('capsules')
    .select('id, rules')
    .eq('context_id', contextId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`DB error fetching capsule: ${error.message}`)
  return data
}

async function saveRules(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, contextId: string, rules: Rule[], existingCapsuleId?: string | null) {
  if (existingCapsuleId) {
    const { error } = await supabase.from('capsules').update({ rules }).eq('id', existingCapsuleId)
    if (error) throw new Error('Failed to update rules')
  } else {
    const { error } = await supabase.from('capsules').insert({ context_id: contextId, rules })
    if (error) throw new Error('Failed to insert rules')
  }
}

async function verifyOwnership(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, contextId: string, userId: string) {
  const { data, error } = await supabase.from('contexts').select('reviewer_id').eq('id', contextId).single()
  if (error && error.code !== 'PGRST116') throw new Error(`DB error checking ownership: ${error.message}`)
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

  let capsule
  try {
    capsule = await getLatestCapsule(supabase, id)
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }

  const rules = ((capsule?.rules ?? []) as Rule[])
  return NextResponse.json({ rules })
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

  let body: { verb?: string; domain?: string; text?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.verb || !body.domain || !body.text?.trim()) {
    return NextResponse.json({ error: 'verb, domain, and text are required' }, { status: 400 })
  }
  if (!VERBS.includes(body.verb as typeof VERBS[number])) {
    return NextResponse.json({ error: `verb must be one of: ${VERBS.join(', ')}` }, { status: 400 })
  }
  if (!DOMAINS.includes(body.domain as typeof DOMAINS[number])) {
    return NextResponse.json({ error: `domain must be one of: ${DOMAINS.join(', ')}` }, { status: 400 })
  }

  let capsule
  try {
    capsule = await getLatestCapsule(supabase, id)
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }

  const rules = ((capsule?.rules ?? []) as Rule[])
  const newRule: Rule = { verb: body.verb as Rule['verb'], domain: body.domain as Rule['domain'], text: body.text.trim() }
  rules.push(newRule)

  try {
    await saveRules(supabase, id, rules, capsule?.id)
  } catch {
    return NextResponse.json({ error: 'Failed to save rule' }, { status: 500 })
  }

  return NextResponse.json({ rules })
}
