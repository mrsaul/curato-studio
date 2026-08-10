import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { AtelierBrand } from '@/types/brand'

export default async function StudioPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: contexts } = await supabase
    .from('contexts')
    .select('id, name, description')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  const brands: AtelierBrand[] = await Promise.all((contexts ?? []).map(async (ctx) => {
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

  return (
    <div style={{ paddingTop: 24, paddingBottom: 100 }}>
      <p style={{ fontSize: 9, fontFamily: 'var(--mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 4 }}>
        ART DIRECTOR
      </p>
      <h1 style={{ fontSize: 26, fontWeight: 400, color: 'var(--ink)', marginBottom: 20 }}>Studio</h1>

      {brands.map(brand => (
        <Link key={brand.id} href={`/studio/${brand.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block', marginBottom: 10 }}>
          <div style={{
            background: 'var(--surface)', borderRadius: 14, padding: '14px 16px',
            border: '1px solid var(--line-soft)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink)' }}>{brand.name}</span>
              {brand.pendingMindCount > 0 && (
                <span style={{
                  fontSize: 9, fontFamily: 'var(--mono)', background: '#fffbe6',
                  color: '#b8920a', borderRadius: 4, padding: '2px 6px',
                }}>
                  {brand.pendingMindCount} pending
                </span>
              )}
            </div>
            {brand.description && (
              <p style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 8 }}>{brand.description}</p>
            )}
            <p style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--ink-faint)', letterSpacing: '0.04em' }}>
              {brand.ruleCount} rules · {brand.templateCount} templates · {brand.assetCount} assets
            </p>
          </div>
        </Link>
      ))}

      <Link href="/studio/new" style={{ textDecoration: 'none', display: 'block' }}>
        <div style={{
          border: '1.5px dashed var(--line-soft)', borderRadius: 14, padding: '14px 16px',
          textAlign: 'center', color: 'var(--violet)', fontSize: 13,
        }}>
          + New brand
        </div>
      </Link>
    </div>
  )
}
