import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

async function getOwnedBrand(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, id: string, userId: string) {
  const { data } = await supabase
    .from('contexts')
    .select('id, name, description, reviewer_id')
    .eq('id', id)
    .single()
  if (!data || data.reviewer_id !== userId) return null
  return data
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const brand = await getOwnedBrand(supabase, id, user.id)
  if (!brand) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [capsule, pending, templates, assets] = await Promise.all([
    supabase.from('capsules').select('rules').eq('context_id', id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('judgments').select('id', { count: 'exact', head: true })
      .eq('context_id', id).eq('status', 'proposed'),
    supabase.from('templates').select('id', { count: 'exact', head: true })
      .eq('context_id', id).eq('active', true),
    supabase.from('brand_assets').select('id', { count: 'exact', head: true })
      .eq('context_id', id),
  ])
  const rules = (capsule.data?.rules ?? []) as unknown[]

  return NextResponse.json({
    brand: {
      id: brand.id, name: brand.name, description: brand.description ?? '',
      ruleCount: rules.length,
      pendingMindCount: pending.count ?? 0,
      templateCount: templates.count ?? 0,
      assetCount: assets.count ?? 0,
    }
  })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const brand = await getOwnedBrand(supabase, id, user.id)
  if (!brand) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: { name?: string; description?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const updates: Record<string, string> = {}
  if (body.name?.trim()) updates.name = body.name.trim()
  if (body.description !== undefined) updates.description = body.description.trim()

  const { data, error } = await supabase
    .from('contexts')
    .update(updates)
    .eq('id', id)
    .select('id, name, description')
    .single()

  if (error) return NextResponse.json({ error: 'Failed to update brand' }, { status: 500 })
  return NextResponse.json({ brand: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const brand = await getOwnedBrand(supabase, id, user.id)
  if (!brand) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await supabase.from('contexts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Failed to delete brand' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
