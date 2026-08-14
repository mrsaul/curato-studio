import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'
import { StatTile } from '@/components/ui'

export default async function BrandDetailPage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: ctx } = await supabase
    .from('contexts').select('id, name, description, user_id').eq('id', brandId).single()
  if (!ctx || ctx.user_id !== user.id) redirect('/studio')

  const service = createServiceSupabaseClient()

  const [capsule, pending, templates, assets, members, instagram] = await Promise.all([
    supabase.from('capsules').select('rules').eq('context_id', brandId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('judgments').select('id', { count: 'exact', head: true })
      .eq('context_id', brandId).eq('status', 'proposed'),
    supabase.from('templates').select('id', { count: 'exact', head: true })
      .eq('context_id', brandId).eq('active', true),
    supabase.from('brand_assets').select('id', { count: 'exact', head: true })
      .eq('context_id', brandId),
    supabase.from('brand_members').select('id', { count: 'exact', head: true })
      .eq('context_id', brandId),
    service.from('instagram_accounts').select('needs_reconnect').eq('context_id', brandId).maybeSingle(),
  ])

  const ruleCount = ((capsule.data?.rules ?? []) as unknown[]).length
  const pendingMindCount = pending.count ?? 0
  const templateCount = templates.count ?? 0
  const assetCount = assets.count ?? 0
  const memberCount = members.count ?? 0
  const igConnected = !!instagram.data
  const igNeedsReconnect = instagram.data?.needs_reconnect ?? false

  const tiles = [
    { label: 'Rules', sub: 'voice & style', count: ruleCount, href: `/studio/${brandId}/rules`, pending: false, wide: false },
    { label: 'Mind', sub: pendingMindCount > 0 ? 'need review' : 'up to date', count: pendingMindCount, href: `/studio/${brandId}/mind`, pending: pendingMindCount > 0, wide: false },
    { label: 'Templates', sub: 'post formats', count: templateCount, href: `/studio/${brandId}/templates`, pending: false, wide: false },
    { label: 'Assets', sub: 'images & files', count: assetCount, href: `/studio/${brandId}/assets`, pending: false, wide: false },
    { label: 'Instagram', sub: igNeedsReconnect ? 'reconnect needed' : (igConnected ? 'connected' : 'not connected'), count: igConnected ? 1 : 0, href: `/studio/${brandId}/instagram`, pending: igNeedsReconnect, wide: false },
    { label: 'Creators', sub: memberCount === 0 ? 'none yet' : 'active', count: memberCount, href: `/studio/${brandId}/creators`, pending: false, wide: true },
  ]

  return (
    <div style={{ paddingTop: 24, paddingBottom: 100 }}>
      <Link href="/studio" style={{ textDecoration: 'none', fontSize: 12, color: 'var(--ink-faint)', display: 'block', marginBottom: 12 }}>← Studio</Link>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 2 }}>
        <h1 style={{ fontSize: 26, fontWeight: 400, color: 'var(--ink)', margin: 0 }}>{ctx.name}</h1>
        <Link href={`/studio/${brandId}/edit`} style={{
          fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-faint)',
          textDecoration: 'none', letterSpacing: '0.04em',
        }}>Edit</Link>
      </div>
      {ctx.description && <p style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 20 }}>{ctx.description}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
        {tiles.map(tile => (
          <StatTile key={tile.href} {...tile} />
        ))}
      </div>
    </div>
  )
}
