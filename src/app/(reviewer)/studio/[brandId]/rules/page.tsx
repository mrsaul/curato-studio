import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { Rule } from '@/types/brand'
import RulesClient from './RulesClient'

export default async function RulesPage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: ctx } = await supabase.from('contexts').select('name, reviewer_id').eq('id', brandId).single()
  if (!ctx || ctx.reviewer_id !== user.id) redirect('/studio')

  const { data: capsule } = await supabase
    .from('capsules').select('rules').eq('context_id', brandId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  const rules = ((capsule?.rules ?? []) as Rule[])

  return (
    <div style={{ paddingTop: 24, paddingBottom: 100 }}>
      <Link href={`/studio/${brandId}`} style={{ textDecoration: 'none', fontSize: 12, color: 'var(--ink-faint)', display: 'block', marginBottom: 12 }}>← {ctx.name}</Link>
      <h1 style={{ fontSize: 22, fontWeight: 400, color: 'var(--ink)', marginBottom: 20 }}>Rules</h1>
      <RulesClient brandId={brandId} initialRules={rules} />
    </div>
  )
}
