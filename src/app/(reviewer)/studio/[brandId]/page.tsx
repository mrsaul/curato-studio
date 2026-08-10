import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export default async function BrandDetailPage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: ctx } = await supabase
    .from('contexts').select('id, name, description, user_id').eq('id', brandId).single()
  if (!ctx || ctx.user_id !== user.id) redirect('/studio')

  const [capsule, pending, templates, assets] = await Promise.all([
    supabase.from('capsules').select('rules').eq('context_id', brandId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('judgments').select('id', { count: 'exact', head: true })
      .eq('context_id', brandId).eq('status', 'proposed'),
    supabase.from('templates').select('id', { count: 'exact', head: true })
      .eq('context_id', brandId).eq('active', true),
    supabase.from('brand_assets').select('id', { count: 'exact', head: true })
      .eq('context_id', brandId),
  ])

  const ruleCount = ((capsule.data?.rules ?? []) as unknown[]).length
  const pendingMindCount = pending.count ?? 0
  const templateCount = templates.count ?? 0
  const assetCount = assets.count ?? 0

  const tiles = [
    { label: 'Rules', sub: 'voice & style', count: ruleCount, href: `/studio/${brandId}/rules`, pending: false },
    { label: 'Mind', sub: pendingMindCount > 0 ? 'need review' : 'up to date', count: pendingMindCount, href: `/studio/${brandId}/mind`, pending: pendingMindCount > 0 },
    { label: 'Templates', sub: 'post formats', count: templateCount, href: `/studio/${brandId}/templates`, pending: false },
    { label: 'Assets', sub: 'images & files', count: assetCount, href: `/studio/${brandId}/assets`, pending: false },
  ]

  return (
    <div style={{ paddingTop: 24, paddingBottom: 100 }}>
      <Link href="/studio" style={{ textDecoration: 'none', fontSize: 12, color: 'var(--ink-faint)', display: 'block', marginBottom: 12 }}>← Studio</Link>
      <h1 style={{ fontSize: 26, fontWeight: 400, color: 'var(--ink)', marginBottom: 2 }}>{ctx.name}</h1>
      {ctx.description && <p style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 20 }}>{ctx.description}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
        {tiles.map(tile => (
          <Link key={tile.href} href={tile.href} style={{ textDecoration: 'none' }}>
            <div style={{
              background: tile.pending ? '#fffbe8' : 'var(--surface)',
              border: `1px solid ${tile.pending ? '#f0d060' : 'var(--line-soft)'}`,
              borderRadius: 14, padding: 14,
            }}>
              <p style={{ fontSize: 9, fontFamily: 'var(--mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: tile.pending ? '#c9960a' : 'var(--ink-faint)', marginBottom: 6 }}>
                {tile.label}{tile.pending ? ' ●' : ''}
              </p>
              <p style={{ fontSize: 28, fontWeight: 300, color: 'var(--ink)', lineHeight: 1, marginBottom: 4 }}>{tile.count}</p>
              <p style={{ fontSize: 10, color: tile.pending ? '#c9960a' : 'var(--ink-faint)' }}>{tile.sub}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
