import { redirect } from 'next/navigation'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'
import BrandPickerClient from './BrandPickerClient'

export default async function SubmitPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: memberships, error: membershipsError } = await supabase
    .from('brand_members')
    .select('context_id')
    .eq('user_id', user.id)

  if (membershipsError) redirect('/login')

  if (!memberships || memberships.length === 0) {
    return (
      <div style={{ paddingTop: 48, paddingBottom: 32 }}>
        <div style={{
          width: 56, height: 56, borderRadius: 'var(--r-xl)',
          background: 'var(--surface)', border: '1px solid var(--line-soft)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 'var(--space-6)',
          fontSize: 24,
        }}>
          ✉️
        </div>
        <h1 style={{
          fontSize: 'var(--text-2xl)', fontWeight: 400,
          fontFamily: 'var(--display)', color: 'var(--ink)',
          marginBottom: 'var(--space-4)', lineHeight: 'var(--leading-tight)',
        }}>
          You&apos;re not connected<br />to any brand yet
        </h1>
        <div style={{ width: 32, height: 1, background: 'var(--line)', marginBottom: 'var(--space-5)' }} />
        <p style={{ fontSize: 'var(--text-base)', color: 'var(--ink-soft)', lineHeight: 'var(--leading-relaxed)', maxWidth: 280 }}>
          Ask whoever manages the brand to send you an invite link.
        </p>
      </div>
    )
  }

  const contextIds = memberships.map(m => m.context_id)
  const service = createServiceSupabaseClient()

  const { data: contexts, error: contextsError } = await service
    .from('contexts')
    .select('id, name, description, user_id')
    .in('id', contextIds)

  if (contextsError || !contexts || contexts.length === 0) redirect('/login')

  let brands
  try {
    brands = await Promise.all(contexts.map(async (ctx) => {
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
    redirect('/login')
  }

  // 1 brand: skip the picker, go directly to input
  if (brands.length === 1) {
    const b = brands[0]
    redirect(`/submit/input?brandId=${b.id}&reviewerId=${b.reviewerId}`)
  }

  return <BrandPickerClient brands={brands} />
}
