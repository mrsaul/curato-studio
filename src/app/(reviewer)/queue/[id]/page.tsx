import { redirect, notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getRequest, getRequestDraft } from '@/lib/requests'
import ReviewActions from './ReviewActions'

export default async function RequestDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const request = await getRequest(supabase, params.id)
  if (!request || request.reviewer_id !== user.id) notFound()

  const draft = await getRequestDraft(supabase, request.id)

  return (
    <div style={{ paddingTop: 24, paddingBottom: 32 }}>
      {/* Original input */}
      <section style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-faint)', textTransform: 'uppercase', marginBottom: 8 }}>
          Original — {request.source_type}
        </p>
        <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '12px 14px' }}>
          <p style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.6 }}>
            {request.transcript ?? request.raw_text ?? '(media)'}
          </p>
        </div>
      </section>

      {/* Claude's interpretation */}
      {request.intent_summary && (
        <section style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-faint)', textTransform: 'uppercase', marginBottom: 8 }}>
            Interpretation
          </p>
          <p style={{ fontSize: 14, color: 'var(--violet)', lineHeight: 1.5 }}>
            {request.intent_summary}
          </p>
        </section>
      )}

      {/* Draft */}
      {draft ? (
        <>
          <section style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-faint)', textTransform: 'uppercase', marginBottom: 8 }}>
              Caption options
            </p>
            {draft.caption_options.map((opt, i) => (
              <div key={i} style={{
                background: opt.style === 'warm' ? 'var(--surface)' : 'var(--bg)',
                borderRadius: 10, padding: '12px 14px', marginBottom: 8,
                border: draft.recommended_caption === opt.text ? '2px solid var(--violet)' : '1px solid var(--line-soft)',
              }}>
                <p style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-faint)', marginBottom: 4, textTransform: 'uppercase' }}>
                  {opt.style}{draft.recommended_caption === opt.text ? ' ← recommended' : ''}
                </p>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--ink)' }}>{opt.text}</p>
              </div>
            ))}
          </section>

          {draft.cta && (
            <section style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-faint)', textTransform: 'uppercase', marginBottom: 6 }}>CTA</p>
              <p style={{ fontSize: 14, color: 'var(--ink)' }}>{draft.cta}</p>
            </section>
          )}

          {draft.hashtags.length > 0 && (
            <section style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-faint)', textTransform: 'uppercase', marginBottom: 6 }}>Hashtags</p>
              <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{draft.hashtags.join(' ')}</p>
            </section>
          )}

          {draft.visual_brief && (
            <section style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-faint)', textTransform: 'uppercase', marginBottom: 6 }}>Visual brief</p>
              <p style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.5 }}>{draft.visual_brief}</p>
            </section>
          )}

          {draft.flags.length > 0 && (
            <section style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--amber)', textTransform: 'uppercase', marginBottom: 6 }}>Flags</p>
              {draft.flags.map((f, i) => (
                <p key={i} style={{ fontSize: 13, color: 'var(--amber)', marginBottom: 4 }}>
                  {f.type}: {f.note}
                </p>
              ))}
            </section>
          )}

          {/* Review actions (client component) */}
          {request.status === 'awaiting_review' && (
            <ReviewActions requestId={request.id} defaultCaption={draft.recommended_caption ?? draft.caption_options[0]?.text ?? ''} />
          )}

          {request.status !== 'awaiting_review' && (
            <p style={{ fontSize: 14, color: 'var(--ink-faint)', textAlign: 'center', marginTop: 24 }}>
              This request is {request.status}.
            </p>
          )}
        </>
      ) : (
        <p style={{ color: 'var(--ink-faint)', fontSize: 14 }}>Draft is being generated…</p>
      )}
    </div>
  )
}
