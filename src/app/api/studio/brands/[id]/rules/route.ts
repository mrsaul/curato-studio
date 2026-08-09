import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { Rule } from '@/types/brand'

const VERBS = ['always', 'never', 'prefer', 'avoid'] as const
const DOMAINS = ['voice', 'visual', 'content', 'format', 'timing'] as const

async function getLatestCapsule(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, contextId: string) {
  const { data } = await supabase
    .from('capsules')
    .select('id, rules')
    .eq('context_id', contextId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

async function saveRules(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, contextId: string, rules: Rule[]) {
  const existing = await getLatestCapsule(supabase, contextId)
  if (existing?.id) {
    const { error } = await supabase.from('capsules').update({ rules }).eq('id', existing.id)
    if (error) throw new Error('Failed to update rules')
  } else {
    const { error } = await supabase.from('capsules').insert({ context_id: contextId, rules })
    if (error) throw new Error('Failed to insert rules')
  }
}

async function verifyOwnership(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, contextId: string, userId: string) {
  const { data } = await supabase.from('contexts').select('reviewer_id').eq('id', contextId).single()
  return data?.reviewer_id === userId
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const owned = await verifyOwnership(supabase, id, user.id)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const capsule = await getLatestCapsule(supabase, id)
  const rules = ((capsule?.rules ?? []) as Rule[])
  return NextResponse.json({ rules })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const owned = await verifyOwnership(supabase, id, user.id)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

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

  const capsule = await getLatestCapsule(supabase, id)
  const rules = ((capsule?.rules ?? []) as Rule[])
  const newRule: Rule = { verb: body.verb as Rule['verb'], domain: body.domain as Rule['domain'], text: body.text.trim() }
  rules.push(newRule)

  try {
    await saveRules(supabase, id, rules)
  } catch (e) {
    return NextResponse.json({ error: 'Failed to save rule' }, { status: 500 })
  }

  return NextResponse.json({ rules })
}
