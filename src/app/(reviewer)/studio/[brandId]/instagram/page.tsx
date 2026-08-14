import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'
import { InstagramAccount } from '@/types/instagram'
import InstagramClient from './InstagramClient'

export default async function InstagramPage({
  params,
}: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: ctx } = await supabase
    .from('contexts').select('name, user_id').eq('id', brandId).single()
  if (!ctx || ctx.user_id !== user.id) redirect('/studio')

  const service = createServiceSupabaseClient()
  const { data: account } = await service
    .from('instagram_accounts')
    .select('ig_user_id, username, token_expires_at, needs_reconnect')
    .eq('context_id', brandId)
    .maybeSingle<Pick<InstagramAccount,
      'ig_user_id' | 'username' | 'token_expires_at' | 'needs_reconnect'>>()

  return (
    <div style={{ paddingTop: 24, paddingBottom: 100 }}>
      <Link href={`/studio/${brandId}`} style={{
        textDecoration: 'none', fontSize: 'var(--text-base)',
        color: 'var(--ink-faint)', display: 'inline-flex',
        alignItems: 'center', minHeight: 'var(--touch)',
      }}>
        ← {ctx.name}
      </Link>
      <h1 style={{
        fontSize: 'var(--text-xl)', fontWeight: 400, fontFamily: 'var(--display)',
        color: 'var(--ink)', marginBottom: 'var(--space-5)',
      }}>
        Instagram
      </h1>
      <InstagramClient
        brandId={brandId}
        account={account ? {
          username: account.username,
          expiresAt: account.token_expires_at,
          needsReconnect: account.needs_reconnect,
        } : null}
      />
    </div>
  )
}
