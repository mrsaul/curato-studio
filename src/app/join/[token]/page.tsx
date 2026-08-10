import { redirect } from 'next/navigation'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'
import JoinClient from './JoinClient'

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceSupabaseClient()

  const { data: invite } = await service
    .from('brand_invites').select('context_id').eq('token', token).single()

  if (!invite) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg)' }}>
        <p style={{ fontSize: 16, color: 'var(--ink)', marginBottom: 16 }}>
          This invite link is no longer valid.
        </p>
        <a href="/submit" style={{ color: 'var(--violet)', fontSize: 14, textDecoration: 'none' }}>
          ← Go to app
        </a>
      </div>
    )
  }

  const { data: ctx } = await service
    .from('contexts').select('name').eq('id', invite.context_id).single()

  // Check if already a member
  const { data: existing } = await service
    .from('brand_members')
    .select('id')
    .eq('context_id', invite.context_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg)' }}>
        <p style={{ fontSize: 16, color: 'var(--ink)', marginBottom: 8 }}>
          You&apos;re already connected to {ctx?.name ?? 'this brand'}.
        </p>
        <a href="/submit" style={{ color: 'var(--violet)', fontSize: 14, textDecoration: 'none' }}>
          Start creating →
        </a>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: 360, textAlign: 'center' }}>
        <JoinClient token={token} brandName={ctx?.name ?? 'this brand'} />
      </div>
    </div>
  )
}
