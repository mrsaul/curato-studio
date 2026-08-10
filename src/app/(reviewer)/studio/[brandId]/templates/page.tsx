import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { AtelierTemplate } from '@/types/brand'
import TemplatesClient from './TemplatesClient'

export default async function TemplatesPage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: ctx } = await supabase.from('contexts').select('name, user_id').eq('id', brandId).single()
  if (!ctx || ctx.user_id !== user.id) redirect('/studio')

  const { data: templates } = await supabase
    .from('templates').select('id, context_id, name, type, description, active, created_at')
    .eq('context_id', brandId).eq('reviewer_id', user.id)
    .order('created_at', { ascending: true })

  return (
    <div style={{ paddingTop: 24, paddingBottom: 100 }}>
      <Link href={`/studio/${brandId}`} style={{ textDecoration: 'none', fontSize: 12, color: 'var(--ink-faint)', display: 'block', marginBottom: 12 }}>← {ctx.name}</Link>
      <h1 style={{ fontSize: 22, fontWeight: 400, color: 'var(--ink)', marginBottom: 20 }}>Templates</h1>
      <TemplatesClient brandId={brandId} initialTemplates={(templates ?? []) as AtelierTemplate[]} />
    </div>
  )
}
