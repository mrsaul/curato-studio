import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getReviewerQueue } from '@/lib/requests'
import { CreativeRequest } from '@/types/request'

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return 'Just now'
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const SOURCE_LABEL: Record<string, string> = {
  text:  'TEXT',
  voice: 'VOICE',
  photo: 'PHOTO',
}

function QueueCard({ request, index }: { request: CreativeRequest; index: number }) {
  const input = request.transcript ?? request.raw_text ?? ''
  const preview = input ? (input.length > 140 ? input.slice(0, 140) + '…' : input) : null

  return (
    <Link
      href={`/queue/${request.id}`}
      style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
    >
      <article style={{
        background: 'var(--surface)',
        borderRadius: 14,
        marginBottom: 10,
        border: '1px solid var(--line-soft)',
        padding: '16px 18px',
        cursor: 'pointer',
        transition: 'border-color 0.12s',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Index indicator */}
        <span style={{
          position: 'absolute', top: 16, right: 16,
          fontSize: 11, fontFamily: 'var(--mono)',
          color: 'var(--ink-faint)', letterSpacing: '0.04em',
        }}>
          #{index + 1}
        </span>

        {/* Top row: source + time */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{
            fontSize: 10, fontFamily: 'var(--mono)', letterSpacing: '0.1em',
            color: 'var(--violet)', textTransform: 'uppercase',
            background: 'rgba(74,61,176,0.1)', borderRadius: 4, padding: '2px 7px',
          }}>
            {SOURCE_LABEL[request.source_type] ?? request.source_type}
          </span>
          <span style={{ fontSize: 11, color: 'var(--ink-faint)', fontFamily: 'var(--mono)' }}>
            {timeAgo(request.created_at)}
          </span>
        </div>

        {/* Preview text */}
        {preview ? (
          <p style={{
            fontSize: 14, color: 'var(--ink)', lineHeight: 1.6,
            marginBottom: request.intent_summary ? 10 : 14,
          }}>
            {preview}
          </p>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--ink-faint)', fontStyle: 'italic', marginBottom: 14 }}>
            {request.source_type === 'photo' ? 'Photo upload' : 'Media post'}
          </p>
        )}

        {/* Intent summary */}
        {request.intent_summary && (
          <p style={{
            fontSize: 12, color: 'var(--violet)', lineHeight: 1.5,
            fontStyle: 'italic', marginBottom: 14,
          }}>
            {request.intent_summary}
          </p>
        )}

        {/* Bottom: Review CTA */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{
            fontSize: 11, fontFamily: 'var(--mono)', letterSpacing: '0.06em',
            textTransform: 'uppercase', color: 'var(--ink-soft)',
          }}>
            Review brief
          </span>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 7h10M8 3l4 4-4 4" stroke="var(--ink-soft)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </article>
    </Link>
  )
}

export default async function QueuePage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const queue = await getReviewerQueue(supabase, user.id)

  return (
    <div style={{ paddingTop: 28, paddingBottom: 32 }}>
      <p style={{
        fontSize: 10, fontFamily: 'var(--mono)', letterSpacing: '0.12em',
        textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 6,
      }}>
        Art Director
      </p>
      <h1 style={{
        fontFamily: 'var(--display)', fontSize: 26, fontWeight: 400,
        letterSpacing: '-0.02em', color: 'var(--ink)', marginBottom: 4,
      }}>
        Review queue
      </h1>
      <p style={{
        fontSize: 13, color: 'var(--ink-faint)', marginBottom: 28, fontFamily: 'var(--mono)',
      }}>
        {queue.length === 0
          ? 'All clear — nothing pending.'
          : `${queue.length} brief${queue.length !== 1 ? 's' : ''} waiting for your direction`}
      </p>

      {queue.length === 0 ? (
        <div style={{
          textAlign: 'center', paddingTop: 48,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'var(--line-soft)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M4 10l4 4 8-8" stroke="var(--ink-faint)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <p style={{ fontSize: 13, color: 'var(--ink-faint)' }}>
            Your creators will appear here when they send new briefs.
          </p>
        </div>
      ) : (
        queue.map((r, i) => <QueueCard key={r.id} request={r} index={i} />)
      )}
    </div>
  )
}
