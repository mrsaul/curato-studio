import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: memberships, error: membershipsError } = await supabase
    .from('brand_members')
    .select('context_id')
    .eq('user_id', user.id)

  if (membershipsError) return NextResponse.json({ error: 'Failed to load brands' }, { status: 500 })
  if (!memberships || memberships.length === 0) {
    return NextResponse.json({ brands: [] })
  }

  const contextIds = memberships.map(m => m.context_id)
  const service = createServiceSupabaseClient()

  const { data: contexts, error: contextsError } = await service
    .from('contexts')
    .select('id, name, description, user_id')
    .in('id', contextIds)

  if (contextsError) return NextResponse.json({ error: 'Failed to load brand details' }, { status: 500 })

  let brands
  try {
    brands = await Promise.all((contexts ?? []).map(async (ctx) => {
      const [capsuleResult, templateResult, assetResult] = await Promise.all([
        service.from('capsules').select('rules')
          .eq('context_id', ctx.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        service.from('templates').select('id', { count: 'exact', head: true })
          .eq('context_id', ctx.id).eq('active', true),
        service.from('brand_assets').select('id', { count: 'exact', head: true })
          .eq('context_id', ctx.id),
      ])
      if (capsuleResult.error) throw capsuleResult.error
      if (templateResult.error) throw templateResult.error
      if (assetResult.error) throw assetResult.error
      const rules = (capsuleResult.data?.rules ?? []) as unknown[]
      return {
        id: ctx.id,
        name: ctx.name,
        description: ctx.description ?? '',
        reviewerId: ctx.user_id,
        ruleCount: rules.length,
        templateCount: templateResult.count ?? 0,
        assetCount: assetResult.count ?? 0,
      }
    }))
  } catch {
    return NextResponse.json({ error: 'Failed to load brand details' }, { status: 500 })
  }

  return NextResponse.json({ brands })
}
