import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: contexts } = await supabase
    .from('contexts')
    .select('id, name, description')
    .eq('reviewer_id', user.id)
    .order('created_at', { ascending: true })

  if (!contexts) return NextResponse.json({ brands: [] })

  const brands = await Promise.all(contexts.map(async (ctx) => {
    const [capsule, pending, templates, assets] = await Promise.all([
      supabase.from('capsules').select('rules').eq('context_id', ctx.id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('judgments').select('id', { count: 'exact', head: true })
        .eq('context_id', ctx.id).eq('status', 'proposed'),
      supabase.from('templates').select('id', { count: 'exact', head: true })
        .eq('context_id', ctx.id).eq('active', true),
      supabase.from('brand_assets').select('id', { count: 'exact', head: true })
        .eq('context_id', ctx.id),
    ])
    const rules = (capsule.data?.rules ?? []) as unknown[]
    return {
      id: ctx.id,
      name: ctx.name,
      description: ctx.description ?? '',
      ruleCount: rules.length,
      pendingMindCount: pending.count ?? 0,
      templateCount: templates.count ?? 0,
      assetCount: assets.count ?? 0,
    }
  }))

  return NextResponse.json({ brands })
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { name?: string; description?: string }
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('contexts')
    .insert({ name: body.name.trim(), description: body.description?.trim() ?? '', reviewer_id: user.id })
    .select('id, name, description')
    .single()

  if (error) return NextResponse.json({ error: 'Failed to create brand' }, { status: 500 })
  return NextResponse.json({ brand: data })
}
