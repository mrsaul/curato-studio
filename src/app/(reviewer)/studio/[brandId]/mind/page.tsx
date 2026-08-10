import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { Judgment } from '@/types/brand'
import MindClient from './MindClient'

export default async function MindPage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: ctx } = await supabase.from('contexts').select('name, user_id').eq('id', brandId).single()
  if (!ctx || ctx.user_id !== user.id) redirect('/studio')

  const { data: all } = await supabase
    .from('judgments').select('id, verb, statement, status, created_at')
    .eq('context_id', brandId).in('status', ['proposed', 'confirmed'])
    .order('created_at', { ascending: false })

  const pending = (all ?? []).filter(j => j.status === 'proposed') as Judgment[]
  const confirmed = (all ?? []).filter(j => j.status === 'confirmed') as Judgment[]

  return (
    <div style={{ paddingTop: 24, paddingBottom: 100 }}>
      <Link href={`/studio/${brandId}`} style={{ textDecoration: 'none', fontSize: 12, color: 'var(--ink-faint)', display: 'block', marginBottom: 12 }}>← {ctx.name}</Link>
      <h1 style={{ fontSize: 22, fontWeight: 400, color: 'var(--ink)', marginBottom: 4 }}>Mind</h1>
      <p style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 20 }}>AI learns from every review. Confirm what's right, reject what's wrong.</p>
      <MindClient brandId={brandId} initialPending={pending} initialConfirmed={confirmed} />
    </div>
  )
}
