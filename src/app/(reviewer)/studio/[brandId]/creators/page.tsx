import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'
import CreatorsClient from './CreatorsClient'

export default async function CreatorsPage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: ctx } = await supabase
    .from('contexts').select('id, name, user_id').eq('id', brandId).single()
  if (!ctx || ctx.user_id !== user.id) redirect('/studio')

  const service = createServiceSupabaseClient()

  // Get or create invite token
  let { data: invite } = await service
    .from('brand_invites').select('token').eq('context_id', brandId).single()
  if (!invite) {
    const { data: newInvite } = await service
      .from('brand_invites').insert({ context_id: brandId }).select('token').single()
    invite = newInvite
  }

  // Get members
  const { data: members } = await service
    .from('brand_members')
    .select('user_id, email, joined_at')
    .eq('context_id', brandId)
    .order('joined_at', { ascending: true })

  // Get request counts per member
  const memberIds = (members ?? []).map(m => m.user_id)
  const counts: Record<string, number> = {}
  if (memberIds.length > 0) {
    const { data: reqs } = await service
      .from('creative_requests')
      .select('contributor_id')
      .eq('context_id', brandId)
      .in('contributor_id', memberIds)
    for (const row of reqs ?? []) {
      counts[row.contributor_id] = (counts[row.contributor_id] ?? 0) + 1
    }
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://curato.app'
  const token = invite?.token ?? ''
  const inviteUrl = token ? `${base}/join/${token}` : ''

  return (
    <div style={{ paddingTop: 24, paddingBottom: 100 }}>
      <Link href={`/studio/${brandId}`} style={{ textDecoration: 'none', fontSize: 12, color: 'var(--ink-faint)', display: 'block', marginBottom: 12 }}>
        ← {ctx.name}
      </Link>
      <h1 style={{ fontSize: 26, fontWeight: 400, color: 'var(--ink)', marginBottom: 4 }}>Creators</h1>
      <p style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 24 }}>People working on this brand</p>

      <CreatorsClient
        brandId={brandId}
        initialMembers={(members ?? []).map(m => ({
          userId: m.user_id,
          email: m.email,
          joinedAt: m.joined_at,
          requestCount: counts[m.user_id] ?? 0,
        }))}
        initialToken={token}
        inviteUrl={inviteUrl}
      />
    </div>
  )
}
