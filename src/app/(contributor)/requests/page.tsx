import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getContributorRequests } from '@/lib/requests'
import RequestsClient from './RequestsClient'

export default async function RequestsPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const requests = await getContributorRequests(supabase, user.id)

  const { data: attempts } = await supabase
    .from('publish_attempts')
    .select('request_id, format, permalink')
    .eq('status', 'published')

  const publishedByRequest: Record<string, { format: 'feed' | 'story'; permalink: string | null }[]> = {}
  for (const a of attempts ?? []) {
    ;(publishedByRequest[a.request_id] ??= []).push({ format: a.format, permalink: a.permalink })
  }

  return (
    <div style={{ paddingTop: 28, paddingBottom: 32 }}>
      <p style={{
        fontSize: 'var(--text-xs)', fontFamily: 'var(--mono)',
        letterSpacing: 'var(--tracking-widest)', textTransform: 'uppercase',
        color: 'var(--ink-faint)', marginBottom: 6,
      }}>
        Your work
      </p>
      <h1 style={{
        fontFamily: 'var(--display)', fontSize: 'var(--text-2xl)', fontWeight: 400,
        letterSpacing: '-0.02em', color: 'var(--ink)', marginBottom: 'var(--space-6)',
      }}>
        Posts
      </h1>

      {requests.length === 0 ? (
        <div style={{ paddingTop: 40, textAlign: 'center' }}>
          <p style={{
            fontSize: 'var(--text-md)', color: 'var(--ink-faint)',
            lineHeight: 'var(--leading-relaxed)',
          }}>
            Nothing here yet.<br />Head to Create to start your first post.
          </p>
        </div>
      ) : (
        <RequestsClient requests={requests} publishedByRequest={publishedByRequest} />
      )}
    </div>
  )
}
