import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getReviewerHistory } from '@/lib/requests'
import { CreativeRequest, RequestStatus } from '@/types/request'

const STATUS_META: Record<RequestStatus, { label: string; color: string }> = {
  new:               { label: 'Received',       color: 'var(--ink-faint)' },
  interpreting:      { label: 'Processing',      color: 'var(--amber)' },
  needs_info:        { label: 'Awaiting reply',  color: 'var(--amber)' },
  draft_ready:       { label: 'Draft ready',     color: 'var(--amber)' },
  awaiting_review:   { label: 'In queue',        color: 'var(--violet)' },
  approved:          { label: 'Approved',         color: 'var(--green)' },
  changes_requested: { label: 'Changes sent',    color: 'var(--amber)' },
  declined:          { label: 'Declined',         color: 'var(--red)' },
  delivered:         { label: 'Delivered',        color: 'var(--green)' },
}

const SOURCE_LABEL: Record<string, string> = {
  text:  'TEXT',
  voice: 'VOICE',
  photo: 'PHOTO',
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return 'Just now'
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function HistoryCard({ request }: { request: CreativeRequest }) {
  const meta = STATUS_META[request.status]
  const input = request.transcript ?? request.raw_text ?? ''
  const preview = input ? (input.length > 100 ? input.slice(0, 100) + '…' : input) : null

  return (
    <article style={{
      background: 'var(--surface)',
      borderRadius: 14,
      marginBottom: 10,
      border: '1px solid var(--line-soft)',
      overflow: 'hidden',
    }}>
      <div style={{ height: 3, background: meta.color, opacity: 0.5 }} />
      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{
            fontSize: 10, fontFamily: 'var(--mono)', letterSpacing: '0.1em',
            color: 'var(--ink-faint)', textTransform: 'uppercase',
            background: 'var(--line-soft)', borderRadius: 4, padding: '2px 6px',
          }}>
            {SOURCE_LABEL[request.source_type] ?? request.source_type}
          </span>
          <span style={{ fontSize: 11, color: 'var(--ink-faint)', fontFamily: 'var(--mono)' }}>
            {timeAgo(request.created_at)}
          </span>
        </div>

        {preview ? (
          <p style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.55, marginBottom: 10 }}>
            {preview}
          </p>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--ink-faint)', fontStyle: 'italic', marginBottom: 10 }}>
            {request.source_type === 'photo' ? 'Photo upload' : 'Media post'}
          </p>
        )}

        {request.intent_summary && (
          <p style={{
            fontSize: 12, color: 'var(--violet)', lineHeight: 1.45,
            fontStyle: 'italic', marginBottom: 10,
          }}>
            {request.intent_summary}
          </p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: meta.color, display: 'inline-block', flexShrink: 0,
          }} />
          <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: meta.color, letterSpacing: '0.03em' }}>
            {meta.label}
          </span>
        </div>
      </div>
    </article>
  )
}

export default async function HistoryPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const history = await getReviewerHistory(supabase, user.id)

  const approved = history.filter(r => r.status === 'approved' || r.status === 'delivered')
  const other = history.filter(r => r.status !== 'approved' && r.status !== 'delivered')

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
        letterSpacing: '-0.02em', color: 'var(--ink)', marginBottom: 28,
      }}>
        Reviewed
      </h1>

      {history.length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: 48 }}>
          <p style={{ fontSize: 14, color: 'var(--ink-faint)', lineHeight: 1.6 }}>
            Reviewed briefs will appear here after you approve or decline them.
          </p>
        </div>
      ) : (
        <>
          {approved.length > 0 && (
            <section style={{ marginBottom: 32 }}>
              <p style={{
                fontSize: 10, fontFamily: 'var(--mono)', letterSpacing: '0.1em',
                textTransform: 'uppercase', color: 'var(--green)', marginBottom: 12,
              }}>
                Approved · {approved.length}
              </p>
              {approved.map(r => <HistoryCard key={r.id} request={r} />)}
            </section>
          )}
          {other.length > 0 && (
            <section>
              <p style={{
                fontSize: 10, fontFamily: 'var(--mono)', letterSpacing: '0.1em',
                textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 12,
              }}>
                Other · {other.length}
              </p>
              {other.map(r => <HistoryCard key={r.id} request={r} />)}
            </section>
          )}
        </>
      )}
    </div>
  )
}
