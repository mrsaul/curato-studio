import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getReviewerQueue } from '@/lib/requests'
import { CreativeRequest } from '@/types/request'

function QueueCard({ request }: { request: CreativeRequest }) {
  const preview = (request.transcript ?? request.raw_text ?? '').slice(0, 100)

  return (
    <Link href={`/queue/${request.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 12, padding: '14px 16px',
        border: '1px solid var(--line-soft)', marginBottom: 12,
        cursor: 'pointer',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--ink-faint)', textTransform: 'uppercase' }}>
            {request.source_type}
          </span>
          <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
            {new Date(request.created_at).toLocaleDateString()}
          </span>
        </div>
        <p style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.5 }}>
          {preview || '(media upload)'}
          {preview.length >= 100 ? '…' : ''}
        </p>
        {request.intent_summary && (
          <p style={{ fontSize: 13, color: 'var(--violet)', marginTop: 6, lineHeight: 1.4 }}>
            {request.intent_summary}
          </p>
        )}
      </div>
    </Link>
  )
}

export default async function QueuePage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const queue = await getReviewerQueue(supabase, user.id)

  return (
    <div style={{ paddingTop: 24, paddingBottom: 32 }}>
      <p style={{ fontSize: 18, fontFamily: 'var(--display)', marginBottom: 6 }}>
        Review queue
      </p>
      <p style={{ fontSize: 13, color: 'var(--ink-faint)', marginBottom: 24 }}>
        {queue.length === 0 ? 'All clear.' : `${queue.length} request${queue.length !== 1 ? 's' : ''} waiting`}
      </p>
      {queue.map(r => <QueueCard key={r.id} request={r} />)}
    </div>
  )
}
